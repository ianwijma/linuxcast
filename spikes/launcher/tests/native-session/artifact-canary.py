"""Temporary public synthetic artifact fixtures; never native/Desktop evidence."""
import copy
import json
import pathlib
import sys
import tempfile
from artifacts import SOURCES, OUTPUTS, fallback_result, publish

case=sys.argv[1]
with tempfile.TemporaryDirectory(prefix='linuxcast-s001-artifact-test-') as temporary:
    root=pathlib.Path(temporary);destination=root/'published'
    report=fallback_result('gnome-wayland')
    manifest={'kind':'S0-01-private-native-compositor-probe','sourceSha256':{name:'a'*64 for name in SOURCES},
        'outputSha256':{name:'b'*64 for name in OUTPUTS},'designTokensSha256':'c'*64,'launcherDesktopFileSha256':'d'*64}
    runtime={'electron':'45.0.0','chrome':'156.0.8078.48','ozone':'wayland','noSandbox':False,'sandbox':True,'contextIsolation':True,'nodeIntegration':False,'webSecurity':True,
        'renderer':{'runtime':{'sandboxed':True,'contextIsolated':True},'process':'undefined','require':'undefined'}}
    def complete():
        value=fallback_result('gnome-wayland')
        empty={'count':0,'identityMatches':False,'nativeBackend':'unsupported','focused':False,'hidden':True,'geometry':None,'workArea':None}
        visible={'count':1,'identityMatches':True,'nativeBackend':'wayland','focused':False,'hidden':False,'geometry':{'x':32,'y':32,'width':720,'height':560},'workArea':{'x':0,'y':0,'width':1280,'height':900}}
        phases=('initial-native-launch','after-close-native-hidden','decoy-native-ready','decoy-focused-before-ordinary-show','ordinary-singleton-cli-show','wayland-singleton-toggle-hidden','wayland-singleton-reopened','after-ui-quit-native-window-absent','fresh-resident-native-hidden','after-hidden-cli-quit-native-window-absent')
        for index,phase in enumerate(phases):
            launcher=copy.deepcopy(visible if phase in ('initial-native-launch','ordinary-singleton-cli-show','wayland-singleton-reopened') else empty)
            decoy=copy.deepcopy(visible);decoy['focused']=phase=='decoy-focused-before-ordinary-show'
            value['observations'].append({'phase':phase,'native':{'request':index+1,'launcher':launcher,'decoy':decoy,'decoyActivationIssued':False}})
        value.update(status='passed-bounded-native-probe',stage='complete',runtime=runtime,shortcut={'state':'temporarily-unavailable','effectiveBindingExposed':False,'portalServicePresent':False,'consentOrEffectiveBindingProven':False},
            closeRetainedResidentProcess=True,decoyActivationUsedForChallengeSetup=True,singletonShowRetainedPid=True,explicitUiQuitExited=True,hiddenCliQuitExited=True,
            activationOutcome='actionable-component-required',initialPlacementInsideWorkArea=True,ordinaryShowNativeFocused=False,componentRequirementVisible=True)
        return value
    if case=='valid-complete':
        report=complete()
        status,state=publish(root,destination,report,manifest,'gnome-wayland',0,'')
        assert status==0 and state=='passed-bounded-native-probe'
        print(json.dumps({'case':case,'strictFixtureAccepted':True}));sys.exit(0)
    if case=='valid-incomplete':
        status,state=publish(root,destination,report,manifest,'gnome-wayland',3,'gnome-shell 48.7-0+deb13u1\n')
        assert status==3 and state=='unavailable'
        assert json.loads((destination/'report.json').read_text())['physicalDesktopMatrixEstablished'] is False
        print(json.dumps({'case':case,'strictFixtureAccepted':True}));sys.exit(0)
    if case=='unknown-top-level': report['private']='synthetic-private-canary'
    elif case=='nested-private-canary':
        report['runtime']=copy.deepcopy(runtime);report['runtime']['renderer']['runtime']['private']='synthetic-private-canary'
    elif case=='forged-physical': report['physicalDesktopMatrixEstablished']=True
    elif case=='unknown-stage': report['stage']='synthetic-private-canary'
    elif case=='invalid-runtime': report['runtime']=copy.deepcopy(runtime);report['runtime']['chrome']='synthetic-private-canary'
    elif case=='manifest-extra': manifest['private']='synthetic-private-canary'
    elif case=='manifest-source-extra': manifest['sourceSha256']['synthetic-private-canary']='a'*64
    elif case=='manifest-hash-private': manifest['sourceSha256']['build.ts']='synthetic-private-canary'
    elif case=='native-extra':
        empty={'count':0,'identityMatches':False,'nativeBackend':'unsupported','focused':False,'hidden':True,'geometry':None,'workArea':None}
        report['observations']=[{'phase':'after-close-native-hidden','native':{'request':1,'launcher':copy.deepcopy(empty),'decoy':copy.deepcopy(empty),'decoyActivationIssued':False}}]
        report['observations'][0]['native']['launcher']['private']='synthetic-private-canary'
    elif case=='forged-native-backend':
        report=complete();report['observations'][0]['native']['launcher']['nativeBackend']='x11'
    elif case=='missing-success-observations':
        report.update(status='passed-bounded-native-probe',stage='complete',runtime=runtime,shortcut={'state':'temporarily-unavailable','effectiveBindingExposed':False,'portalServicePresent':False,'consentOrEffectiveBindingProven':False},
            closeRetainedResidentProcess=True,decoyActivationUsedForChallengeSetup=True,singletonShowRetainedPid=True,explicitUiQuitExited=True,hiddenCliQuitExited=True,
            activationOutcome='actionable-component-required',initialPlacementInsideWorkArea=True,ordinaryShowNativeFocused=False,componentRequirementVisible=True)
    else: raise ValueError('UNKNOWN_ARTIFACT_CASE')
    # Even an existing screenshot must not publish if ANY schema is rejected.
    (root/'dark-launcher.png').write_bytes(b'\x89PNG\r\n\x1a\npublic synthetic fixture')
    try: publish(root,destination,report,manifest,'gnome-wayland',0,'')
    except ValueError: pass
    else: raise AssertionError('INVALID_ARTIFACT_PUBLISHED')
    assert not destination.exists()
    print(json.dumps({'case':case,'rejectedBeforePublication':True,'publishedFiles':0}))
