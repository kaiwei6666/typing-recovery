# McBopomofo dictionary attribution

`src/core/dictionary.js` is derived from [McBopomofo's BPMFBase.txt](https://github.com/openvanilla/McBopomofo/blob/f5ba010ce8795d283ee336ca7d16380f200bd2ec/Source/Data/BPMFBase.txt).

- Upstream: https://github.com/openvanilla/McBopomofo
- Commit: `f5ba010ce8795d283ee336ca7d16380f200bd2ec`
- Source SHA-256: `46e64a53dc9c6baa2cbe6e0b1af572f8ef6aafb50597178b5fd53df804316ce7`
- Copyright (c) 2011-2026 Mengjuei Hsieh et al.
- License: MIT, reproduced in `LICENSE.txt` in this directory.

Character transformation: retain single Han characters tagged `big5`, group by exact tonal reading, remove duplicates, and preserve upstream candidate order. Phonetic symbols and records tagged `utf8` are excluded. This deliberately limits rare/variant character coverage; Big5 membership is a repertoire filter, not a general simplified-to-traditional conversion rule. The individual character dropdown order remains upstream order, not a confidence score.

Rebuild with Node.js after downloading the pinned source:

```sh
node scripts/build-dictionary.cjs /path/to/BPMFBase.txt
```

The script verifies the source hash before writing the bundled dictionary. The extension performs no network requests for dictionary lookup.

## Phrase data and frequency counts

`src/core/phrases.js` uses these additional files from the same pinned commit:

| Source | SHA-256 |
| --- | --- |
| [BPMFMappings.txt](https://github.com/openvanilla/McBopomofo/blob/f5ba010ce8795d283ee336ca7d16380f200bd2ec/Source/Data/BPMFMappings.txt) | `baa9452ef927b3268f600ca69fe27eb0838b8be31c8ae0dd8540561db68c7ffd` |
| [phrase.occ](https://github.com/openvanilla/McBopomofo/blob/f5ba010ce8795d283ee336ca7d16380f200bd2ec/Source/Data/phrase.occ) | `2dbe37c1c61266f65d158a3e0020a0c1f2a75039ebd7f1580ef8e537a7bc8779` |

The upstream [data README](https://github.com/openvanilla/McBopomofo/blob/f5ba010ce8795d283ee336ca7d16380f200bd2ec/Source/Data/README.md) identifies the phrase mappings as originally derived from libtabe's BSD-licensed `tsi.src`, with modifications. The upstream MIT notice is retained in `LICENSE.txt`; original libtabe and associated dictionary notices, as reproduced by ICU release-77-1, are retained in `LIBTABE-NOTICE.txt`.

Transformation: retain phrases of 2–6 Han characters with positive observed frequency and exactly one supplied reading per character; each character/reading pair must exist in our bundled character dictionary. Deduplicate each phrase per reading sequence. Sort alternatives by descending occurrence count and then text for deterministic builds. The output has 95,341 reading sequences and 103,980 phrase/reading entries. Individual-character occurrence counts are included for fallback ranking. These are corpus counts, not measurements of our users or calibrated correction confidence.

```sh
node scripts/build-phrases.cjs /path/to/BPMFMappings.txt /path/to/phrase.occ
```

Both hashes are verified before generating the bundled file (approximately 4.8 MB). The original input files are not needed when running the extension. We do not use the upstream IME decoder; the bounded phrase ranker is implemented in this project.
