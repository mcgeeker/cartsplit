"""Prepare and independently reproduce a local Firefox candidate; never publish."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args]).decode().strip()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def compare_build(archive_path, build):
    with zipfile.ZipFile(archive_path) as archive:
        expected = {name: digest(archive.read(name)) for name in archive.namelist()}
    actual = {}
    for path in build.rglob('*'):
        if path.is_symlink():
            raise ValueError('Linked rebuild output')
        if path.is_file():
            actual[path.relative_to(build).as_posix()] = digest(path.read_bytes())
    if actual != expected:
        changed = sorted(name for name in expected.keys() | actual.keys()
                         if expected.get(name) != actual.get(name))
        raise ValueError('Independent rebuild differs: ' + ', '.join(changed))
    return len(expected)


def source_snapshot(destination, include_sources=()):
    # Git's tracked list excludes accidental copies, profiles and ignored files.
    names = git('ls-files', '-z').split('\0')
    # These explicit tools are also available during their initial development.
    names += ['scripts/prepare-release.py', 'scripts/test_prepare_release.py']
    # Development rehearsals can name individual new source files without
    # staging them or sweeping unrelated untracked copies into the package.
    for name in include_sources:
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or not relative.parts or \
                any(part.startswith('.') or part in ('node_modules', 'coverage', 'artifacts') for part in relative.parts) or \
                not name.startswith(('apps/extension/', 'packages/ui/', 'scripts/', 'docs/')) or \
                relative.suffix not in ('.ts', '.tsx', '.html', '.css', '.py', '.md'):
            raise ValueError('Invalid explicit source input')
        source = ROOT / relative
        if source.is_symlink() or any(parent.is_symlink() for parent in source.parents if parent != ROOT and ROOT in parent.parents) or \
                not source.resolve().is_relative_to(ROOT.resolve()):
            raise ValueError('Linked explicit source input')
        names.append(name)
    for name in set(filter(None, names)):
        if name.startswith('apps/') and not name.startswith('apps/extension/'):
            continue
        if name.startswith('packages/') and not name.startswith('packages/ui/'):
            continue
        source = ROOT / name
        if source.is_symlink() or not source.is_file():
            raise ValueError('Missing or linked tracked input: ' + name)
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())


def run_checks(root, out, prefix, offline):
    commands = [
        ['corepack', 'pnpm', 'install', '--frozen-lockfile', '--ignore-scripts'] + (['--offline'] if offline else []),
        ['corepack', 'pnpm', '--filter', 'extension', 'exec', 'wxt', 'prepare'],
        ['corepack', 'pnpm', '--filter', 'extension', 'compile'],
        ['corepack', 'pnpm', '--filter', 'extension', 'test:run'],
        ['corepack', 'pnpm', '--filter', 'extension', 'build:firefox'],
        [sys.executable, 'scripts/verify-personal-build.py'],
    ]
    for index, command in enumerate(commands, 1):
        print(prefix + ': ' + ' '.join(command), flush=True)
        with (out / (prefix + '-' + str(index) + '.log')).open('w') as log:
            subprocess.run(command, cwd=root, stdout=log, stderr=subprocess.STDOUT, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path, help='New candidate directory; never overwritten')
    parser.add_argument('--offline', action='store_true', help='Use only cached pinned dependencies')
    parser.add_argument('--rehearsal', action='store_true', help='Verify an existing version; never mark it ready for signing')
    parser.add_argument('--include-source', action='append', default=[], help='Explicit new source file to include in a development rehearsal')
    args = parser.parse_args()
    if args.include_source and not args.rehearsal:
        parser.error('Explicit new sources are allowed only for development rehearsals; track release inputs before a release')
    out = args.output.resolve()
    if out.exists():
        parser.error('Output already exists; choose a new directory')
    version = json.loads((ROOT / 'apps/extension/package.json').read_text())['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        parser.error('Expected a three-part numeric extension version')
    # Tags are read locally: fetch origin first, as documented, to update them.
    versions = [tuple(map(int, tag[1:].split('.'))) for tag in git('tag', '--list', 'v*').splitlines()
                if re.fullmatch(r'v\d+\.\d+\.\d+', tag)]
    if not args.rehearsal and versions and tuple(map(int, version.split('.'))) <= max(versions):
        parser.error('Version must exceed existing local release tags; bump apps/extension/package.json first')
    out.mkdir(parents=True)
    report = {'version': version, 'commit': git('rev-parse', 'HEAD'),
              'working_tree_changes': bool(git('status', '--porcelain', '--untracked-files=no')),
              'included_development_sources': args.include_source,
              'rehearsal': args.rehearsal, 'status': 'running'}
    try:
        with tempfile.TemporaryDirectory(prefix='cartsplit-release-') as first, \
                tempfile.TemporaryDirectory(prefix='cartsplit-rebuild-') as second:
            first, second = Path(first), Path(second)
            source_snapshot(first, args.include_source)
            run_checks(first, out, 'candidate', args.offline)
            packages = out / 'packages'
            subprocess.run([sys.executable, 'scripts/package-personal-firefox.py', '--output', str(packages)],
                           cwd=first, check=True)
            source_zip = packages / ('cartsplit-' + version + '-sources.zip')
            with zipfile.ZipFile(source_zip) as archive:
                # This archive was just created by the inspected local packager.
                for name in archive.namelist():
                    if name.startswith('/') or '..' in Path(name).parts:
                        raise ValueError('Unsafe source archive path')
                archive.extractall(second)
            run_checks(second, out, 'rebuild', args.offline)
            count = compare_build(packages / ('cartsplit-' + version + '-unsigned.zip'),
                                  second / 'apps/extension/.output/firefox-mv2')
            report.update(status='rehearsal-passed' if args.rehearsal else 'ready-for-signing',
                          matching_build_files=count,
                          archives={p.name: digest(p.read_bytes()) for p in packages.glob('*.zip')})
            (out / 'RELEASE-NOTES.md').write_text(
                '# CartSplit ' + version + '\n\nDescribe the changes here before publishing.\n\n'
                'Install the Mozilla-signed XPI over the existing add-on without uninstalling. '
                'Updates are manual. The attached sources ZIP reproduces the unsigned build.\n')
            (out / 'VERIFICATION.md').write_text(
                '# Release preparation\n\nStatus: ' + report['status'] + '\n\n'
                'Typecheck, synthetic tests, Firefox build and manifest guard passed in both isolated trees. '
                + str(count) + ' build files match byte for byte. See REPORT.json and logs.\n\n'
                'Next: review release notes and source changes, authorize Mozilla signing, verify the '
                'signed payload, install and accept it, then authorize GitHub publication. '
                'Unsigned archives cannot be installed permanently. Rehearsals must not be submitted.\n')
    except Exception as error:
        report.update(status='failed', error=str(error))
        raise
    finally:
        (out / 'REPORT.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Preparation complete: ' + str(out) + ' (' + report['status'] + ')')


if __name__ == '__main__':
    main()
