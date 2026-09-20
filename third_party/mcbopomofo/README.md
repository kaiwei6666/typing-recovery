# McBopomofo dictionary attribution

`src/core/dictionary.js` is derived from [McBopomofo's BPMFBase.txt](https://github.com/openvanilla/McBopomofo/blob/f5ba010ce8795d283ee336ca7d16380f200bd2ec/Source/Data/BPMFBase.txt).

- Upstream: https://github.com/openvanilla/McBopomofo
- Commit: `f5ba010ce8795d283ee336ca7d16380f200bd2ec`
- Source SHA-256: `46e64a53dc9c6baa2cbe6e0b1af572f8ef6aafb50597178b5fd53df804316ce7`
- Copyright (c) 2011-2026 Mengjuei Hsieh et al.
- License: MIT, reproduced in `LICENSE.txt` in this directory.

Transformation: retain single Han characters tagged `big5`, group by exact tonal reading, remove duplicates, and preserve upstream candidate order. Phonetic symbols and records tagged `utf8` are excluded. This deliberately limits rare/variant character coverage; Big5 membership is a repertoire filter, not a general simplified-to-traditional conversion rule. No phrase dictionary or context model is included. Candidate order is upstream order, not a confidence score.

Rebuild with Node.js after downloading the pinned source:

```sh
node scripts/build-dictionary.cjs /path/to/BPMFBase.txt
```

The script verifies the source hash before writing the bundled dictionary. The extension performs no network requests for dictionary lookup.
