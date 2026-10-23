def empty_release_code(path,identity,expected_uid=1000):
 # Production caller supplies only the path/identity from exact pinned STATE.
 return 'TARGET='+repr(path)+'\nIDENTITY='+repr(identity)+'\nEXPECTED_UID='+repr(expected_uid)+'\n'+r'''
import json,os,pathlib,stat
assert os.getuid()==EXPECTED_UID==1000
p=pathlib.Path(TARGET);m=p.lstat()
assert stat.S_ISDIR(m.st_mode) and not stat.S_ISLNK(m.st_mode) and [m.st_dev,m.st_ino]==IDENTITY and m.st_uid==EXPECTED_UID and stat.S_IMODE(m.st_mode)==0o700
fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
try:
 m=os.fstat(fd);assert [m.st_dev,m.st_ino]==IDENTITY and m.st_uid==EXPECTED_UID and stat.S_IMODE(m.st_mode)==0o700
 assert os.listdir(fd)==[]
 m=p.lstat();assert [m.st_dev,m.st_ino]==IDENTITY and stat.S_ISDIR(m.st_mode) and not stat.S_ISLNK(m.st_mode)
 os.rmdir(p)
finally:os.close(fd)
assert not p.exists() and not p.is_symlink()
print('{"exactEmptyOwnedContainerRemoved":true,"targetAbsent":true}')
'''
