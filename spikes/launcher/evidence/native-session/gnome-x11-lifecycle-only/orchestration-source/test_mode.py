"""Synthetic proposal-only boundaries; no archive preparation or native action."""
import base64
import copy
import importlib
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import collect
import host
sys.path.insert(0,'/tmp/linuxcast-s001-lifecycle-only-preparation-source/spikes/launcher/tests/native-session')
artifacts=importlib.import_module('artifacts')


def report_fixture():
    value=artifacts.fallback_result('gnome-x11','lifecycle-only')
    value.update(stage='complete',diagnosticOutcome='complete',initialPlacementInsideWorkArea=True,closeRetainedResidentProcess=True,explicitUiQuitExited=True,hiddenCliQuitExited=True,
        lifecycleProof={'launches':2,'darkSearchCaptured':True,'lightCapabilitiesCaptured':True,'uiQuitExitCode':0,'hiddenCliQuitExitCode':0,'closeProcessAlive':True},
        runtime={'electron':'45.0.0','chrome':'156.0.8078.48','ozone':'x11','noSandbox':False,'sandbox':True,'contextIsolation':True,'nodeIntegration':False,'webSecurity':True,
            'renderer':{'runtime':{'sandboxed':True,'contextIsolated':True},'process':'undefined','require':'undefined'}})
    own={'count':1,'identityMatches':True,'nativeBackend':'x11','focused':False,'hidden':False,'geometry':{'x':32,'y':32,'width':720,'height':560},'workArea':{'x':0,'y':0,'width':1280,'height':900}}
    empty={'count':0,'identityMatches':False,'nativeBackend':'unsupported','focused':False,'hidden':True,'geometry':None,'workArea':None}
    for index,phase in enumerate(artifacts.LIFECYCLE_PHASES):
        value['observations'].append({'phase':phase,'native':{'request':index+1,'launcher':copy.deepcopy(own if phase in ('initial-native-launch','fresh-lifecycle-native-launch') else empty),'decoy':copy.deepcopy(empty),'decoyActivationIssued':False}})
    value.update(privateProcessTreeCleanupVerified=True,packages=['gnome-shell 48.7'])
    return value


