"""Download the selected official checkpoint once and pin its local snapshot."""
import json
import os
from pathlib import Path
import sys

home = Path(__file__).resolve().parents[1] / "data" / "chatterbox"
os.environ["HF_HOME"] = str(home / "huggingface")
os.environ["HF_HUB_DISABLE_XET"] = "1"
from huggingface_hub import snapshot_download

model = sys.argv[1] if len(sys.argv) > 1 else "nano"
if model not in ("turbo", "nano"):
    raise ValueError("Expected turbo or nano")
snapshot = snapshot_download(
    repo_id="ResembleAI/chatterbox-" + model,
    allow_patterns=["ve.safetensors", "s3gen_meanflow.safetensors", "t3_" + model + "_v1.safetensors", "*.json", "merges.txt", "vocab.json", "conds.pt"],
)
if not (Path(snapshot) / "conds.pt").is_file():
    raise RuntimeError("The official model is missing its default voice")
for filename in ["ve.safetensors", "s3gen_meanflow.safetensors", "t3_" + model + "_v1.safetensors"]:
    if not (Path(snapshot) / filename).is_file():
        raise RuntimeError("Incomplete model: " + filename)
(home / "runtime.json").write_text(json.dumps({
    "model": model, "snapshot": str(Path(snapshot).resolve()), "revision": Path(snapshot).name,
}, indent=2), encoding="utf-8")
print("Chatterbox model prepared:", model, Path(snapshot).name)
