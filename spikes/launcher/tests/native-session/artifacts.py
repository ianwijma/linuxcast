"""Strict public artifact boundary for this disposable launcher probe only."""
import json
import math
import os
import pathlib
import re
import shutil
import stat
from observer_startup import diagnostic as startup_diagnostic

BACKENDS=('gnome-wayland','gnome-x11','kwin-wayland','kwin-x11')
SOURCES=('build.ts','check.ts','protocol.ts','run-session.py','supervision.py', 'observer_startup.py','private.py','artifacts.py','gnome-extension.js','kwin-script.js','kwin-bus.py','decoy.py','owned-x11.py',
    '../../src/main.ts','../../src/profile.ts','../../src/preload.ts','../../src/contract.ts','../../src/renderer/main.tsx','../../src/renderer/App.tsx','../../src/renderer/style.css','../../build.ts','../../resources/index.html',
    '../../../../package.json','../../../../bun.lock','../../../../apps/desktop/package.json')
OUTPUTS=('extension.js','kwin-script.js','metadata.json')
STAGES=('build','first-launch','native-initial-identity','resident-close','decoy-challenge','ordinary-cli-show','actual-x11-global-shortcut','light-component-state','explicit-ui-quit','fresh-launch-hidden-cli-quit','complete','private-session')
PHASES=('decoy-native-ready','decoy-focused-before-ordinary-show','initial-native-launch','after-close-native-hidden','ordinary-singleton-cli-show','wayland-singleton-toggle-hidden','wayland-singleton-reopened','ordinary-show-native-focus','actual-x11-shortcut-native-focus','fresh-lifecycle-native-launch','after-ui-quit-native-window-absent','fresh-resident-native-hidden','after-hidden-cli-quit-native-window-absent')
DIAGNOSTIC_PHASES=(*PHASES,'decoy-activation-request')
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

def window_diagnostic(value,native):
    object_keys(value,('pidMatch','primaryIdentity','secondaryIdentity','geometry','workArea'))
    identities=('not-inspected','non-string','empty','mismatch','match');rectangles=('not-inspected','not-ready','ready')
    if value['pidMatch'] not in ('none','single','multiple') or any(value[key] not in identities for key in ('primaryIdentity','secondaryIdentity')) or any(value[key] not in rectangles for key in ('geometry','workArea')): raise ValueError('PUBLIC_NATIVE_DIAGNOSTIC')
    if value['pidMatch']!=('none' if native['count']==0 else 'single' if native['count']==1 else 'multiple'): raise ValueError('PUBLIC_NATIVE_DIAGNOSTIC')
    if native['count']!=1:
        if any(value[key]!='not-inspected' for key in ('primaryIdentity','secondaryIdentity','geometry','workArea')): raise ValueError('PUBLIC_NATIVE_DIAGNOSTIC')
    else:
        if any(value[key]=='not-inspected' for key in ('primaryIdentity','secondaryIdentity')) or native['identityMatches']!=(value['primaryIdentity']=='match' or value['secondaryIdentity']=='match'): raise ValueError('PUBLIC_NATIVE_DIAGNOSTIC')
        if not native['identityMatches']:
            if value['geometry']!='not-inspected' or value['workArea']!='not-inspected': raise ValueError('PUBLIC_NATIVE_DIAGNOSTIC')
        elif value['geometry']!=('not-ready' if native['geometry'] is None else 'ready') or value['workArea']!=('not-ready' if native['workArea'] is None else 'ready'): raise ValueError('PUBLIC_NATIVE_DIAGNOSTIC')
    return {key:value[key] for key in ('pidMatch','primaryIdentity','secondaryIdentity','geometry','workArea')}

def observation(value):
    object_keys(value,('request','launcher','decoy','decoyActivationIssued'),('diagnostics',))
    result={'request':integer(value['request'],1,1000),'launcher':native_window(value['launcher']),'decoy':native_window(value['decoy']),
            'decoyActivationIssued':boolean(value['decoyActivationIssued'])}
    if 'diagnostics' in value:
        object_keys(value['diagnostics'],('launcher','decoy'))
        result['diagnostics']={key:window_diagnostic(value['diagnostics'][key],result[key]) for key in ('launcher','decoy')}
    return result

