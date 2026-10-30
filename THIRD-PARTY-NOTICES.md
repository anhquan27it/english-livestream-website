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
