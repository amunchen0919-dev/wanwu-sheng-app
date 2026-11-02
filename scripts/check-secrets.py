#!/usr/bin/env python3
"""只输出路径/行号/规则，不输出密钥。Git可用时检查工作树、索引及全部本地引用历史。"""
from pathlib import Path
import fnmatch
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

rules = [line.strip() for line in (ROOT / '.gitignore').read_text().splitlines() if line.strip() and not line.startswith('#')]
def ignored(path):
    answer = False
    for rule in rules:
        negate = rule.startswith('!')
        pattern = rule[1:] if negate else rule
        anchored = pattern.startswith('/')
        pattern = pattern.lstrip('/')
        if pattern.endswith('/'):
            name = pattern.rstrip('/')
            match = path.startswith(name + '/') if anchored or '/' in name else name in path.split('/')[:-1]
        else:
            match = fnmatch.fnmatchcase(path, pattern) if anchored or '/' in pattern else any(fnmatch.fnmatchcase(part, pattern) for part in path.split('/'))
        if match:
            answer = not negate
    return answer

result = git('rev-parse', '--show-toplevel')
is_repo = result.returncode == 0 and Path(result.stdout.decode().strip()).resolve() == ROOT
if is_repo:
    result = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
    if result.returncode:
        sys.exit('无法读取Git候选文件；停止提交。')
    candidates = sorted(set(result.stdout.decode().split('\0')) - {''})
else:
    candidates = sorted(str(path.relative_to(ROOT)) for path in ROOT.rglob('*') if path.is_file() and '.git' not in path.relative_to(ROOT).parts and not ignored(str(path.relative_to(ROOT))))

secrets = []
for path in ROOT.glob('.env*'):
    if path.name == '.env.example' or not path.is_file():
        continue
    for line in path.read_text(errors='ignore').splitlines():
        match = re.match(r'\s*([A-Z_0-9]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z_0-9]*)\s*=\s*(.+)', line)
        if match:
            value = match[2].strip().strip('\"\'')
            if len(value) >= 12:
                secrets.append(value)

patterns = {
    'credential_token': re.compile(r'\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b'),
    'private_key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'credentials_in_url': re.compile(r'https?://[^\s/:]+:[^\s/@]+@'),
}
findings = []
def scan(data, label):
    try:
        text = data.decode('utf-8')
    except UnicodeError:
        return
    for number, line in enumerate(text.splitlines(), 1):
        if any(value in line for value in secrets):
            findings.append({'file': label, 'line': number, 'rule': 'exact_local_secret'})
        for rule, pattern in patterns.items():
            if pattern.search(line):
                findings.append({'file': label, 'line': number, 'rule': rule})

size = 0
for name in candidates:
    path = ROOT / name
    if is_repo and ignored(name):
        findings.append({'file': name, 'rule': 'tracked_private_or_generated_file'})
    if path.is_symlink():
        findings.append({'file': name, 'rule': 'review_symlink_before_publish'})
        continue
    if path.is_file():
        data = path.read_bytes()
        size += len(data)
        scan(data, name)
    if name == '.env.example':
        for line in path.read_text().splitlines():
            if re.match(r'^STABILITY_API_KEY\s*=\s*\S+', line):
                findings.append({'file': name, 'rule': 'example_key_must_be_empty'})

objects = {}
commits = 0
if is_repo:
    listing = git('rev-list', '--objects', '--all')
    if listing.returncode:
        sys.exit('无法检查Git历史；停止提交。')
    count = git('rev-list', '--count', '--all')
    commits = int(count.stdout.strip() or b'0')
    for line in listing.stdout.decode().splitlines():
        oid, _, path = line.partition(' ')
        objects[oid] = 'history:' + (path or oid[:12])
    for entry in git('ls-files', '--stage', '-z').stdout.decode().split('\0'):
        if '\t' in entry:
            metadata, path = entry.split('\t', 1)
            oid = metadata.split()[1]
            objects[oid] = 'index:' + path
    if objects:
        process = subprocess.Popen(['git', '-C', str(ROOT), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        for oid, label in objects.items():
            process.stdin.write((oid + '\n').encode()); process.stdin.flush()
            header = process.stdout.readline().decode().split()
            if len(header) == 3 and header[2].isdigit():
                data = process.stdout.read(int(header[2])); process.stdout.read(1)
                if header[1] == 'blob':
                    scan(data, label)
        process.stdin.close(); process.wait()

summary = {'git_repository': is_repo, 'scope': 'working-tree + index + local-history' if is_repo else 'planned files using .gitignore; rerun after git init', 'candidate_files': len(candidates), 'candidate_bytes': size, 'local_commits_checked': commits if is_repo else None, 'local_secret_values_compared': len(secrets), 'findings': findings}
print(json.dumps(summary, ensure_ascii=False, indent=2))
if '--manifest' in sys.argv:
    output = ROOT / '.local-only' / 'upload-manifest.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps({'summary': summary, 'files': candidates}, ensure_ascii=False, indent=2))
sys.exit(1 if findings else 0)