def hook_failure_reply(value):
    object_keys(value,('request','hookFailure'))
    failure=value['hookFailure'];object_keys(failure,('stage','outcome'))
    if type(failure['stage']) is not str or failure['stage'] not in ('enumerate','launcher','decoy','activation','publish'): raise ValueError('PUBLIC_HOOK_FAILURE')
    return {'request':integer(value['request'],1,1000),'hookFailure':{'stage':failure['stage'],'outcome':exact(failure['outcome'],'native-read-failed')}}

def native_diagnostic(value):
    object_keys(value,('phase','state'),('lastObservation','hookFailure'))
    if value['phase'] not in DIAGNOSTIC_PHASES or value['state'] not in ('request-written','reply-rejected','parsed','predicate-met','predicate-unmet','hook-failed'): raise ValueError('PUBLIC_NATIVE_PROGRESS')
    result={'phase':value['phase'],'state':value['state']}
    if 'lastObservation' in value:
        last=value['lastObservation'];object_keys(last,('phase','native'))
        if last['phase'] not in DIAGNOSTIC_PHASES: raise ValueError('PUBLIC_NATIVE_PROGRESS')
        result['lastObservation']={'phase':last['phase'],'native':observation(last['native'])}
    if (value['state']=='hook-failed')!=('hookFailure' in value): raise ValueError('PUBLIC_HOOK_FAILURE')
    if 'hookFailure' in value:
        result['hookFailure']=hook_failure_reply(value['hookFailure'])
        if 'lastObservation' in result and result['hookFailure']['request']<=result['lastObservation']['native']['request']: raise ValueError('PUBLIC_HOOK_REQUEST')
    return result


def consumer_read(value):
    names=('missing','other-serial','matching','parse-rejected','poll-error')
    object_keys(value,('request','pollCount','outcomes','pollsCapped','elapsedMs','elapsedCapped'))
    request=integer(value['request'],1,1000);count=integer(value['pollCount'],0,255)
    object_keys(value['outcomes'],names)
    outcomes={name:integer(value['outcomes'][name],0,255) for name in names}
    polls_capped=boolean(value['pollsCapped']);elapsed=integer(value['elapsedMs'],0,180000);elapsed_capped=boolean(value['elapsedCapped'])
    if sum(outcomes.values())!=count or polls_capped and count!=255 or elapsed_capped and elapsed!=180000:
        raise ValueError('PUBLIC_CONSUMER_RELATION')
    return {'request':request,'pollCount':count,'outcomes':outcomes,'pollsCapped':polls_capped,'elapsedMs':elapsed,'elapsedCapped':elapsed_capped}

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

OWNED_X11_KIND={'kind':'private-x11-ewmh-exact-owned-target','targetScope':'page-associated-browser-window','countScope':'exact-target','geometryKind':'ewmh-frame','decoy':'not-created'}
OWNED_X11_FAILURES=('binding','abi','identity','lifetime','native-query','overflow','guard','protocol','deadline')
def owned_x11_provenance(value):
    object_keys(value,(*OWNED_X11_KIND,'bindingObserved'),('geometryCapabilities',))
    for key,expected in OWNED_X11_KIND.items():exact(value[key],expected)
    result={**OWNED_X11_KIND,'bindingObserved':boolean(value['bindingObserved'])}
    if 'geometryCapabilities' in value:
        capabilities=value['geometryCapabilities'];object_keys(capabilities,('frame','workArea'))
        if not result['bindingObserved'] or any(type(capabilities[key]) is not str or capabilities[key] not in ('available','unavailable') for key in ('frame','workArea')):
            raise ValueError('PUBLIC_GEOMETRY_CAPABILITIES')
        result['geometryCapabilities']={key:capabilities[key] for key in ('frame','workArea')}
    return result

LIFECYCLE_SKIPPED=['ordinary-show-native-focus','actual-x11-global-shortcut']
LIFECYCLE_PHASES=('initial-native-launch','after-ui-quit-native-window-absent','fresh-lifecycle-native-launch','fresh-resident-native-hidden','after-hidden-cli-quit-native-window-absent')

