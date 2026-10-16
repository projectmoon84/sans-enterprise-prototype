"""Build a self-contained client handoff. Run after npm run build."""
from pathlib import Path
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
PACKAGE = ROOT / 'release' / 'SANS Enterprise Prototype'
PACKAGE.mkdir(parents=True, exist_ok=True)
shutil.copy2(ROOT / 'dist/index.html', PACKAGE / 'index.html')
for name in ['serve.py', 'Start on Mac.command', 'Start on Windows.bat']:
    shutil.copy2(ROOT / name, PACKAGE / name)
shutil.copy2(ROOT / 'README.md', PACKAGE / 'START HERE.md')
shutil.copy2(ROOT / 'src/fonts/OFL.txt', PACKAGE / 'FONT-LICENSE.txt')
shutil.copy2(ROOT / 'src/fonts/MATERIAL-SYMBOLS-LICENSE.txt', PACKAGE / 'MATERIAL-SYMBOLS-LICENSE.txt')
(PACKAGE / 'sample-students.csv').write_text('name,email,voucher,admin_group,team,work_role\nAlex Chen,alex.chen@example.com,Cyber Defense FY26,Federal Division,Security Operations,SOC Analyst I\nSamira Khan,samira.khan@example.com,Cloud Security FY26,EMEA Operations,Cloud Platform,Cloud Security Engineer\nJamie Lee,jamie.lee@example.com,,Federal Division,,SOC Analyst I\nTaylor Morgan,taylor.invalid,Leadership FY26,,,Security Program Lead\nRiley Ng,riley.ng@example.com,Offensive Ops FY26,APAC Operations,Security Operations,SOC Analyst II\n')
DEVELOPER = PACKAGE / 'developer'
DEVELOPER.mkdir(exist_ok=True)
shutil.copytree(ROOT / 'audit', PACKAGE / 'audit', dirs_exist_ok=True)
for directory in ['src', 'tests']:
    shutil.copytree(ROOT / directory, DEVELOPER / directory, dirs_exist_ok=True)
for name in ['package.json', 'build.mjs', 'README.md', 'serve.py']:
    shutil.copy2(ROOT / name, DEVELOPER / name)
archive = ROOT.parent / 'SANS Enterprise Prototype.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
    for path in sorted(PACKAGE.rglob('*')):
        if path.is_file() and path.name != '.DS_Store':
            z.write(path, path.relative_to(PACKAGE.parent))
with ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'SANS Enterprise Prototype/index.html' in z.namelist()
    assert 'SANS Enterprise Prototype/developer/src/app.js' in z.namelist()
print(f'Created {archive.name} ({archive.stat().st_size / 1024 / 1024:.1f} MB)')
