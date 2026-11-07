#!/usr/bin/env python3
"""Compare real APK/AAB files without unpacking or modifying either archive."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile


def inventory(filename):
    path = Path(filename)
    with ZipFile(path) as archive:
        entries = [entry for entry in archive.infolist() if not entry.is_dir()]
        if len({e.filename for e in entries}) != len(entries):
            raise ValueError('Duplicate archive paths make the comparison ambiguous')
        assets = [e for e in entries if '/assets/' in '/' + e.filename]
        return {
            'package_bytes': path.stat().st_size,
            'uncompressed_entries_bytes': sum(e.file_size for e in entries),
            'web_assets_raw_bytes': sum(e.file_size for e in assets),
            'web_assets_compressed_bytes': sum(e.compress_size for e in assets),
            'files': {e.filename: {'raw': e.file_size, 'compressed': e.compress_size} for e in entries},
        }


def compare(baseline, candidate):
    before, after = inventory(baseline), inventory(candidate)
    return {
        'baseline': before, 'candidate': after,
        'delta': {key: after[key] - before[key] for key in before if key != 'files'},
        'added_files': sorted(after['files'].keys() - before['files'].keys()),
        'removed_files': sorted(before['files'].keys() - after['files'].keys()),
        'note': 'Real archive sizes. AAB size is not the Play-delivered split APK size. Installed storage is not measured.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline')
    parser.add_argument('candidate')
    parser.add_argument('--max-growth-bytes', type=int)
    args = parser.parse_args()
    result = compare(args.baseline, args.candidate)
    print(json.dumps(result, indent=2))
    if args.max_growth_bytes is not None and result['delta']['package_bytes'] > args.max_growth_bytes:
        raise SystemExit(1)