class ModeChecks(unittest.TestCase):
    def test_exact_arguments_and_bad_entry_before_any_child(self):
        self.assertEqual(collect.RUNNER_ARGUMENTS,('gnome-x11','--private-guest','--probe-mode','lifecycle-only'))
        for module in (collect,host):
            with patch.object(sys,'argv',['invalid-entry']), patch.object(module.subprocess,'Popen') as spawn:
                with self.assertRaises(ValueError):module.main()
                spawn.assert_not_called()

    def test_complete_selected_is_incomplete_exit_three(self):
        report=collect.public_report(report_fixture(),artifacts)
        self.assertEqual(report['status'],'incomplete')
        self.assertTrue(collect.selected_checks_completed(report,3,set(collect.PNG_NAMES)))
        self.assertTrue(collect.selected_completion_evidence(report,3,set(collect.PNG_NAMES),'completed',True,{'cleanReleaseVerified':True}))

    def test_failed_selected_cannot_promote(self):
        report=artifacts.fallback_result('gnome-x11','lifecycle-only')
        report.update(privateProcessTreeCleanupVerified=True,packages=[])
        self.assertEqual(collect.public_report(report,artifacts),report)
        self.assertFalse(collect.selected_completion_evidence(report,3,set(),'completed',True,{'cleanReleaseVerified':True}))
        self.assertFalse(collect.selected_completion_evidence(None,None,set(),'collector-rejected',False,{'cleanReleaseVerified':True}))

    def test_no_inherited_full_pass_or_mode_fallback(self):
        for change in (lambda row:row.pop('probeMode'),lambda row:row.update(probeMode='full'),lambda row:row.update(probeMode='shortcut-only'),
                       lambda row:row.update(status='passed-bounded-native-probe'),lambda row:row.update(activationOutcome='normal-show-and-shortcut-native-focus-observed'),
                       lambda row:row.update(ordinaryShowNativeFocused=True),lambda row:row.update(private={'private':'synthetic-private-canary'})):
            row=report_fixture();change(row)
            with self.assertRaises(ValueError):collect.public_report(row,artifacts)

    def test_zero_bool_and_noninteger_codes_cannot_be_selected(self):
        for code in (0,False,True,None,3.0,'3',-15):
            with self.assertRaises(ValueError):collect.selected_checks_completed(report_fixture(),code,set(collect.PNG_NAMES))

    def test_complete_requires_both_fixed_images(self):
        for names in (set(),{'dark-launcher.png'},{'light-capabilities.png'},{'dark-launcher.png','private-canary'}):
            with self.assertRaises(ValueError):collect.selected_checks_completed(report_fixture(),3,names)

    def test_cleanup_unknown_source_and_noncompleted_outcomes_prevent_completion(self):
        row=report_fixture()
        for outcome,unchanged,clean in (('runner-timeout',True,True),('cancelled',True,True),('collector-rejected',True,True),('completed',False,True),('completed',True,False)):
            self.assertFalse(collect.selected_completion_evidence(row,3,set(collect.PNG_NAMES),outcome,unchanged,{'cleanReleaseVerified':clean}))

    def test_capture_does_not_accept_full_or_missing_light(self):
        snapshot=pathlib.Path('/tmp/linuxcast-s001-lifecycle-only-immutable')
        authority=json.loads((snapshot/'authority.json').read_text());manifest=json.loads((snapshot/'build-manifest.json').read_text())
        with tempfile.TemporaryDirectory(prefix='linuxcast-lifecycle-proposal-') as temporary:
            root=pathlib.Path(temporary)
            (root/'report.json').write_text(json.dumps(report_fixture()));(root/'source-manifest.json').write_text(json.dumps(manifest))
            (root/'dark-launcher.png').write_bytes(b'\x89PNG\r\n\x1a\npublic synthetic')
            with self.assertRaises(ValueError):collect.capture(root,authority,artifacts,3,manifest)
            (root/'light-capabilities.png').write_bytes(b'\x89PNG\r\n\x1a\npublic synthetic')
            files,_=collect.capture(root,authority,artifacts,3,manifest)
            self.assertEqual(set(files),{'report.json','source-manifest.json',*collect.PNG_NAMES})
            with self.assertRaises(ValueError):collect.capture(root,authority,artifacts,0,manifest)

    def response_fixture(self):
        # Reuse already-public prior metadata solely for scalar/header fixtures.
        # These bytes do NOT constitute an authority for the new source/mode.
        prior=pathlib.Path('/tmp/linuxcast-s0-01/spikes/launcher/evidence/native-session/gnome-x11-explicit-focus')
        provenance=json.loads((prior/'provenance.json').read_text());cleanup=json.loads((prior/'cleanup.json').read_text())
        authority=json.loads((host.IMMUTABLE/'authority.json').read_text());manifest=json.loads((host.IMMUTABLE/'build-manifest.json').read_text())
        provenance.pop('signedRuntimeCommit');provenance.pop('verifiedRuntimeCommit')
        provenance.update(probeMode='lifecycle-only',selectedChecksCompleted=True,sourceSigned=False,sourceDirty=True,runtimeInputsMatchSignedCommit=False,
            verifiedSignedBaselineCommit=collect.SIGNED_BASELINE,unsignedRuntimeInputs=list(collect.UNSIGNED_RUNTIME_INPUTS),executedRuntimeCommit=None,
            reviewedIncrementSha256=collect.INCREMENT,archiveConstruction=dict(collect.ARCHIVE_CONSTRUCTION),archiveSha256=collect.ARCHIVE_HASH,
            sourceArchiveAuthoritySha256=collect.AUTHORITY_HASH,sourceSha256=authority['sourceSha256'],outputSha256=manifest['outputSha256'],collectorSha256=host.COLLECTOR_HASH)
        files={'report.json':collect.json_bytes(report_fixture()),'source-manifest.json':collect.json_bytes(manifest),
               'provenance.json':collect.json_bytes(provenance),'cleanup.json':collect.json_bytes(cleanup)}
        files.update({name:b'\x89PNG\r\n\x1a\npublic synthetic' for name in collect.PNG_NAMES})
        release=json.loads((prior/'release.json').read_text())
        response={key:release[key] for key in ('phase','collectorExitCode','before','release','ownedGuestCapsuleRemoved','expectedToolSha256','toolsVerifiedBeforeAndAfter')}
        response['files']={name:base64.b64encode(data).decode() for name,data in files.items()}
        return response,authority,manifest,provenance

    def test_host_selected_completion_correlated_with_report_and_cleanup(self):
        response,authority,manifest,_=self.response_fixture()
        files,release=host.public_response(collect.json_bytes(response),collect,authority,artifacts,manifest)
        self.assertEqual(release['collectorExitCode'],3)
        self.assertTrue(json.loads(files['provenance.json'])['selectedChecksCompleted'])
        self.assertEqual(json.loads(files['report.json'])['status'],'incomplete')

    def test_host_cannot_promote_false_complete_or_inherit_old_provenance(self):
        for change in (lambda row:row.pop('probeMode'),lambda row:row.update(probeMode='full'),lambda row:row.update(selectedChecksCompleted=False),
                       lambda row:row.update(selectedChecksCompleted=1),lambda row:row.update(sourceUnchangedDuringRun=False,executedRuntimeCommit=None),
                       lambda row:row.update(exitCode=0,selectedChecksCompleted=False),
                       lambda row:row.update(private={'private':'synthetic-private-canary'})):
            response,authority,manifest,provenance=self.response_fixture();change(provenance)
            response['files']['provenance.json']=base64.b64encode(collect.json_bytes(provenance)).decode()
            with self.assertRaises(ValueError):host.public_response(collect.json_bytes(response),collect,authority,artifacts,manifest)

    def test_host_zero_exit_and_forged_cleanup_cannot_pass(self):
        response,authority,manifest,_=self.response_fixture();response['collectorExitCode']=0
        with self.assertRaises(ValueError):host.public_response(collect.json_bytes(response),collect,authority,artifacts,manifest)
        response,authority,manifest,_=self.response_fixture()
        cleanup=json.loads(base64.b64decode(response['files']['cleanup.json']))
        cleanup['afterRelease']['fixedProcessCounts']['node']=1;cleanup['cleanReleaseVerified']=False
        response['files']['cleanup.json']=base64.b64encode(collect.json_bytes(cleanup)).decode()
        with self.assertRaises(ValueError):host.public_response(collect.json_bytes(response),collect,authority,artifacts,manifest)

    def test_guest_phase_lifetime_and_existing_limits_are_unchanged(self):
        previous=pathlib.Path('/tmp/linuxcast-s001-x11-focus-collector-review/guest_phase.py').read_bytes()
        self.assertEqual((pathlib.Path(__file__).parent/'guest_phase.py').read_bytes(),previous)
        self.assertEqual(collect.socket_layout(pathlib.Path('/home/debian/lc1-xxxxxxxx/source')),
                         {'privateSessionBus':78,'nativeWaylandSocket':96,'runtimeBus':77,'atSpiSocket':95})

if __name__=='__main__':unittest.main(verbosity=2)