def lifecycle_diagnostic(value,backend):
    if not backend.endswith('x11') or value['status'] not in ('incomplete','cleanup-incomplete'): raise ValueError('PUBLIC_LIFECYCLE_MODE')
    exact(value['probeMode'],'lifecycle-only');exact(value['skippedChecks'],LIFECYCLE_SKIPPED)
    if value['diagnosticOutcome'] not in ('complete','failed'): raise ValueError('PUBLIC_LIFECYCLE_OUTCOME')
    forbidden=('decoyActivationUsedForChallengeSetup','singletonShowRetainedPid','ordinaryShowNativeFocused','componentRequirementVisible','activationOutcome','shortcut')
    if any(key in value for key in forbidden): raise ValueError('PUBLIC_LIFECYCLE_ACTIVATION_FORBIDDEN')
    if value['stage'] not in ('build','first-launch','native-initial-identity','light-component-state','explicit-ui-quit','fresh-launch-hidden-cli-quit','complete','private-session'): raise ValueError('PUBLIC_LIFECYCLE_STAGE')
    rows=value['observations'];phases=[row['phase'] for row in rows]
    if phases!=list(LIFECYCLE_PHASES[:len(phases)]): raise ValueError('PUBLIC_LIFECYCLE_PHASE_SEQUENCE')
    capabilities=value.get('ownedTargetObserver',{}).get('geometryCapabilities')
    if capabilities is not None:
        own=[row['native']['launcher'] for row in rows if row['native']['launcher']['count']==1 and row['native']['launcher']['identityMatches'] and row['native']['launcher']['nativeBackend']=='x11']
        expected={key:'unavailable' if any(window[field] is None for window in own) else 'available' for key,field in (('frame','geometry'),('workArea','workArea'))}
        if backend!='kwin-x11' or not own or capabilities!=expected or 'initialPlacementInsideWorkArea' in value:
            raise ValueError('PUBLIC_GEOMETRY_CAPABILITIES_RELATION')
    for row in rows:
        phase=row['phase'];native=row['native'];window=native['launcher']
        if native['decoyActivationIssued']: raise ValueError('PUBLIC_LIFECYCLE_ACTIVATION_FORBIDDEN')
        # Failed identity/predicate observations remain safe failure evidence;
        # only a completed diagnostic may claim the strict phase proofs.
        if value['diagnosticOutcome']!='complete': continue
        if phase in ('initial-native-launch','fresh-lifecycle-native-launch'):
            if window['count']!=1 or not window['identityMatches'] or window['nativeBackend']!='x11' or capabilities is not None and window['hidden']:
                raise ValueError('PUBLIC_LIFECYCLE_IDENTITY')
            # Historical/other routes retain their strict placement evidence.
            # The explicit owned lifecycle capability variant claims only AC02.
            if capabilities is None:
                frame=window['geometry'];area=window['workArea']
                if frame is None or area is None:raise ValueError('PUBLIC_LIFECYCLE_IDENTITY')
                if frame['x']<area['x'] or frame['y']<area['y'] or frame['x']+frame['width']>area['x']+area['width']+1 or frame['y']+frame['height']>area['y']+area['height']+1: raise ValueError('PUBLIC_LIFECYCLE_PLACEMENT')
        elif phase=='fresh-resident-native-hidden':
            if not (window['count']==0 or window['hidden']): raise ValueError('PUBLIC_LIFECYCLE_HIDDEN')
        elif window['count']!=0: raise ValueError('PUBLIC_LIFECYCLE_QUIT')
    trace=value.get('nativeDiagnostic')
    if trace:
        if trace['phase'] not in LIFECYCLE_PHASES: raise ValueError('PUBLIC_LIFECYCLE_TRACE')
        last=trace.get('lastObservation')
        if last and (last['phase'] not in LIFECYCLE_PHASES or last['native']['decoyActivationIssued']): raise ValueError('PUBLIC_LIFECYCLE_TRACE')
    if 'lifecycleProof' in value:
        proof=value['lifecycleProof'];object_keys(proof,('launches','darkSearchCaptured','lightCapabilitiesCaptured','uiQuitExitCode','hiddenCliQuitExitCode','closeProcessAlive'))
        for key,expected in (('launches',2),('darkSearchCaptured',True),('lightCapabilitiesCaptured',True),('uiQuitExitCode',0),('hiddenCliQuitExitCode',0),('closeProcessAlive',True)):
            exact(proof[key],expected)
    if backend=='kwin-x11':
        if any(row['native']['decoy']!={'count':0,'identityMatches':False,'focused':False,'hidden':True,'geometry':None,'workArea':None,'nativeBackend':'unsupported'} for row in rows): raise ValueError('PUBLIC_OWNED_DECOY_FORBIDDEN')
        if value['diagnosticOutcome']=='complete' and (not value['ownedTargetObserver']['bindingObserved'] or 'ownedTargetFailure' in value): raise ValueError('PUBLIC_OWNED_TARGET_PROOF')
    if value['diagnosticOutcome']=='complete':
        flags=('closeRetainedResidentProcess','explicitUiQuitExited','hiddenCliQuitExited')+(() if capabilities is not None else ('initialPlacementInsideWorkArea',))
        if value['status']!='incomplete' or value['stage']!='complete' or phases!=list(LIFECYCLE_PHASES) or 'runtime' not in value or 'lifecycleProof' not in value or any(value.get(flag) is not True for flag in flags):
            raise ValueError('PUBLIC_LIFECYCLE_PROOF_REQUIRED')
        if trace and (trace['state']!='predicate-met' or trace['phase']!=LIFECYCLE_PHASES[-1]): raise ValueError('PUBLIC_LIFECYCLE_TRACE')
    return {key:value[key] for key in ('probeMode','skippedChecks','diagnosticOutcome','lifecycleProof') if key in value}

