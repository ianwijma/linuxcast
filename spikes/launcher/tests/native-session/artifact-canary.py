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
    def diagnostic_report(zero=False):
        value=fallback_result('gnome-wayland');value.update(status='incomplete',stage='native-initial-identity')
        window={'count':0,'identityMatches':False,'nativeBackend':'unsupported','focused':False,'hidden':True,'geometry':None,'workArea':None}
        probe={'pidMatch':'none','primaryIdentity':'not-inspected','secondaryIdentity':'not-inspected','geometry':'not-inspected','workArea':'not-inspected'}
        launcher=copy.deepcopy(window);launcher_probe=copy.deepcopy(probe)
        if zero:
            launcher.update(count=1,identityMatches=True,nativeBackend='wayland',hidden=False,workArea={'x':0,'y':0,'width':1280,'height':900})
            launcher_probe.update(pidMatch='single',primaryIdentity='match',secondaryIdentity='empty',geometry='not-ready',workArea='ready')
        native={'request':1,'launcher':launcher,'decoy':window,'decoyActivationIssued':False,'diagnostics':{'launcher':launcher_probe,'decoy':probe}}
        value['nativeDiagnostic']={'phase':'initial-native-launch','state':'predicate-unmet','lastObservation':{'phase':'initial-native-launch','native':native}}
        return value
    def hook_report():
        value=diagnostic_report();value['stage']='resident-close'
        value['nativeDiagnostic'].update(phase='after-close-native-hidden',state='hook-failed',hookFailure={'request':2,'hookFailure':{'stage':'launcher','outcome':'native-read-failed'}})
        return value
    consumer={'request':2,'pollCount':3,'outcomes':{'missing':2,'other-serial':1,'matching':0,'parse-rejected':0,'poll-error':0},
              'pollsCapped':False,'elapsedMs':100,'elapsedCapped':False}
    if case.startswith('owned-') or case.startswith('valid-owned-'):
        from artifacts import OWNED_X11_KIND
        report=fallback_result('kwin-x11','lifecycle-only');backend='kwin-x11'
        if case in ('valid-owned-complete','owned-complete-unbound','owned-complete-failure','owned-complete-decoy','owned-complete-missing-phase'):
            from artifacts import LIFECYCLE_PHASES
            own={'count':1,'identityMatches':True,'nativeBackend':'x11','focused':False,'hidden':False,'geometry':{'x':32,'y':32,'width':720,'height':429},'workArea':{'x':0,'y':0,'width':1280,'height':900}}
            empty={'count':0,'identityMatches':False,'nativeBackend':'unsupported','focused':False,'hidden':True,'geometry':None,'workArea':None}
            report.update(stage='complete',diagnosticOutcome='complete',initialPlacementInsideWorkArea=True,closeRetainedResidentProcess=True,explicitUiQuitExited=True,hiddenCliQuitExited=True,
                lifecycleProof={'launches':2,'darkSearchCaptured':True,'lightCapabilitiesCaptured':True,'uiQuitExitCode':0,'hiddenCliQuitExitCode':0,'closeProcessAlive':True},runtime=copy.deepcopy(runtime))
            report['runtime']['ozone']='x11';report['ownedTargetObserver']['bindingObserved']=True
            for index,phase in enumerate(LIFECYCLE_PHASES):
                report['observations'].append({'phase':phase,'native':{'request':index+1,'launcher':copy.deepcopy(own if phase in ('initial-native-launch','fresh-lifecycle-native-launch') else empty),'decoy':copy.deepcopy(empty),'decoyActivationIssued':False}})
            for name in ('dark-launcher.png','light-capabilities.png'):(root/name).write_bytes(b'\x89PNG\r\n\x1a\npublic synthetic fixture')
            if case=='owned-complete-unbound':report['ownedTargetObserver']['bindingObserved']=False
            elif case=='owned-complete-failure':report['ownedTargetFailure']='lifetime'
            elif case=='owned-complete-decoy':report['observations'][0]['native']['decoy']=copy.deepcopy(own)
            elif case=='owned-complete-missing-phase':report['observations'].pop()
        elif case=='valid-owned-failed':pass
        elif case=='owned-extra':report['ownedTargetObserver']['xid']=123
        elif case=='owned-private':report['ownedTargetObserver']['private']='synthetic-private-canary'
        elif case=='owned-pid-count':report['ownedTargetObserver']['countScope']='all-pid-windows'
        elif case=='owned-kind':report['ownedTargetObserver']['kind']='synthetic-private-canary'
        elif case=='owned-bound-bool':report['ownedTargetObserver']['bindingObserved']=1
        elif case=='owned-no-provenance':del report['ownedTargetObserver']
        elif case=='owned-failure-private':report['ownedTargetFailure']={'private':'synthetic-private-canary'}
        elif case=='owned-failure-unknown':report['ownedTargetFailure']='synthetic-private-canary'
        elif case=='owned-wrong-route':backend='gnome-x11';report['backend']=backend
        elif case=='owned-full-route':report['probeMode']='full'
        elif case=='valid-owned-failure':report['ownedTargetFailure']='identity'
        else:raise ValueError('UNKNOWN_OWNED_FIXTURE')
        if case.startswith('valid-'):
            status,state=publish(root,destination,report,manifest,backend,3,'')
            assert status==3 and state=='incomplete'
            print(json.dumps({'strictFixtureAccepted':True}));sys.exit(0)
        try:publish(root,destination,report,manifest,backend,3,'')
        except ValueError:pass
        else:raise AssertionError('INVALID_OWNED_SCOPE_PUBLISHED')
        assert not destination.exists();print(json.dumps({'rejectedBeforePublication':True,'publishedFiles':0}));sys.exit(0)
    if case.startswith(('lifecycle-','valid-lifecycle-')) or case=='full-lifecycle-phase':
        from artifacts import LIFECYCLE_PHASES,LIFECYCLE_SKIPPED
        backend='gnome-x11';report=fallback_result(backend,'lifecycle-only')
        own={'count':1,'identityMatches':True,'nativeBackend':'x11','focused':False,'hidden':False,'geometry':{'x':32,'y':32,'width':720,'height':560},'workArea':{'x':0,'y':0,'width':1280,'height':900}}
        empty={'count':0,'identityMatches':False,'nativeBackend':'unsupported','focused':False,'hidden':True,'geometry':None,'workArea':None}
        report.update(stage='complete',diagnosticOutcome='complete',initialPlacementInsideWorkArea=True,closeRetainedResidentProcess=True,explicitUiQuitExited=True,hiddenCliQuitExited=True,
            lifecycleProof={'launches':2,'darkSearchCaptured':True,'lightCapabilitiesCaptured':True,'uiQuitExitCode':0,'hiddenCliQuitExitCode':0,'closeProcessAlive':True},runtime=copy.deepcopy(runtime))
        report['runtime']['ozone']='x11'
        for index,phase in enumerate(LIFECYCLE_PHASES):
            report['observations'].append({'phase':phase,'native':{'request':index+1,'launcher':copy.deepcopy(own if phase in ('initial-native-launch','fresh-lifecycle-native-launch') else empty),'decoy':copy.deepcopy(empty),'decoyActivationIssued':False}})
        for name in ('dark-launcher.png','light-capabilities.png'): (root/name).write_bytes(b'\x89PNG\r\n\x1a\npublic synthetic fixture')
        if case in ('valid-lifecycle-failed','valid-lifecycle-identity-failed'):
            report=fallback_result(backend,'lifecycle-only')
            if case=='valid-lifecycle-identity-failed':
                report['stage']='native-initial-identity'
                report['observations']=[{'phase':'initial-native-launch','native':{'request':1,'launcher':copy.deepcopy(empty),'decoy':copy.deepcopy(empty),'decoyActivationIssued':False}}]
                report['observations'][0]['native']['launcher']['count']=1
        elif case=='lifecycle-passed':report['status']='passed-bounded-native-probe'
        elif case=='lifecycle-missing-mode':del report['probeMode']
        elif case=='lifecycle-wayland':backend='gnome-wayland';report['backend']=backend;report['runtime']['ozone']='wayland'
        elif case=='lifecycle-unknown-mode':report['probeMode']='synthetic-private-canary'
        elif case=='lifecycle-extra':report['private']='synthetic-private-canary'
        elif case=='lifecycle-private-proof':report['lifecycleProof']['private']='synthetic-private-canary'
        elif case=='lifecycle-no-proof':del report['lifecycleProof']
        elif case=='lifecycle-exit-bool':report['lifecycleProof']['uiQuitExitCode']=False
        elif case=='lifecycle-exit-nonzero':report['lifecycleProof']['hiddenCliQuitExitCode']=7
        elif case=='lifecycle-no-runtime':del report['runtime']
        elif case=='lifecycle-no-screenshot':(root/'light-capabilities.png').unlink()
        elif case=='lifecycle-missing-observation':report['observations'].pop()
        elif case=='lifecycle-phase-reorder':report['observations'][0]['phase']=LIFECYCLE_PHASES[1]
        elif case=='lifecycle-cross-phase':report['observations'][1]['phase']='ordinary-singleton-cli-show'
        elif case=='lifecycle-forged-identity':report['observations'][0]['native']['launcher']=copy.deepcopy(empty)
        elif case=='lifecycle-outside-workarea':report['observations'][0]['native']['launcher']['geometry']['x']=-500
        elif case=='lifecycle-visible-close':report['observations'][3]['native']['launcher']=copy.deepcopy(own)
        elif case=='lifecycle-nonabsent-quit':report['observations'][1]['native']['launcher']=copy.deepcopy(own)
        elif case=='lifecycle-trace-cross-phase':report['nativeDiagnostic']={'phase':'ordinary-show-native-focus','state':'predicate-unmet'}
        elif case=='lifecycle-trace-hook':report['nativeDiagnostic']={'phase':LIFECYCLE_PHASES[-1],'state':'hook-failed','hookFailure':{'request':6,'hookFailure':{'stage':'launcher','outcome':'native-read-failed'}}}
        elif case=='lifecycle-activation-issued':report['observations'][0]['native']['decoyActivationIssued']=True
        elif case=='lifecycle-focus-claim':report['ordinaryShowNativeFocused']=True
        elif case=='lifecycle-shortcut-claim':report['shortcut']={'state':'available','nativeXTestActivationObserved':True,'effective':'Ctrl+Alt+Shift+F12'}
        elif case=='lifecycle-activation-claim':report['activationOutcome']='normal-show-and-shortcut-native-focus-observed'
        elif case=='lifecycle-skips-reordered':report['skippedChecks'].reverse()
        elif case=='lifecycle-skips-extra':report['skippedChecks'].append('synthetic-private-canary')
        elif case=='lifecycle-outcome-private':report['diagnosticOutcome']='synthetic-private-canary'
        elif case=='full-lifecycle-phase':
            report=complete();backend='gnome-wayland';report['observations'][0]['phase']='fresh-lifecycle-native-launch'
        elif case!='valid-lifecycle-complete':raise ValueError('UNKNOWN_LIFECYCLE_FIXTURE')
        if case.startswith('valid-'):
            status,state=publish(root,destination,report,manifest,backend,3,'')
            saved=json.loads((destination/'report.json').read_text())
            assert status==3 and state=='incomplete' and saved['probeMode']=='lifecycle-only'
            assert saved['diagnosticOutcome']==('complete' if case=='valid-lifecycle-complete' else 'failed')
            print(json.dumps({'strictFixtureAccepted':True}));sys.exit(0)
        try:publish(root,destination,report,manifest,backend,3,'')
        except ValueError:pass
        else:raise AssertionError('INVALID_LIFECYCLE_ARTIFACT_PUBLISHED')
        assert not destination.exists();print(json.dumps({'rejectedBeforePublication':True,'publishedFiles':0}));sys.exit(0)
    if case in ('valid-consumer','valid-consumer-zero','valid-consumer-capped'):
        report['consumerRead']=copy.deepcopy(consumer)
        if case=='valid-consumer-zero':
            report['consumerRead'].update(pollCount=0,outcomes={name:0 for name in consumer['outcomes']})
        if case=='valid-consumer-capped':
            report['consumerRead'].update(pollCount=255,outcomes={name:255 if name=='missing' else 0 for name in consumer['outcomes']},pollsCapped=True,elapsedMs=180000,elapsedCapped=True)
        status,state=publish(root,destination,report,manifest,'gnome-wayland',3,'')
        assert status==3 and state=='unavailable'
        assert json.loads((destination/'report.json').read_text())['consumerRead']==report['consumerRead']
        print(json.dumps({'case':case,'strictFixtureAccepted':True}));sys.exit(0)
    if case=='valid-hook-failed':
        report=hook_report()
        status,state=publish(root,destination,report,manifest,'gnome-wayland',3,'')
        assert status==3 and state=='incomplete'
        saved=json.loads((destination/'report.json').read_text())
        assert saved['nativeDiagnostic']['lastObservation']['native']['request']==1
        assert saved['nativeDiagnostic']['hookFailure']['request']==2
        print(json.dumps({'case':case,'strictFixtureAccepted':True}));sys.exit(0)
    startup={'latest':{'checkpoints':['MODULE_ENTERED','PRIVATE_CONTEXT_REJECTED'],'requests':[],
        'extensionInfo':{'status':'INFO_AVAILABLE','state':1,'enabled':True}}}
    if case=='valid-startup':
        report['observerStartup']=startup
        status,state=publish(root,destination,report,manifest,'gnome-wayland',3,'')
        assert status==3 and state=='unavailable'
        print(json.dumps({'case':case,'strictFixtureAccepted':True}));sys.exit(0)
    if case in ('valid-diagnostic','valid-zero-geometry'):
        report=diagnostic_report(case=='valid-zero-geometry')
        status,state=publish(root,destination,report,manifest,'gnome-wayland',3,'')
        assert status==3 and state=='incomplete'
        print(json.dumps({'case':case,'strictFixtureAccepted':True}));sys.exit(0)
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
    if case.startswith('consumer-'):
        report['consumerRead']=copy.deepcopy(consumer);saved=report['consumerRead']
        if case=='consumer-private':saved['private']='synthetic-private-canary'
        elif case=='consumer-outcome-private':saved['outcomes']['private']='synthetic-private-canary'
        elif case=='consumer-request-bool':saved['request']=True
        elif case=='consumer-count-bool':saved['pollCount']=True
        elif case=='consumer-count-over':saved['pollCount']=256
        elif case=='consumer-count-negative':saved['pollCount']=-1
        elif case=='consumer-count-fraction':saved['pollCount']=1.5
        elif case=='consumer-count-nan':saved['pollCount']=float('nan')
        elif case=='consumer-sum':saved['outcomes']['missing']=1
        elif case=='consumer-poll-cap':saved['pollsCapped']=True
        elif case=='consumer-flag-type':saved['pollsCapped']=1
        elif case=='consumer-outcome-type':saved['outcomes']['missing']='synthetic-private-canary'
        elif case=='consumer-outcome-bool':saved['outcomes']['missing']=True
        elif case=='consumer-elapsed-cap':saved['elapsedCapped']=True
        elif case=='consumer-elapsed-nan':saved['elapsedMs']=float('nan')
        elif case=='consumer-elapsed-inf':saved['elapsedMs']=float('inf')
        elif case=='consumer-elapsed-over':saved['elapsedMs']=180001
        else:raise ValueError('UNKNOWN_CONSUMER_CASE')
    elif case=='unknown-top-level': report['private']='synthetic-private-canary'
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
    elif case in ('diagnostic-extra','diagnostic-last-private','diagnostic-state-private','diagnostic-role-private','diagnostic-inconsistent','forged-success-not-ready'):
        report=diagnostic_report()
        trace=report['nativeDiagnostic'];native=trace['lastObservation']['native']
        if case=='diagnostic-extra': trace['private']='synthetic-private-canary'
        elif case=='diagnostic-last-private': native['launcher']['private']='synthetic-private-canary'
        elif case=='diagnostic-state-private': trace['state']='synthetic-private-canary'
        elif case=='diagnostic-role-private': native['diagnostics']['launcher']['private']='synthetic-private-canary'
        elif case=='diagnostic-inconsistent': native['diagnostics']['launcher']['pidMatch']='single'
        else:
            report=complete();report['observations'][0]['native']['launcher']['geometry']=None
    elif case in ('hook-extra','hook-nested-private','hook-stage-private','hook-outcome-private','hook-stale','hook-missing','hook-wrong-state','hook-forged-success','hook-kwin'):
        report=hook_report();trace=report['nativeDiagnostic'];failure=trace['hookFailure']
        if case=='hook-extra': failure['private']='synthetic-private-canary'
        elif case=='hook-nested-private': failure['hookFailure']['private']='synthetic-private-canary'
        elif case=='hook-stage-private': failure['hookFailure']['stage']='synthetic-private-canary'
        elif case=='hook-outcome-private': failure['hookFailure']['outcome']='synthetic-private-canary'
        elif case=='hook-stale': failure['request']=1
        elif case=='hook-missing': del trace['hookFailure']
        elif case=='hook-wrong-state': trace['state']='parsed'
        elif case=='hook-forged-success': report=complete();report['nativeDiagnostic']=trace
        else:
            from artifacts import public_result
            report['backend']='kwin-wayland'
            try: public_result(report,'kwin-wayland')
            except ValueError: pass
            else: raise AssertionError('KWIN_HOOK_FAILURE_ACCEPTED')
            print(json.dumps({'case':case,'rejectedBeforePublication':True,'publishedFiles':0}));sys.exit(0)
    elif case in ('startup-extra','startup-nested-private','startup-unknown-marker','startup-state-type','startup-request-private','startup-request-bound'):
        report['observerStartup']=copy.deepcopy(startup);saved=report['observerStartup']
        if case=='startup-extra': saved['private']='synthetic-private-canary'
        elif case=='startup-nested-private': saved['latest']['extensionInfo']['error']='synthetic-private-canary'
        elif case=='startup-unknown-marker': saved['latest']['checkpoints'].append('synthetic-private-canary')
        elif case=='startup-state-type': saved['latest']['extensionInfo']['state']='1'
        elif case=='startup-request-private': saved['latest']['requests']=[{'event':'REQUEST_VALIDATED','request':1,'private':'synthetic-private-canary'}]
        else:saved['latest']['requests']=[{'event':'REQUEST_VALIDATED','request':1}]*17
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
