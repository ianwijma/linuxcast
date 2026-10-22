"""Strict public artifact boundary for this disposable launcher probe only."""
import json
import math
import os
import pathlib
import re
import shutil
import stat

BACKENDS=('gnome-wayland','gnome-x11','kwin-wayland','kwin-x11')
SOURCES=('build.ts','check.ts','protocol.ts','run-session.py','supervision.py','private.py','artifacts.py','gnome-extension.js','kwin-script.js','kwin-bus.py','decoy.py',
    '../../src/main.ts','../../src/profile.ts','../../src/preload.ts','../../src/contract.ts','../../src/renderer/main.tsx','../../src/renderer/App.tsx','../../src/renderer/style.css','../../build.ts','../../resources/index.html',
    '../../../../package.json','../../../../bun.lock','../../../../apps/desktop/package.json')
OUTPUTS=('extension.js','kwin-script.js','metadata.json')
STAGES=('build','first-launch','native-initial-identity','resident-close','decoy-challenge','ordinary-cli-show','actual-x11-global-shortcut','light-component-state','explicit-ui-quit','fresh-launch-hidden-cli-quit','complete','private-session')
PHASES=('decoy-native-ready','decoy-focused-before-ordinary-show','initial-native-launch','after-close-native-hidden','ordinary-singleton-cli-show','wayland-singleton-toggle-hidden','wayland-singleton-reopened','ordinary-show-native-focus','actual-x11-shortcut-native-focus','after-ui-quit-native-window-absent','fresh-resident-native-hidden','after-hidden-cli-quit-native-window-absent')
FLAGS=('initialPlacementInsideWorkArea','closeRetainedResidentProcess','decoyActivationUsedForChallengeSetup','singletonShowRetainedPid','ordinaryShowNativeFocused','componentRequirementVisible','explicitUiQuitExited','hiddenCliQuitExited')
ACTIVATION=('normal-show-focused-component-placement-still-required','actionable-component-required','normal-show-and-shortcut-native-focus-observed')

def object_keys(value,required,optional=()):
    if type(value) is not dict or not set(required)<=set(value) or not set(value)<=set(required)|set(optional): raise ValueError('PUBLIC_ARTIFACT_SCHEMA')

def boolean(value):
    if type(value) is not bool: raise ValueError('PUBLIC_ARTIFACT_BOOLEAN')
    return value

def exact(value,expected):
    if type(value) is not type(expected) or value!=expected: raise ValueError('PUBLIC_ARTIFACT_CONSTANT')
    return expected

def integer(value,low,high):
    if type(value) is not int or not low<=value<=high: raise ValueError('PUBLIC_ARTIFACT_INTEGER')
    return value

def version(value):
    if type(value) is not str or not re.fullmatch(r'[0-9]{1,4}(?:\.[0-9]{1,6}){1,3}',value): raise ValueError('PUBLIC_RUNTIME_VERSION')
    return value

def rect(value):
    if value is None: return None
    object_keys(value,('x','y','width','height'))
    for key,number in value.items():
        if type(number) not in (int,float) or not math.isfinite(number) or abs(number)>65536 or (key in ('width','height') and number<=0): raise ValueError('PUBLIC_RECTANGLE')
    return {key:value[key] for key in ('x','y','width','height')}

def native_window(value):
    object_keys(value,('count','identityMatches','nativeBackend','focused','hidden','geometry','workArea'))
    result={'count':integer(value['count'],0,8),'identityMatches':boolean(value['identityMatches']),
            'focused':boolean(value['focused']),'hidden':boolean(value['hidden']),
            'geometry':rect(value['geometry']),'workArea':rect(value['workArea'])}
    if value['nativeBackend'] not in ('wayland','x11','unsupported'): raise ValueError('PUBLIC_NATIVE_BACKEND')
    result['nativeBackend']=value['nativeBackend']
    if (result['count']!=1 or not result['identityMatches']) and (result['identityMatches'] or result['focused'] or not result['hidden'] or result['geometry'] is not None or result['workArea'] is not None or result['nativeBackend']!='unsupported'):
        raise ValueError('PUBLIC_NATIVE_IDENTITY')
    return result

def observation(value):
    object_keys(value,('request','launcher','decoy','decoyActivationIssued'))
    return {'request':integer(value['request'],1,1000),'launcher':native_window(value['launcher']),'decoy':native_window(value['decoy']),
            'decoyActivationIssued':boolean(value['decoyActivationIssued'])}

def runtime(value,backend):
    object_keys(value,('electron','chrome','ozone','noSandbox','sandbox','contextIsolation','nodeIntegration','webSecurity','renderer'))
    renderer=value['renderer'];object_keys(renderer,('runtime','process','require'))
    probe=renderer['runtime'];object_keys(probe,('sandboxed','contextIsolated'))
    return {'electron':exact(value['electron'],'45.0.0'),'chrome':version(value['chrome']),
        'ozone':exact(value['ozone'],'wayland' if backend.endswith('wayland') else 'x11'),
        'noSandbox':exact(value['noSandbox'],False),'sandbox':exact(value['sandbox'],True),
        'contextIsolation':exact(value['contextIsolation'],True),'nodeIntegration':exact(value['nodeIntegration'],False),'webSecurity':exact(value['webSecurity'],True),
        'renderer':{'runtime':{'sandboxed':exact(probe['sandboxed'],True),'contextIsolated':exact(probe['contextIsolated'],True)},
                    'process':exact(renderer['process'],'undefined'),'require':exact(renderer['require'],'undefined')}}