def public_result(value,backend):
    required=('task','backend','status','physicalDesktopMatrixEstablished','evidenceKind','kernel','hostDisplayClipboardInputOrSettingsUsed','launcherCompanionActivationOrPlacementUsed','observations','stage')
    object_keys(value,required,(*FLAGS,'runtime','activationOutcome','shortcut','nativeDiagnostic','observerStartup','consumerRead','probeMode','skippedChecks','diagnosticOutcome','lifecycleProof','ownedTargetObserver','ownedTargetFailure'))
    mode=value.get('probeMode','full')
    if type(mode) is not str or mode not in ('full','lifecycle-only'): raise ValueError('PUBLIC_PROBE_MODE')
    owned=backend=='kwin-x11' and mode=='lifecycle-only'
    if not owned and any(key in value for key in ('ownedTargetObserver','ownedTargetFailure')): raise ValueError('PUBLIC_OWNED_TARGET_ROUTE')
    if mode=='full' and any(key in value for key in ('skippedChecks','diagnosticOutcome','lifecycleProof')): raise ValueError('PUBLIC_FULL_MODE_REQUIRED')
    if backend not in BACKENDS or value['status'] not in ('passed-bounded-native-probe','incomplete','cleanup-incomplete','unavailable') or value['stage'] not in STAGES: raise ValueError('PUBLIC_RESULT_STATE')
    if type(value['kernel']) is not str or not re.fullmatch(r'[0-9][A-Za-z0-9_.+~-]{0,119}',value['kernel']): raise ValueError('PUBLIC_KERNEL_VERSION')
    result={'task':exact(value['task'],'S0-01'),'backend':exact(value['backend'],backend),'status':value['status'],
        'physicalDesktopMatrixEstablished':exact(value['physicalDesktopMatrixEstablished'],False),
        'evidenceKind':exact(value['evidenceKind'],'actual-isolated-software-compositor-launcher'),'kernel':value['kernel'],
        'hostDisplayClipboardInputOrSettingsUsed':exact(value['hostDisplayClipboardInputOrSettingsUsed'],False),
        'launcherCompanionActivationOrPlacementUsed':exact(value['launcherCompanionActivationOrPlacementUsed'],False),'stage':value['stage']}
    if owned:
        if 'ownedTargetObserver' not in value: raise ValueError('PUBLIC_OWNED_TARGET_REQUIRED')
        result['ownedTargetObserver']=owned_x11_provenance(value['ownedTargetObserver'])
        if 'ownedTargetFailure' in value:
            if type(value['ownedTargetFailure']) is not str or value['ownedTargetFailure'] not in OWNED_X11_FAILURES: raise ValueError('PUBLIC_OWNED_TARGET_FAILURE')
            result['ownedTargetFailure']=value['ownedTargetFailure']
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
    if 'nativeDiagnostic' in value: result['nativeDiagnostic']=native_diagnostic(value['nativeDiagnostic'])
    if 'consumerRead' in value: result['consumerRead']=consumer_read(value['consumerRead'])
    if 'observerStartup' in value:
        if not backend.startswith('gnome'): raise ValueError('PUBLIC_OBSERVER_BACKEND')
        result['observerStartup']=startup_diagnostic(value['observerStartup'])
    if 'runtime' in value: result['runtime']=runtime(value['runtime'],backend)
    if 'shortcut' in value: result['shortcut']=shortcut(value['shortcut'],backend)
    if 'activationOutcome' in value:
        if value['activationOutcome'] not in ACTIVATION: raise ValueError('PUBLIC_ACTIVATION_OUTCOME')
        result['activationOutcome']=value['activationOutcome']
    if result.get('nativeDiagnostic',{}).get('state')=='hook-failed' and (backend not in ('gnome-wayland','gnome-x11') or value['status']=='passed-bounded-native-probe'):
        raise ValueError('PUBLIC_HOOK_FAILURE_CANNOT_PASS')
    if mode=='lifecycle-only':
        object_keys({key:value[key] for key in ('probeMode','skippedChecks','diagnosticOutcome','lifecycleProof') if key in value},('probeMode','skippedChecks','diagnosticOutcome'),('lifecycleProof',))
        result.update(lifecycle_diagnostic({**result,**{key:value[key] for key in ('probeMode','skippedChecks','diagnosticOutcome','lifecycleProof') if key in value}},backend))
    else:
        if any(row['phase']=='fresh-lifecycle-native-launch' for row in result['observations']) or result.get('nativeDiagnostic',{}).get('phase')=='fresh-lifecycle-native-launch' or result.get('nativeDiagnostic',{}).get('lastObservation',{}).get('phase')=='fresh-lifecycle-native-launch': raise ValueError('PUBLIC_FULL_MODE_PHASE')
        if 'probeMode' in value: result['probeMode']='full'
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

