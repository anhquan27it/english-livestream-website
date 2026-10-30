import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).resolve().parents[1] / "scripts" / "chatterbox_worker.py"
spec = importlib.util.spec_from_file_location("chatterbox_worker", source)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ChunkTests(unittest.TestCase):
    def test_short_text_and_punctuation(self):
        self.assertEqual(worker.chunks("Hello, world! Let's learn English."), ["Hello, world!", "Let's learn English."])

    def test_paragraph_is_not_truncated(self):
        text = ("English has several flexible future forms, and we practise them every day. " * 20).strip()
        result = worker.chunks(text)
        self.assertEqual(" ".join(result), text)
        self.assertTrue(all(len(part) <= 240 for part in result))

    def test_sentence_longer_than_limit(self):
        text = ("English " * 80).strip()
        self.assertEqual(" ".join(worker.chunks(text)), text)

    def test_invalid_long_token_is_not_cut_into_fake_words(self):
        with self.assertRaises(ValueError):
            worker.chunks("a" * 300)


if __name__ == "__main__":
    unittest.main()