def shortcut(value,backend):
    if backend.endswith('x11'):
        object_keys(value,('state','nativeXTestActivationObserved','effective'))
        return {'state':exact(value['state'],'available'),'nativeXTestActivationObserved':exact(value['nativeXTestActivationObserved'],True),'effective':exact(value['effective'],'Ctrl+Alt+Shift+F12')}
    object_keys(value,('state','effectiveBindingExposed','portalServicePresent','consentOrEffectiveBindingProven'))
    if value['state'] not in ('available','temporarily-unavailable','permission-required'): raise ValueError('PUBLIC_SHORTCUT_STATE')
    return {'state':value['state'],'effectiveBindingExposed':exact(value['effectiveBindingExposed'],False),
        'portalServicePresent':boolean(value['portalServicePresent']),'consentOrEffectiveBindingProven':exact(value['consentOrEffectiveBindingProven'],False)}

def public_result(value,backend):
    required=('task','backend','status','physicalDesktopMatrixEstablished','evidenceKind','kernel','hostDisplayClipboardInputOrSettingsUsed','launcherCompanionActivationOrPlacementUsed','observations','stage')
    object_keys(value,required,(*FLAGS,'runtime','activationOutcome','shortcut'))
    if backend not in BACKENDS or value['status'] not in ('passed-bounded-native-probe','incomplete','cleanup-incomplete','unavailable') or value['stage'] not in STAGES: raise ValueError('PUBLIC_RESULT_STATE')
    if type(value['kernel']) is not str or not re.fullmatch(r'[0-9][A-Za-z0-9_.+~-]{0,119}',value['kernel']): raise ValueError('PUBLIC_KERNEL_VERSION')
    result={'task':exact(value['task'],'S0-01'),'backend':exact(value['backend'],backend),'status':value['status'],
        'physicalDesktopMatrixEstablished':exact(value['physicalDesktopMatrixEstablished'],False),
        'evidenceKind':exact(value['evidenceKind'],'actual-isolated-software-compositor-launcher'),'kernel':value['kernel'],
        'hostDisplayClipboardInputOrSettingsUsed':exact(value['hostDisplayClipboardInputOrSettingsUsed'],False),
        'launcherCompanionActivationOrPlacementUsed':exact(value['launcherCompanionActivationOrPlacementUsed'],False),'stage':value['stage']}
    rows=value['observations']
    if type(rows) is not list or len(rows)>32: raise ValueError('PUBLIC_OBSERVATION_BOUND')
    result['observations']=[];last=0
    for row in rows:
        object_keys(row,('phase','native'))
        if row['phase'] not in PHASES: raise ValueError('PUBLIC_OBSERVATION_PHASE')
        native=observation(row['native'])
        if native['request']<=last: raise ValueError('PUBLIC_OBSERVATION_SEQUENCE')
        last=native['request'];result['observations'].append({'phase':row['phase'],'native':native})
    for flag in FLAGS:
        if flag in value: result[flag]=boolean(value[flag])
    if 'runtime' in value: result['runtime']=runtime(value['runtime'],backend)
    if 'shortcut' in value: result['shortcut']=shortcut(value['shortcut'],backend)
    if 'activationOutcome' in value:
        if value['activationOutcome'] not in ACTIVATION: raise ValueError('PUBLIC_ACTIVATION_OUTCOME')
        result['activationOutcome']=value['activationOutcome']
    if value['status']=='passed-bounded-native-probe':
        mandatory=('closeRetainedResidentProcess','decoyActivationUsedForChallengeSetup','singletonShowRetainedPid','explicitUiQuitExited','hiddenCliQuitExited')
        if value['stage']!='complete' or any(result.get(key) is not True for key in mandatory) or not all(key in result for key in ('runtime','shortcut','activationOutcome','initialPlacementInsideWorkArea','ordinaryShowNativeFocused')):
            raise ValueError('PUBLIC_SUCCESS_EVIDENCE_REQUIRED')
        phases={row['phase'] for row in result['observations']}
        needed={'initial-native-launch','after-close-native-hidden','decoy-native-ready','decoy-focused-before-ordinary-show','ordinary-singleton-cli-show','after-ui-quit-native-window-absent','fresh-resident-native-hidden','after-hidden-cli-quit-native-window-absent'}
        needed|={'wayland-singleton-toggle-hidden','wayland-singleton-reopened'} if backend.endswith('wayland') else {'ordinary-show-native-focus','actual-x11-shortcut-native-focus'}
        if not needed<=phases: raise ValueError('PUBLIC_SUCCESS_OBSERVATIONS_REQUIRED')
        if backend.endswith('wayland') and result.get('componentRequirementVisible') is not True: raise ValueError('PUBLIC_COMPONENT_EVIDENCE_REQUIRED')
        visible=('initial-native-launch','ordinary-singleton-cli-show','wayland-singleton-reopened','ordinary-show-native-focus','actual-x11-shortcut-native-focus')
        hidden=('after-close-native-hidden','wayland-singleton-toggle-hidden','fresh-resident-native-hidden')
        native_backend='wayland' if backend.endswith('wayland') else 'x11'
        for row in result['observations']:
            phase=row['phase'];window=row['native']['launcher'];decoy=row['native']['decoy']
            if phase in visible and (window['count']!=1 or not window['identityMatches'] or window['nativeBackend']!=native_backend or window['geometry'] is None or window['workArea'] is None): raise ValueError('PUBLIC_VISIBLE_NATIVE_EVIDENCE_REQUIRED')
            if phase in hidden and not (window['count']==0 or window['hidden']): raise ValueError('PUBLIC_HIDDEN_NATIVE_EVIDENCE_REQUIRED')
            if phase in ('after-ui-quit-native-window-absent','after-hidden-cli-quit-native-window-absent') and window['count']!=0: raise ValueError('PUBLIC_QUIT_NATIVE_EVIDENCE_REQUIRED')
            if phase in ('ordinary-show-native-focus','actual-x11-shortcut-native-focus') and not window['focused']: raise ValueError('PUBLIC_FOCUS_NATIVE_EVIDENCE_REQUIRED')
            if phase in ('decoy-native-ready','decoy-focused-before-ordinary-show') and (decoy['count']!=1 or not decoy['identityMatches'] or decoy['nativeBackend']!=native_backend): raise ValueError('PUBLIC_DECOY_NATIVE_EVIDENCE_REQUIRED')
            if phase=='decoy-focused-before-ordinary-show' and (not decoy['focused'] or window['focused']): raise ValueError('PUBLIC_DECOY_FOCUS_REQUIRED')
        if backend.endswith('x11') and result['activationOutcome']!='normal-show-and-shortcut-native-focus-observed': raise ValueError('PUBLIC_ACTIVATION_OUTCOME')
        if backend.endswith('wayland') and result['activationOutcome']!=('normal-show-focused-component-placement-still-required' if result['ordinaryShowNativeFocused'] else 'actionable-component-required'): raise ValueError('PUBLIC_ACTIVATION_OUTCOME')
    return result

