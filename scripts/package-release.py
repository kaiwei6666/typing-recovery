"""Build a deterministic Chrome extension ZIP from the current checkout."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
LICENSE_FILES = [
    "third_party/mcbopomofo/README.md",
    "third_party/mcbopomofo/LICENSE.txt",
    "third_party/mcbopomofo/LIBTABE-NOTICE.txt",
]


def safe_member(name):
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or "\\" in name:
        raise ValueError(f"Unsafe archive path: {name}")
    return path.as_posix()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", help="Require this tag (for example v0.6.0) to match manifest version")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()

    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if args.tag and args.tag != f"v{version}":
        raise SystemExit(f"Tag {args.tag!r} does not match manifest version {version!r}")

    script_files = [
        name
        for content_script in manifest.get("content_scripts", [])
        for name in content_script.get("js", [])
    ]
    members = [safe_member(name) for name in ["manifest.json", "README.md", *script_files, *LICENSE_FILES]]
    if len(members) != len(set(members)):
        raise SystemExit("Release member list contains duplicate paths")
    missing = [name for name in members if not (ROOT / name).is_file()]
    if missing:
        raise SystemExit("Missing release files: " + ", ".join(missing))

    args.output.mkdir(parents=True, exist_ok=True)
    archive = args.output / f"typing-recovery-v{version}.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=9) as bundle:
        for name in sorted(members):
            info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, (ROOT / name).read_bytes())

    with ZipFile(archive) as bundle:
        if bundle.testzip() is not None or set(bundle.namelist()) != set(members):
            raise SystemExit("Release ZIP verification failed")

    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksum = args.output / "SHA256SUMS.txt"
    checksum.write_text(f"{digest}  {archive.name}\n", encoding="utf-8", newline="\n")
    print(f"Built {archive.name} ({len(members)} files, sha256 {digest})")


if __name__ == "__main__":
    main()

