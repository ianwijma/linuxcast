def stage_cleanup_code(path,identity,files,uid,identities,partial=False):
 prefix='PATH='+repr(path)+'\nIDENTITY='+repr(identity)+'\nFILES='+repr(files)+'\nUID='+repr(uid)+'\nENTRIES='+repr(identities)+'\nPARTIAL='+repr(partial)+'\n'
 return prefix+r"""
import hashlib,json,os,pathlib,stat
p=pathlib.Path(PATH);m=p.lstat();assert [m.st_dev,m.st_ino]==IDENTITY and m.st_uid==UID and stat.S_ISDIR(m.st_mode) and stat.S_IMODE(m.st_mode)==0o700
assert set(ENTRIES)<=set(FILES)
if not PARTIAL:assert set(ENTRIES)==set(FILES) and all(x['complete']is True for x in ENTRIES.values())
ok=set(x.name for x in p.iterdir())==set(ENTRIES)
for n,entry in ENTRIES.items():
 try:
  f=p/n;m=f.lstat();assert [m.st_dev,m.st_ino]==entry['identity'] and m.st_uid==UID and stat.S_ISREG(m.st_mode) and m.st_nlink==1
  if entry['complete']:assert hashlib.sha256(f.read_bytes()).hexdigest()==FILES[n]
  for proc in pathlib.Path('/proc').iterdir():
   if not proc.name.isdecimal():continue
   try:assert os.readlink(proc/'exe')!=str(f)
   except (FileNotFoundError,ProcessLookupError):pass
  m=f.lstat();assert [m.st_dev,m.st_ino]==entry['identity'];f.unlink()
 except BaseException:ok=False
try:
 m=p.lstat();assert [m.st_dev,m.st_ino]==IDENTITY;p.rmdir()
except BaseException:ok=False
print(json.dumps({'ownedStageRemoved':ok,'ownedPathsAbsent':not p.exists()}));raise SystemExit(0 if ok else 3)
"""
