# Translation integration

The selection translation feature uses **AnyLang 4.0.0** by Robert Vitonsky / TranslateTools, the translation library used by [Linguist](https://github.com/translate-tools/linguist).

- Source and documentation: https://github.com/translate-tools/core
- Package: https://www.npmjs.com/package/anylang
- License: Apache-2.0 (included with the installed dependency at `node_modules/anylang/LICENSE`).
- Provider used by this application: `GoogleTranslatorTokenFree`, English to Vietnamese.

This website integrates the library, not the full Linguist browser extension. The extension's offline engine, browser controls, and personal dictionary are not bundled. Translation requires a network connection and remains subject to the provider's availability and limits.

# Pronunciation data

Pronunciations use `cmu-pronouncing-dictionary@3.0.0` by Zeke Sikelianos (ISC license, included at `node_modules/cmu-pronouncing-dictionary/license`). Its data comes from the Carnegie Mellon University [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict), copyright Carnegie Mellon University, maintained by the CMU Speech Group. The server converts its ARPABET records to broad American English IPA; this is lexical pronunciation, not a phonetic transcription of connected speech.

Words absent from CMU may use [Free Dictionary API](https://dictionaryapi.dev/) as an additional online source. Missing entries are identified explicitly; the application does not infer IPA from English spelling.

# Chatterbox text-to-speech

English speech uses [Chatterbox Nano](https://huggingface.co/ResembleAI/chatterbox-nano) by Resemble AI, MIT license. The installed source is pinned to commit `5de7a54aa4e5e2baadb0182dde554908b48b85c2`; its license is retained at `data/chatterbox/source/LICENSE`. The official `ResembleAI/chatterbox-nano` checkpoint is pinned locally to snapshot `71ccd1d0081b430592cea481f4307e764e07bc64` in `data/chatterbox/runtime.json`. The previous Turbo checkpoint and backup configuration were removed at the user's request. The shared Chatterbox Python implementation is retained because Nano uses it too.

The integration uses the checkpoint's built-in English voice. Audio generation retains Chatterbox's built-in Perth watermarking. It does not clone a user-provided voice. Python packages, checkpoints and generated audio are runtime artifacts stored under ignored `data/chatterbox/`, not shipped as source assets in Git.
