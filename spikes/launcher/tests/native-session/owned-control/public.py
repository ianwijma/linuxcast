"""Strict, separate publication protocol for one exact-owned-X11 control."""
import hashlib
import json
import os
import pathlib
import re
import stat

KIND='S0-01-private-owned-X11-auxiliary-control'
MODE='exact-owned-target-control'
BACKEND='kwin-x11'
AUTHORITY='010aff02b7b8ead3488949720515fa484415ebfb6476c1ab3360cafbb50c901b'
NODE_SHA256='e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb'
RUNTIME_SOURCES=('control.mjs','core.mjs','production.mjs','pair.py','session.py','public.py')
STEPS=('primary-bound','auxiliary-created','two-native-targets','primary-selected','swapped-rejected','quit-confirmed')
SCOPE={'kind':KIND,'backend':BACKEND,'probeMode':MODE,'status':'incomplete','physicalDesktopMatrixEstablished':False,
       'countScope':'exact-target','fullAcceptanceEstablished':False,'selectedLifecycleEstablished':False,'focusOrShortcutEstablished':False}
REASONS=('CONTROL_ENTRY_OR_RUNTIME_REJECTED','CONTROL_ENTRY_REJECTED','CONTROL_PRIVATE_CONTEXT_REJECTED',
         'CONTROL_SOURCE_REJECTED','PINNED_NODE_REQUIRED','TARGET_COMPOSITOR_PACKAGE_REQUIRED',
         'TARGET_COMPOSITOR_START_FAILED','TARGET_COMPOSITOR_START_DEADLINE','CONTROL_DRIVER_DEADLINE',
         'CONTROL_DRIVER_EXIT_REJECTED','CONTROL_REPORT_MISSING','CONTROL_SESSION_STATE_MISSING',
         'CONTROL_SESSION_DEADLINE','CONTROL_SESSION_EXIT_REJECTED',
         'CONTROL_INNER_REJECTED','CONTROL_CANCELLED','CONTROL_CLEANUP_OR_REPORT_FAILED')

def require(value):
    if not value:raise ValueError('PUBLIC_CONTROL_REJECTED')
def exact(value,expected):require(type(value) is type(expected) and value==expected)
def keys(value,names):require(type(value) is dict and set(value)==set(names))
def digest(value):return hashlib.sha256(value).hexdigest()
def hash_value(value):require(type(value) is str and re.fullmatch('[0-9a-f]{64}',value));return value
def unique(pairs):
    value={}
    for key,item in pairs:
        require(key not in value);value[key]=item
    return value
def loads(value):
    return json.loads(value,object_pairs_hook=unique,parse_constant=lambda _:require(False))
def encoded(value):return (json.dumps(value,indent=2,allow_nan=False)+'\n').encode()
def regular_bytes(path,maximum,private=False):
    path=pathlib.Path(path);require(path.is_absolute() and path==path.resolve(strict=True))
    descriptors=[];chain=[]
    try:
        parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);descriptors.append(parent)
        # Retain every directory reference. A renamed or substituted ancestor
        # cannot redirect a subsequent open, including the descriptor leaf.
        for component in path.parts[1:-1]:
            child=os.open(component,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
            descriptors.append(child);chain.append((parent,component,child,os.fstat(child)));parent=child
        descriptor=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent);descriptors.append(descriptor)
        metadata=os.fstat(descriptor)
        require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid==os.getuid() and metadata.st_nlink==1 and metadata.st_size<=maximum)
        if private:require(stat.S_IMODE(metadata.st_mode)==0o600)
        with os.fdopen(descriptor,'rb',closefd=False) as stream:value=stream.read(maximum+1)
        current=os.stat(path.name,dir_fd=parent,follow_symlinks=False);after=os.fstat(descriptor)
        identity=lambda item:(item.st_dev,item.st_ino,item.st_mode,item.st_uid,item.st_nlink,item.st_size,item.st_mtime_ns,item.st_ctime_ns)
        require(len(value)<=maximum and identity(current)==identity(metadata)==identity(after))
        directory_identity=lambda item:(item.st_dev,item.st_ino,item.st_mode,item.st_uid)
        for ancestor,component,descriptor,original in chain:
            require(directory_identity(os.stat(component,dir_fd=ancestor,follow_symlinks=False))==directory_identity(original)==directory_identity(os.fstat(descriptor)))
        return value
    finally:
        for descriptor in reversed(descriptors):os.close(descriptor)
def file_hash(path,maximum):return digest(regular_bytes(path,maximum))
def source_hashes(value):
    keys(value,RUNTIME_SOURCES)
    return {name:hash_value(value[name]) for name in RUNTIME_SOURCES}
def runtime_authority(value):
    keys(value,('kind','backend','probeMode','applicationObserverManifestSha256','controlSourceSha256','nodeSha256'))
    for key,expected in (('kind','S0-01-owned-control-runtime-authority'),('backend',BACKEND),('probeMode',MODE),
                         ('applicationObserverManifestSha256',AUTHORITY),('nodeSha256',NODE_SHA256)):exact(value[key],expected)
    source_hashes(value['controlSourceSha256'])
    return value
def unavailable(reason):
    require(type(reason) is str and reason in REASONS)
    return {'kind':KIND,'status':'unavailable','reason':reason,'physicalDesktopMatrixEstablished':False,'fullAcceptanceEstablished':False}
