"""Package source and a static, HTTP-served build into the parent workspace."""
from pathlib import Path
import os
import zipfile

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT.parent
SOURCE = OUTPUT / 'echo-horror-cave-source.zip'
PLAYABLE = OUTPUT / 'echo-horror-cave-playable.zip'

with zipfile.ZipFile(SOURCE, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for folder, directories, files in os.walk(PROJECT):
        directories[:] = sorted(d for d in directories if d not in {
            '.git', 'node_modules', 'dist', 'artifacts', '__pycache__',
        })
        for name in sorted(files):
            path = Path(folder) / name
            archive.write(path, Path('echo-horror') / path.relative_to(PROJECT))

with zipfile.ZipFile(PLAYABLE, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted((PROJECT / 'dist').rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(PROJECT / 'dist'))
    for name in ['LICENSE', 'CREDITS.md']:
        archive.write(PROJECT / name, name)
    archive.write(PROJECT / 'node_modules' / 'three' / 'LICENSE', 'THREE-LICENSE.txt')
    archive.writestr('RUN.txt', '''ECHO / Chapter II: Below the Silence

Serve this directory over HTTP, for example:
  python -m http.server 8000
Then open http://localhost:8000 and choose the Chapter II entry in the menu.

Original source: https://github.com/tg-prplx/echo-horror
This archive includes the new cave chapter.
''')

for path in [SOURCE, PLAYABLE]:
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        print(f'{path.name}: {len(archive.namelist())} files, {path.stat().st_size / 1024**2:.2f} MiB')
