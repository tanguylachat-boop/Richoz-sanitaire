#!/usr/bin/env python3
"""Build a fresh, explicitly local Supabase replay project without editing history.

The legacy CLI sorts filenames differently from ledger versions when numeric
prefix lengths differ. This local-only staging maps each source SQL to a fixed
width version, records its SHA-256, and preserves every SQL byte. Never use this
mapping to repair a deployed database's ledger.
"""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = Path(args.output).resolve()
if not output.is_relative_to(Path('/private/tmp')) or output.exists():
    raise SystemExit('Output must be a NEW directory below /private/tmp; nothing overwritten.')
source = root / 'supabase/migrations'
files = [p for p in source.glob('*.sql') if p.name.split('_')[0].isdigit()]
# 0000901 is the additive prerequisite following 00009 and preceding 00010.
files.sort(key=lambda p: (int(p.name[:5]), p.name.split('_')[0][5:]))
destination = output / 'supabase/migrations'
destination.mkdir(parents=True)
manifest = []
for index, path in enumerate(files, 1):
    filename = f'{20260914000000 + index}_{path.name.split("_", 1)[1]}'
    content = path.read_bytes()
    (destination / filename).write_bytes(content)
    manifest.append({'source': str(path.relative_to(root)), 'staged': filename,
                     'sha256': hashlib.sha256(content).hexdigest()})
config = (root / 'docs/validation-lots-1-2a/supabase-test.toml').read_text()
project_id = output.name[:28] + '-' + hashlib.sha256(str(output).encode()).hexdigest()[:6]
config = config.replace('richoz-validation-lots-1-2a-20260914', project_id)
config = config.replace('563', '573').replace('56883', '57883')
(output / 'supabase/config.toml').write_text(config)
(output / 'source-migrations.json').write_text(json.dumps(manifest, indent=2))
print(f'Prepared {len(files)} byte-identical SQL migrations in {output}; no server started.')
