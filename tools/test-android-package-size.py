import importlib.util
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile, ZIP_DEFLATED

spec = importlib.util.spec_from_file_location('measure', Path(__file__).with_name('compare-android-package.py'))
measure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(measure)


class PackageSizeTests(unittest.TestCase):
    def test_reports_real_archive_and_web_asset_delta(self):
        with tempfile.TemporaryDirectory() as folder:
            before, after = Path(folder)/'before.apk', Path(folder)/'after.apk'
            for filename in [before, after]:
                with ZipFile(filename, 'w', ZIP_DEFLATED) as z:
                    z.writestr('assets/public/index.html', 'baseline')
                    z.writestr('classes.dex', b'dex-test')
                    if filename == after:
                        z.writestr('assets/public/arena3d.js', 'scene' * 400)
            report = measure.compare(before, after)
            self.assertEqual(report['delta']['package_bytes'], after.stat().st_size-before.stat().st_size)
            self.assertEqual(report['delta']['web_assets_raw_bytes'], 2000)
            self.assertEqual(report['added_files'], ['assets/public/arena3d.js'])
            self.assertEqual(report['removed_files'], [])

    def test_handles_aab_assets_and_removed_files(self):
        with tempfile.TemporaryDirectory() as folder:
            before, after = Path(folder)/'before.aab', Path(folder)/'after.aab'
            with ZipFile(before, 'w') as z:
                z.writestr('base/assets/old.bin', b'123456')
            with ZipFile(after, 'w') as z:
                z.writestr('base/assets/new.bin', b'12')
            report = measure.compare(before, after)
            self.assertEqual(report['delta']['web_assets_raw_bytes'], -4)
            self.assertEqual(report['removed_files'], ['base/assets/old.bin'])


if __name__ == '__main__':
    unittest.main()
