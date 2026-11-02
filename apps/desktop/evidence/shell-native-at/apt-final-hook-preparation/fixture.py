#!/usr/bin/python3
"""Private non-root APT control; synthetic dpkg always refuses mutation."""
import hashlib
import io
import json
import os
from pathlib import Path
import resource
import shutil
import signal
import sys
import tarfile
import tempfile
import time

REPO = Path('/home/ian/.t3/worktrees/linuxcast/t3-d1b99cbd')
OLD = Path('/tmp/f102-debian-resolution-haf7i667')
BODIES = Path('/home/ian/Projects/ianwijma/linuxcast/.worktrees/f102-public-debian-build-packages-20261102/archives')
sys.path.insert(0, str(REPO / 'apps/desktop/tests/at'))
from test_lab_owner import FixtureGuard

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def apt_quote(value, bad):
    return ''.join('%%%02x' % ord(c) if c in bad or ord(c)<=32 or ord(c)>=127 or c=='%' else c for c in value)

def save(path, raw, mode=0o600):
    with path.open('xb') as stream:
        stream.write(raw)
    path.chmod(mode)

def run(root, name, argv, env):
    guard = FixtureGuard()
    start = time.monotonic()
    def execute():
        resource.setrlimit(resource.RLIMIT_FSIZE, (67108864, 67108864))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        os.chdir(root)
        fd = os.open('/dev/null', os.O_RDONLY)
        os.dup2(fd, 0)
        os.close(fd)
        for target, suffix in ((1, 'stdout'), (2, 'stderr')):
            fd = os.open(root / (name + '.' + suffix), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.dup2(fd, target)
            os.close(fd)
        os.execve(argv[0], argv, env)
    def expire(*_):
        raise TimeoutError('fixture deadline')
    signal.signal(signal.SIGALRM, expire)
    signal.setitimer(signal.ITIMER_REAL, 30)
    status = None
    try:
        pid = guard.spawn(execute)
        _, status = os.waitpid(pid, 0)
        guard.reaped(pid)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        clean = guard.cleanup()
    assert clean and not guard.children()
    return {'name': name, 'exit': os.waitstatus_to_exitcode(status), 'seconds': round(time.monotonic()-start, 3), 'childrenAbsent': clean}

def main():
    assert os.geteuid() == 1000 and os.getegid() == 1000
    assert sys.argv[1:] in ([], ['--pass-synthetic-hook'])
    pass_hook = bool(sys.argv[1:])
    os.umask(0o077)
    root = Path(tempfile.mkdtemp(prefix='f102-apt-final-hook-'))
    print(str(root), flush=True)
    plan_raw = (OLD / 'full-plan.private.json').read_bytes()
    assert sha(plan_raw) == '495b3acfe8b4c6ed0af811decb84c776da7d4974388c4ca1b37a3e88713363f3'
    plan = json.loads(plan_raw)
    assert len(plan['install']) == 55 and len(plan['keep']) == 767
    pins = []
    def identity(path):
        st = path.stat(follow_symlinks=False)
        return [st.st_dev,st.st_ino,st.st_mode,st.st_uid,st.st_gid,st.st_nlink,st.st_size,st.st_mtime_ns,st.st_ctime_ns]
    def copy(source, target, expected=None, mode=0o400):
        assert source.is_file() and not source.is_symlink()
        before = identity(source)
        raw = source.read_bytes()
        digest = sha(raw)
        if expected is not None:
            assert digest == expected, source.name
        save(target, raw, mode)
        assert identity(source) == before
        pins.append((source, digest, before))
    for name in ('runtime', 'etc', 'etc/apt.conf.d', 'etc/sources.list.d', 'etc/preferences.d', 'etc/auth.conf.d', 'etc/trusted.gpg.d', 'state', 'state/lists', 'state/lists/partial', 'cache', 'cache/archives', 'cache/archives/partial', 'log', 'empty-bin', 'home', 'tmp'):
        (root / name).mkdir(exist_ok=True)
    manifest = json.loads((OLD / 'runtime-manifest-16.json').read_bytes())
    recorded_runtime = (REPO/'apps/desktop/evidence/shell-native-at/debian-package-resolution-preparation/README.md').read_text()
    for package in manifest:
        assert package['SHA256'] in recorded_runtime
        body = (OLD/'artifacts'/Path(package['Filename']).name).read_bytes()
        assert sha(body)==package['SHA256'] and len(body)==int(package['Size'])
        assert body[:8]==b'!<arch>\n'
        offset, data = 8, None
        while offset < len(body):
            header=body[offset:offset+60]
            assert len(header)==60 and header[-2:]==b'`\n'
            size=int(header[48:58])
            member=body[offset+60:offset+60+size]
            assert len(member)==size
            name=header[:16].decode('ascii').strip().rstrip('/')
            if name.startswith('data.tar.'):
                assert data is None
                data=member
            offset+=60+size+(size%2)
        assert offset==len(body) and data is not None
        with tarfile.open(fileobj=io.BytesIO(data),mode='r:*') as archive:
            for elf in package['elfFiles']:
                members=[x for x in archive.getmembers() if x.name in (elf['archivePath'],'./'+elf['archivePath'])]
                assert len(members)==1 and members[0].isreg() and not members[0].issparse()
                assert members[0].size==elf['bytes']
                assert sha(archive.extractfile(members[0]).read())==elf['sha256']
    runtime = {}
    for package in manifest:
        for elf in package['elfFiles']:
            for name in [elf['file']] + elf['soname']:
                if name in runtime:
                    assert runtime[name] == elf['sha256']
                runtime[name] = elf['sha256']
    for name, digest in runtime.items():
        copy(OLD/'runtime'/name, root/'runtime'/name, digest, 0o500)
    for path in (OLD / 'state/lists').iterdir():
        if path.is_file():
            copy(path, root/'state/lists'/path.name)
    for name in ('status', 'etc/preferences', 'etc/sources.list'):
        copy(OLD/name, root/name)
    for name in ('etc/apt.conf', 'etc/auth.conf', 'etc/openssl-empty.conf', 'state/extended_states'):
        save(root/name, b'')
    status_before = sha((root/'status').read_bytes())
    extended_before = sha((root/'state/extended_states').read_bytes())
    for row in plan['install']:
        assert row['Package'] not in {x['tuple'].split(':')[0] for x in plan['keep']}
        filename = apt_quote(row['Package'], '_:')+'_'+apt_quote(row['Version'], '_:')+'_'+apt_quote(row['Architecture'], '_:.')+'.deb'
        source = BODIES/(row['SHA256']+'.deb')
        assert source.stat().st_size == int(row['Size'])
        copy(source, root/'cache/archives'/filename, row['SHA256'])
    fake = '''#!/usr/bin/python3 -I
import json,os,sys
from pathlib import Path
root=Path(__file__).parent.parent
args=sys.argv[1:]
with (root/'dpkg-calls.private.jsonl').open('a') as out: out.write(json.dumps(args)+'\\n')
if args[:2]==['--admindir',str(root)+'/']: args=args[2:]
if args==['--print-foreign-architectures']: sys.exit(0)
if len(args)==1 and args[0] in ('--assert-multi-arch','--assert-protected-field','--assert-versioned-provides'): sys.exit(0)
with (root/'dpkg-mutation-refused.private.json').open('x') as out: json.dump(args,out)
sys.exit(74)
'''
    save(root/'empty-bin/dpkg', fake.encode(), 0o500)
    hook = '''#!/usr/bin/python3 -I
import errno,fcntl,json,os,sys
from pathlib import Path
root=Path(__file__).parent.parent
raw=sys.stdin.buffer.read(1048577)
if len(raw)>1048576: sys.exit(75)
with (root/'hook-v3.private').open('xb') as out: out.write(raw)
locks={}
for name in ('lock-frontend','lock'):
    fd=os.open(root/name,os.O_RDWR|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        try:
            fcntl.lockf(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            locks[name]='acquired'
        except OSError as error:
            if error.errno not in (errno.EACCES,errno.EAGAIN): raise
            locks[name]='contended'
    finally: os.close(fd)
with (root/'hook-locks.private.json').open('x') as out: json.dump(locks,out)
if locks!={'lock-frontend':'contended','lock':'acquired'}: sys.exit(76)
sys.exit(73)
'''
    if pass_hook:
        hook=hook.replace('sys.exit(73)', 'sys.exit(0)')
    save(root/'empty-bin/final-hook', hook.encode(), 0o500)
    config = (OLD/'apt-final.conf').read_text().replace(str(OLD), str(root))
    config += f'''\nAPT::Get::Simulate "false";
Debug::NoLocking "false";
Debug::pkgAcqArchive::NoQueue "false";
Dir::Cache::pkgcache "";
Dir::Cache::srcpkgcache "";
DPkg::Inhibit-Shutdown "false";
DPkg::Use-Pty "false";
DPkg::ConfigurePending "false";
DPkg::NoTriggers "false";
DPkg::TriggersPending "false";
dpkg::install::recursive::force "true";
dpkg::install::recursive "false";
DPkg::Run-Directory "/";
DPkg::Chroot-Directory "/";
DPkg::Pre-Install-Pkgs {{ "{root}/empty-bin/final-hook"; }};
DPkg::Tools::Options::{root}/empty-bin/final-hook::Version "3";
DPkg::Tools::Options::{root}/empty-bin/final-hook::InfoFD "0";
'''
    save(root/'apt.conf', config.encode())
    env={'PATH':str(root/'empty-bin'), 'HOME':str(root/'home'), 'TMPDIR':str(root/'tmp'), 'APT_CONFIG':str(root/'apt.conf'), 'LC_ALL':'C', 'LANG':'C', 'OPENSSL_CONF':str(root/'etc/openssl-empty.conf')}
    loader=[str(root/'runtime/ld-linux-x86-64.so.2'),'--inhibit-cache','--library-path',str(root/'runtime')]
    records=[run(root,'loader-list',loader+['--list',str(root/'runtime/apt-get')],env)]
    assert records[-1]['exit']==0
    for line in (root/'loader-list.stdout').read_text().splitlines():
        if 'linux-vdso' not in line:
            assert line.strip().split(' => ')[-1].split(' (')[0].startswith(str(root/'runtime')+'/')
    argv=loader+[str(root/'runtime/apt-get'),'--assume-yes','--no-download','--no-remove','--no-install-recommends','--no-install-suggests','install']+sorted(x['tuple'] for x in plan['install'])
    records.append(run(root,'passing-hook-control' if pass_hook else 'rejecting-hook',argv,env))
    for source,digest,before in pins:
        assert sha(source.read_bytes())==digest and identity(source)==before
    assert sha((root/'status').read_bytes()) == status_before
    extended_unchanged = sha((root/'state/extended_states').read_bytes()) == extended_before
    if not pass_hook:
        assert extended_unchanged
    locks=json.loads((root/'hook-locks.private.json').read_bytes()) if (root/'hook-locks.private.json').exists() else None
    result={'schema':'f102-private-apt-final-hook-control-v1','uid':os.geteuid(),'simulate':False,'noLocking':False,'noQueue':False,'syntheticDpkg':True,'passSyntheticHook':pass_hook,'realPackageMutationPossible':False,'kernelNetworkDenialVerified':False,'records':records,'hookReceived':(root/'hook-v3.private').exists(),'mutatingDpkgRefused':(root/'dpkg-mutation-refused.private.json').exists(),'hookLockProbe':locks,'statusUnchanged':True,'extendedStatesUnchanged':extended_unchanged,'originalInputsUnchanged':True,'copiedInputCount':len(pins)}
    save(root/'result.private.json', json.dumps(result,indent=2).encode())
    print(json.dumps(result),flush=True)

if __name__=='__main__':
    main()
