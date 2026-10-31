"""Release safety checks; synthetic files and no network/build processes."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('prepare_release', Path(__file__).with_name('prepare-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def test_explicit_development_inputs_are_individual_safe_source_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            for name in ['prepare-release.py', 'test_prepare_release.py']:
                (root / 'scripts' / name).write_text('tool')
            (root / 'apps/extension').mkdir(parents=True)
            (root / 'apps/extension/new.ts').write_text('new source')
            (root / 'apps/extension/stray 2.ts').write_text('stray')
            with patch.object(release, 'ROOT', root), patch.object(release, 'git', return_value=''):
                release.source_snapshot(root / 'snapshot', ['apps/extension/new.ts'])
                self.assertTrue((root / 'snapshot/apps/extension/new.ts').is_file())
                self.assertFalse((root / 'snapshot/apps/extension/stray 2.ts').exists())
                for name in ['../secret.ts', '/tmp/secret.ts', 'apps/extension/.env', 'apps/extension/node_modules/a.ts']:
                    with self.assertRaises(ValueError):
                        release.source_snapshot(root / 'other', [name])

    def test_rebuild_requires_identical_file_set_and_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            build = root / 'build'
            build.mkdir()
            archive = root / 'candidate.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('manifest.json', b'original')
            (build / 'manifest.json').write_bytes(b'original')
            self.assertEqual(release.compare_build(archive, build), 1)
            (build / 'extra.js').write_bytes(b'extra')
            with self.assertRaisesRegex(ValueError, 'extra.js'):
                release.compare_build(archive, build)
            (build / 'extra.js').unlink()
            (build / 'manifest.json').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'manifest.json'):
                release.compare_build(archive, build)
            (build / 'manifest.json').unlink()
            with self.assertRaisesRegex(ValueError, 'manifest.json'):
                release.compare_build(archive, build)

    def test_snapshot_excludes_untracked_files_and_refuses_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            for name in ['prepare-release.py', 'test_prepare_release.py']:
                (root / 'scripts' / name).write_text('tool')
            (root / 'tracked.ts').write_text('source')
            (root / 'stray 2.ts').write_text('not a release input')
            with patch.object(release, 'ROOT', root), patch.object(release, 'git', return_value='tracked.ts\0'):
                release.source_snapshot(root / 'snapshot')
                self.assertFalse((root / 'snapshot/stray 2.ts').exists())
                (root / 'tracked.ts').unlink()
                (root / 'tracked.ts').symlink_to(root / 'stray 2.ts')
                with self.assertRaisesRegex(ValueError, 'linked'):
                    release.source_snapshot(root / 'other')

    def test_failed_checks_leave_failure_report_and_no_ready_status(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'apps/extension').mkdir(parents=True)
            (root / 'apps/extension/package.json').write_text('{"version":"1.4.4"}')
            out = root / 'candidate'
            with patch.object(release, 'ROOT', root), patch.object(release, 'git', return_value=''), \
                    patch.object(release, 'source_snapshot'), \
                    patch.object(release, 'run_checks', side_effect=RuntimeError('synthetic build failure')), \
                    patch.object(sys, 'argv', ['prepare-release.py', '--output', str(out)]):
                with self.assertRaisesRegex(RuntimeError, 'synthetic build failure'):
                    release.main()
            self.assertEqual(json.loads((out / 'REPORT.json').read_text())['status'], 'failed')
            self.assertFalse((out / 'VERIFICATION.md').exists())

    def test_existing_candidate_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(sys, 'argv', ['prepare-release.py', '--output', directory]):
                with self.assertRaises(SystemExit):
                    release.main()

    def test_released_version_is_rejected_before_output_created(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'apps/extension').mkdir(parents=True)
            (root / 'apps/extension/package.json').write_text('{"version":"1.4.3"}')
            out = root / 'candidate'
            with patch.object(release, 'ROOT', root), patch.object(release, 'git', return_value='v1.4.3'), \
                    patch.object(sys, 'argv', ['prepare-release.py', '--output', str(out)]):
                with self.assertRaises(SystemExit):
                    release.main()
            self.assertFalse(out.exists())


if __name__ == '__main__':
    unittest.main()