def control_result(value):
    if type(value) is dict and value.get('status')=='unavailable':
        keys(value,('kind','status','reason','physicalDesktopMatrixEstablished','fullAcceptanceEstablished'))
        expected=unavailable(value['reason'])
        for key,item in expected.items():exact(value[key],item)
        return expected
    keys(value,(*SCOPE,'diagnosticOutcome','completedSteps','failedStage'))
    for key,expected in SCOPE.items():exact(value[key],expected)
    steps=value['completedSteps']
    require(type(steps) is list and len(steps)<=len(STEPS) and steps==list(STEPS[:len(steps)]))
    if value['diagnosticOutcome']=='complete':require(len(steps)==len(STEPS) and value['failedStage'] is None)
    else:
        exact(value['diagnosticOutcome'],'failed');exact(value['failedStage'],STEPS[len(steps)] if len(steps)<len(STEPS) else 'cleanup')
    return loads(encoded(value))
def driver_state(value):
    keys(value,('kind','outcome','exitCode','reason'));exact(value['kind'],'S0-01-owned-control-driver-state')
    if value['outcome']=='completed':exact(value['exitCode'],3);require(value['reason'] is None)
    elif value['outcome'] in ('driver-exit-rejected','session-exit-rejected'):
        require(type(value['exitCode']) is int and -255<=value['exitCode']<=255 and value['exitCode']!=3)
        exact(value['reason'],'CONTROL_DRIVER_EXIT_REJECTED' if value['outcome']=='driver-exit-rejected' else 'CONTROL_SESSION_EXIT_REJECTED')
    else:
        require(value['outcome'] in ('unavailable','driver-timeout','session-timeout','cancelled') and value['exitCode'] is None)
        require(type(value['reason']) is str and value['reason'] in REASONS)
        if value['outcome']=='driver-timeout':exact(value['reason'],'CONTROL_DRIVER_DEADLINE')
        if value['outcome']=='session-timeout':exact(value['reason'],'CONTROL_SESSION_DEADLINE')
        if value['outcome']=='cancelled':exact(value['reason'],'CONTROL_CANCELLED')
    return loads(encoded(value))
def state(outcome='unavailable',exit_code=None,reason='CONTROL_INNER_REJECTED'):
    return driver_state({'kind':'S0-01-owned-control-driver-state','outcome':outcome,'exitCode':exit_code,'reason':reason})
def packages(value,allow_empty=False):
    if allow_empty and type(value) is list and value==[]:return []
    require(type(value) is list and len(value)==2 and all(type(item) is str and re.fullmatch(r'(?:kwin-x11|libqt6qml6) [0-9][A-Za-z0-9:~+.-]{0,99}',item) for item in value))
    require({line.split(' ')[0] for line in value}=={'kwin-x11','libqt6qml6'})
    return sorted(value)
def source_manifest(value,application_parser):
    keys(value,('kind','applicationObserver','controlSourceSha256','controlAuthoritySha256'))
    exact(value['kind'],'S0-01-owned-control-source-manifest');exact(value['controlAuthoritySha256'],AUTHORITY)
    return {'kind':value['kind'],'applicationObserver':application_parser(value['applicationObserver']),
            'controlSourceSha256':source_hashes(value['controlSourceSha256']),'controlAuthoritySha256':AUTHORITY}
def session_report(value):
    keys(value,('kind','backend','probeMode','status','result','driver','packages','sourceUnchanged',
                'privateProcessTreeCleanupVerified','controlChecksCompleted','physicalDesktopMatrixEstablished',
                'fullAcceptanceEstablished','selectedLifecycleEstablished','focusOrShortcutEstablished'))
    for key,expected in (('kind','S0-01-owned-X11-control-session'),('backend',BACKEND),('probeMode',MODE),('sourceUnchanged',True),
                         ('privateProcessTreeCleanupVerified',True),('physicalDesktopMatrixEstablished',False),
                         ('fullAcceptanceEstablished',False),('selectedLifecycleEstablished',False),('focusOrShortcutEstablished',False)):exact(value[key],expected)
    result=control_result(value['result']);driver=driver_state(value['driver']);packages(value['packages'],driver['outcome']!='completed')
    exact(value['status'],'unavailable' if result['status']=='unavailable' else 'incomplete')
    completed=result.get('diagnosticOutcome')=='complete' and driver['outcome']=='completed'
    exact(value['controlChecksCompleted'],completed)
    return loads(encoded(value))
def make_report(result,driver,package_lines):
    result=control_result(result);driver=driver_state(driver)
    return session_report({'kind':'S0-01-owned-X11-control-session','backend':BACKEND,'probeMode':MODE,
        'status':'unavailable' if result['status']=='unavailable' else 'incomplete','result':result,'driver':driver,
        'packages':packages(package_lines,driver['outcome']!='completed'),'sourceUnchanged':True,'privateProcessTreeCleanupVerified':True,
        'controlChecksCompleted':result.get('diagnosticOutcome')=='complete' and driver['outcome']=='completed',
        'physicalDesktopMatrixEstablished':False,'fullAcceptanceEstablished':False,'selectedLifecycleEstablished':False,'focusOrShortcutEstablished':False})
def exclusive(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:stream.write(value)
def publish(destination,report,manifest,application_parser):
    # No destination/file creation occurs until both complete schemas pass.
    report=session_report(report);manifest=source_manifest(manifest,application_parser)
    values={'report.json':encoded(report),'source-manifest.json':encoded(manifest)}
    require(all(len(value)<=65536 for value in values.values()))
    destination=pathlib.Path(destination)
    require(destination.is_absolute() and destination.parent==destination.parent.resolve(strict=True))
    destination.mkdir(mode=0o700)
    for name,value in values.items():exclusive(destination/name,value)
    return 3,report