def public_manifest(value):
    object_keys(value,('kind','sourceSha256','outputSha256','designTokensSha256','launcherDesktopFileSha256'))
    exact(value['kind'],'S0-01-private-native-compositor-probe')
    result={'kind':value['kind']}
    for key,names in (('sourceSha256',SOURCES),('outputSha256',OUTPUTS)):
        object_keys(value[key],names)
        result[key]={name:hash_value(value[key][name]) for name in names}
    for key in ('designTokensSha256','launcherDesktopFileSha256'): result[key]=hash_value(value[key])
    return result

def hash_value(value):
    if type(value) is not str or not re.fullmatch(r'[0-9a-f]{64}',value): raise ValueError('PUBLIC_HASH_REQUIRED')
    return value

def fallback_result(backend):
    return {'task':'S0-01','backend':backend,'status':'unavailable','physicalDesktopMatrixEstablished':False,
        'evidenceKind':'actual-isolated-software-compositor-launcher','kernel':os.uname().release,
        'hostDisplayClipboardInputOrSettingsUsed':False,'launcherCompanionActivationOrPlacementUsed':False,'observations':[],'stage':'private-session'}

def publish(root,destination,value,manifest,backend,status,packages):
    # Validate EVERYTHING before creating the destination or copying any bytes.
    result=public_result(value,backend);provenance=public_manifest(manifest)
    if status!=0 or result['status']!='passed-bounded-native-probe' or result['stage']!='complete':
        status=3
        if result['status']=='passed-bounded-native-probe': result['status']='incomplete'
    approved=('gnome-shell','mutter','kwin-wayland','kwin-x11','libqt6qml6')
    safe_packages=[]
    for line in packages.splitlines():
        if re.fullmatch(r'(?:'+('|'.join(approved))+r') [0-9][A-Za-z0-9:~+.-]{0,99}',line): safe_packages.append(line)
    screenshots=[]
    for name in ('dark-launcher.png','light-capabilities.png'):
        file=root/name
        if file.exists():
            metadata=file.lstat()
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid!=os.getuid() or metadata.st_size>8*1024*1024 or file.read_bytes()[:8]!=b'\x89PNG\r\n\x1a\n': raise ValueError('PUBLIC_SCREENSHOT_REQUIRED')
            screenshots.append((file,name))
    result.update(privateProcessTreeCleanupVerified=True,packages=safe_packages)
    destination.mkdir(parents=True,exist_ok=True)
    (destination/'report.json').write_text(json.dumps(result,indent=2)+'\n')
    (destination/'source-manifest.json').write_text(json.dumps(provenance,indent=2)+'\n')
    for file,name in screenshots: shutil.copyfile(file,destination/name)
    return status,result['status']
