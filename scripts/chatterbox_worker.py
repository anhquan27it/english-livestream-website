"""Private stdin/stdout worker for the local EngLive Chatterbox installation."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import wave


def chunks(text, limit=240):
    """Split at punctuation/word boundaries; never silently truncate a paragraph."""
    result = []
    for sentence in re.split(r"(?<=[.!?;])\s+|\n+", text.strip()):
        while len(sentence) > limit:
            split = sentence.rfind(" ", 0, limit + 1)
            if split < 1:
                raise ValueError("A word is too long")
            result.append(sentence[:split].strip())
            sentence = sentence[split:].strip()
        if sentence:
            result.append(sentence)
    return result


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--home", required=True)
    options = args.parse_args()
    home = Path(options.home).resolve()
    config = json.loads((home / "runtime.json").read_text(encoding="utf-8"))
    os.environ["HF_HOME"] = str(home / "huggingface")
    os.environ["TORCH_HOME"] = str(home / "torch")
    os.environ["HF_HUB_OFFLINE"] = "1"
    protocol = sys.stdout
    sys.stdout = sys.stderr  # Third-party model logs must not corrupt the protocol.

    def send(message):
        protocol.write(json.dumps(message, ensure_ascii=True) + "\n")
        protocol.flush()

    model = None
    np = torch = None
    load_ms = None

    def load_model():
        nonlocal model, np, torch, load_ms
        if model is not None:
            return
        started = time.perf_counter()
        send({"type": "model", "state": "warming", "model": config["model"]})
        import numpy as numpy_module
        import torch as torch_module
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        np, torch = numpy_module, torch_module
        device = "cuda" if torch.cuda.is_available() else "cpu"
        torch.set_num_threads(min(8, os.cpu_count() or 4))
        loaded = ChatterboxTurboTTS.from_local(config["snapshot"], device=device, nano=config["model"] == "nano")
        if loaded.conds is None:
            raise RuntimeError("The official checkpoint has no built-in voice")
        model = loaded
        load_ms = round((time.perf_counter() - started) * 1000)
        send({"type": "model", "state": "ready", "model": config["model"], "loadMs": load_ms, "device": device})
    cache = home / "audio"
    cache.mkdir(parents=True, exist_ok=True)
    (home / "worker.pid").write_text(str(os.getpid()), encoding="ascii")
    send({"type": "ready", "model": config["model"]})
    for line in sys.stdin:
        request = {}
        try:
            request = json.loads(line)
            if request.get("command") == "warmup":
                load_model()
                send({"id": request["id"], "ok": True, "warmed": True, "loadMs": load_ms})
                continue
            text = request.get("text")
            if not isinstance(text, str) or not text.strip() or len(text) > 2000:
                raise ValueError("Invalid text")
            identity = json.dumps([config["revision"], "englive-v1", text], ensure_ascii=True)
            name = hashlib.sha256(identity.encode()).hexdigest() + ".wav"
            target = cache / name
            if not target.exists():
                # Cached clips work immediately, even before loading torch/model weights.
                load_model()
                audio = []
                with torch.inference_mode():
                    for part in chunks(text):
                        torch.manual_seed(42)
                        generated = model.generate(part, temperature=0.7).detach().cpu().numpy().reshape(-1)
                        if not generated.size or not np.isfinite(generated).all():
                            raise RuntimeError("Invalid generated audio")
                        if audio:
                            audio.append(np.zeros(int(model.sr * 0.16), dtype=np.float32))
                        audio.append(generated)
                samples = np.clip(np.concatenate(audio), -1, 1)
                pcm = (samples * 32767).astype("<i2")
                temp = target.with_suffix(".tmp")
                with wave.open(str(temp), "wb") as output:
                    output.setnchannels(1)
                    output.setsampwidth(2)
                    output.setframerate(model.sr)
                    output.writeframes(pcm.tobytes())
                temp.replace(target)
                # Bound generated-audio storage; model weights are kept separately.
                files = sorted(cache.glob("*.wav"), key=lambda item: item.stat().st_mtime)
                total = sum(item.stat().st_size for item in files)
                for item in files:
                    if total <= 200 * 1024 * 1024:
                        break
                    if item != target:
                        size = item.stat().st_size
                        item.unlink(missing_ok=True)
                        total -= size
            send({"id": request["id"], "ok": True, "file": name})
        except Exception as error:
            print(f"Chatterbox generation failed: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
            send({"id": request.get("id"), "ok": False})


if __name__ == "__main__":
    main()
