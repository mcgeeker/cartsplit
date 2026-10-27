"""Create local unsigned/source archives in a new directory; never upload.

Explicit inputs exclude profiles, credentials, dependency trees and generated
outputs. Stable ZIP metadata makes identical inputs produce identical archives.
An existing destination is rejected so historical candidates stay recoverable.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "apps/extension/.output/firefox-mv2"
EXTENSIONS = {".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".svg", ".html", ".png", ".jpg", ".woff2"}
EXCLUDED = {"node_modules", "coverage", "dist", "storybook-static", "store-assets"}


def source_files():
    """Include the extension workspace plus its shared UI and build instructions."""
    # Tailwind respects .gitignore: omitting it scans generated .wxt/.output
    # files in an extracted tree and changes CSS even with identical app source.
    names = [".gitignore", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "LICENSE",
             "scripts/verify-personal-build.py", "scripts/package-personal-firefox.py",
             "docs/personal-installation.md", "docs/architecture.md",
             "docs/development.md", "docs/local-data-removal.md",
             "docs/security-review-2026-10-25.md", "docs/retired-code-2026-10-25.txt"]
    paths = [ROOT / name for name in names]
    for folder in ["apps/extension", "packages/ui"]:
        for path in (ROOT / folder).rglob("*"):
            parts = path.relative_to(ROOT / folder).parts
            if any(part.startswith(".") or part in EXCLUDED for part in parts):
                continue
            if path.is_file() and path.suffix in EXTENSIONS:
                paths.append(path)
    for path in paths:
        if path.is_symlink() or not path.is_file():
            raise ValueError("Missing or linked source input: " + str(path.relative_to(ROOT)))
    return sorted(set(paths))


def write_archive(target, entries):
    """Create exclusively, with normalized paths, permissions and timestamps."""
    with zipfile.ZipFile(target, "x", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(entries.items()):
            if name.startswith("/") or ".." in Path(name).parts:
                raise ValueError("Unsafe archive path")
            info = zipfile.ZipInfo(name, (2026, 10, 25, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None:
            raise ValueError("Archive integrity check failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="New local directory; must not exist")
    args = parser.parse_args()
    out = args.output.resolve()
    if out.exists():
        parser.error("Output directory already exists; choose a new candidate directory")
    subprocess.run([sys.executable, str(ROOT / "scripts/verify-personal-build.py")], check=True)
    manifest = json.loads((BUILD / "manifest.json").read_text())
    version = manifest["version"]
    instructions = """# CartSplit personal Firefox build

Original MIT attribution is in LICENSE. Build verified on macOS / Apple Silicon
with Node 24.19.0, Corepack 0.35.0, pnpm 10.33.3, Python 3.9.6.
Install Node from https://nodejs.org/ and Corepack from
https://github.com/nodejs/corepack when needed. pnpm is pinned in package.json.
From this extracted source archive root:

    corepack pnpm install --frozen-lockfile --ignore-scripts
    corepack pnpm --filter extension exec wxt prepare
    corepack pnpm --filter extension compile
    corepack pnpm --filter extension test:run
    corepack pnpm --filter extension build:firefox
    python3 scripts/verify-personal-build.py

Only the inspected extension setup (wxt prepare) is run explicitly; dependency
install hooks stay disabled. Package retrieval needs network access or a populated
pnpm store. No account, credential, environment file or running service is needed.
Tests use synthetic data. Model weights are downloaded only at runtime, not build.
Output: apps/extension/.output/firefox-mv2/ with manifest.json at its root.
The accompanying VERIFICATION.md describes the tested environment and comparison.
Do not run signing or release workflows to reproduce the build.
The runtime remains confined to separately approved Test Plan transactions.
See docs/personal-installation.md for installation and maintenance boundaries.
"""
    inputs = {str(p.relative_to(ROOT)): p.read_bytes() for p in source_files()}
    inputs["BUILD-README.md"] = instructions.encode()
    built = {}
    for path in sorted(BUILD.rglob("*")):
        if path.is_symlink():
            raise ValueError("Linked build output is not permitted")
        if path.is_file():
            built[str(path.relative_to(BUILD))] = path.read_bytes()
    # No destination is created until all inputs and the manifest guard pass.
    out.mkdir(parents=True, exist_ok=False)
    paths = []
    for label, entries in [("unsigned", built), ("sources", inputs)]:
        target = out / ("cartsplit-" + version + "-" + label + ".zip")
        write_archive(target, entries)
        paths.append(target)
        print(target.name + ": " + str(target.stat().st_size) + " bytes")
    (out / "SHA256SUMS.txt").write_text("".join(
        hashlib.sha256(path.read_bytes()).hexdigest() + "  " + path.name + "\n" for path in paths))
    (out / "BUILD-FILES.json").write_text(json.dumps({
        name: hashlib.sha256(data).hexdigest() for name, data in sorted(built.items())
    }, indent=2) + "\n")
    print("Local archives only; unsigned and not submitted.")


if __name__ == "__main__":
    main()