def fallback_result(backend,probe_mode='full'):
    result={'task':'S0-01','backend':backend,'status':'unavailable','physicalDesktopMatrixEstablished':False,
        'evidenceKind':'actual-isolated-software-compositor-launcher','kernel':os.uname().release,
        'hostDisplayClipboardInputOrSettingsUsed':False,'launcherCompanionActivationOrPlacementUsed':False,'observations':[],'stage':'private-session'}
    if probe_mode=='lifecycle-only': result.update(probeMode=probe_mode,status='incomplete',skippedChecks=list(LIFECYCLE_SKIPPED),diagnosticOutcome='failed')
    if backend=='kwin-x11' and probe_mode=='lifecycle-only': result['ownedTargetObserver']={**OWNED_X11_KIND,'bindingObserved':False}
    elif probe_mode!='full' and probe_mode!='lifecycle-only': raise ValueError('PUBLIC_PROBE_MODE')
    return result

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
    if result.get('diagnosticOutcome')=='complete' and {name for _,name in screenshots}!={'dark-launcher.png','light-capabilities.png'}: raise ValueError('PUBLIC_LIFECYCLE_SCREENSHOTS_REQUIRED')
    result.update(privateProcessTreeCleanupVerified=True,packages=safe_packages)
    destination.mkdir(parents=True,exist_ok=True)
    (destination/'report.json').write_text(json.dumps(result,indent=2)+'\n')
    (destination/'source-manifest.json').write_text(json.dumps(provenance,indent=2)+'\n')
    for file,name in screenshots: shutil.copyfile(file,destination/name)
    return status,result['status']
