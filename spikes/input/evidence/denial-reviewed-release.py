"""Necessary owned-resource release after a preserved incomplete wrapper.
Offline review first. No probe, tests, input marker, native replacement or retry.
This never modifies frozen collectors, control state values, or prior outcomes.
"""
import hashlib,importlib.util,json,os,pathlib,re,stat,sys,time
MANIFEST=pathlib.Path('/tmp/linuxcast-s003-denial-collectors.sha256')
MANIFEST_SHA='9da26182246f7b1ac8958fbd28ec70e8321279b07693ace23dd62734bb35a170'
OUTCOME_SHA='f0aab921a8e525a183c2b56fe86c2390ffde3d4113e86a7d892db7828d2b5be8'
TOOL_PATHS=('/tmp/linuxcast-node24','/tmp/linuxcast-node24/node','/tmp/linuxcast-bun144','/tmp/linuxcast-bun144/bun-linux-x64','/tmp/linuxcast-bun144/bun-linux-x64/bun')

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def module(name):
 path=pathlib.Path('/tmp/linuxcast-s003-denial-'+name+'.py')
 spec=importlib.util.spec_from_file_location('fixed_'+name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

def verify_sources():
 assert sha(MANIFEST)==MANIFEST_SHA
 for line in MANIFEST.read_text().splitlines():
  expected,name=line.split('  ',1);assert sha(pathlib.Path(name))==expected
 control=module('control');control.verify_frozen();baseline=module('baseline')
 return control,baseline

def validate_baseline(value,runtimes_present):
 assert set(value)=={'schemaVersion','task','operation','distribution','debianVersion','kernel','architecture','libsystemdVersion','libevdevVersion','processCounts','inputProcessesAbsent','graphicalSessionsAbsent','markerAbsent','manufacturedDevicesAbsent','privateRootsAbsent','dedicatedNonloginAccountValid','acceptedArtifacts','nodeChecksumMatches','acceptedBunFound','fixturePackageVersions','inputProgramsExecuted','markerCreated','policyChanged','ready'}
 assert value['operation']=='READ_ONLY_PREFLIGHT' and value['task']=='S0-03' and value['schemaVersion']==1
 assert value['distribution']=='debian' and value['debianVersion']=='13.7' and value['kernel']=='6.12.113+deb13-amd64' and value['architecture']=='x86_64'
 assert value['libsystemdVersion']=='257.13-1~deb13u1' and value['libevdevVersion']=='1.13.4+dfsg-1'
 assert value['processCounts']=={'gnome-shell':0,'kwin_wayland':0,'kwin_x11':0,'Xvfb':0,'electron':0,'node':0,'gdb':0,'dbus-daemon':2}
 assert all(value[k]is True for k in ('inputProcessesAbsent','graphicalSessionsAbsent','markerAbsent','manufacturedDevicesAbsent','privateRootsAbsent','dedicatedNonloginAccountValid'))
 assert set(value['acceptedArtifacts'])=={'linuxcast-input-spike-supervisor','linuxcast-input-spike-worker','linuxcast-input-spike-synthetic-lab'}
 expected={'linuxcast-input-spike-supervisor':'1060b44313a1536926d89303625b9f91272a1f59a5d05ac803e026843e11ef7a','linuxcast-input-spike-worker':'45fae18d283eee7bfbff39fbe060b29c040d951db248d04bc5aa5eba1ce00eb8','linuxcast-input-spike-synthetic-lab':'9211ceb29ae2373717f2fc74d591544898ac2931c3f83deaf21186b7b6da7e51'}
 for name,wanted in expected.items():
  item=value['acceptedArtifacts'][name];assert item=={'sha256':wanted,'expectedSha256':wanted,'rootOwnedRegularNonWritable':True,'matches':True}
 assert value['fixturePackageVersions']=={'vitest':'4.1.12','vite':'7.3.7','typescript':'6.0.3'}
 assert all(value[k]is runtimes_present for k in ('nodeChecksumMatches','acceptedBunFound','ready'))
 assert all(value[k]is False for k in ('inputProgramsExecuted','markerCreated','policyChanged'))

# These fixed statements inspect only process executable paths and our known
# private root names. Nothing reads process arguments, user payloads or devices.
STAGE_CHECK=r'''
import json,os,pathlib,stat
allowed=set(STAGES);assert allowed
found={str(p) for p in pathlib.Path('/tmp').glob('linuxcast-s003-denial-stage-*')}
assert found==allowed
for text in STAGES:
 p=pathlib.Path(text);m=p.lstat();assert p.parent==pathlib.Path('/tmp') and p.name.startswith('linuxcast-s003-denial-stage-') and stat.S_ISDIR(m.st_mode) and m.st_uid==1000 and stat.S_IMODE(m.st_mode)==0o700
for p in pathlib.Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:exe=os.readlink(p/'exe')
 except OSError:continue
 assert not any(exe.startswith(s+'/') for s in STAGES) and exe not in ('/tmp/linuxcast-node24/node','/tmp/linuxcast-bun144/bun-linux-x64/bun')
print(json.dumps({'onlyOwnedPrivateStagesPresent':True,'ownedStageAndRuntimeExecutablesAbsent':True}))
'''
REMOVE_STAGE=r'''
import json,os,pathlib,shutil,stat
p=pathlib.Path(STAGE);m=p.lstat();assert stat.S_ISDIR(m.st_mode) and m.st_uid==1000 and stat.S_IMODE(m.st_mode)==0o700 and (m.st_dev,m.st_ino)==tuple(IDENTITY)
assert p.parent==pathlib.Path('/tmp') and p.name.startswith('linuxcast-s003-denial-stage-') and not pathlib.Path('/run/linuxcast-input-spike-lab').exists()
for proc in pathlib.Path('/proc').iterdir():
 if not proc.name.isdigit():continue
 try:exe=os.readlink(proc/'exe')
 except OSError:continue
 assert not exe.startswith(str(p)+'/')
shutil.rmtree(p);assert not p.exists() and not p.is_symlink();print(json.dumps({'ownedStageRemoved':True}))
'''
FINAL_CHECK=r'''
import json,os,pathlib
assert all(not os.path.lexists(p) for p in TOOLS)
assert not any(pathlib.Path('/tmp').glob('linuxcast-s003-denial-stage-*'))
print(json.dumps({'allFiveCreatedToolPathsMissing':True,'allOwnedStagePathsMissing':True}))
'''

def main():
 assert sys.argv[1:]==['--release-reviewed-owned-resources']
 started=time.monotonic();control,baseline=verify_sources()
 evidence=control.ROOT/'spikes/input/evidence';outcome=evidence/'denial-kernel-regression.json';assert sha(outcome)==OUTCOME_SHA
 prior=json.loads(outcome.read_text());assert prior['complete']is False and prior['survivingGroupDetected']is True and prior['phaseFailed']is True and prior['exitCode']==0 and prior['mappedTestsPassed']==2
 assert prior['cleanup']['withinCleanupBudget']is False and all(v is True for k,v in prior['cleanup'].items() if k!='withinCleanupBudget')
 assert prior['kernel']['report']['status']=='PASSED' and len(prior['kernel']['report']['results'])==14
 state=control.load();assert state['kernelRun']is True and state['kernelCleanupComplete']is False and state['runtimeInstalled']is True
 state_meta=control.STATE.lstat();assert stat.S_ISREG(state_meta.st_mode) and state_meta.st_uid==os.getuid() and stat.S_IMODE(state_meta.st_mode)==0o600
 state_identity=(state_meta.st_dev,state_meta.st_ino)
 assert re.fullmatch('[a-f0-9]{32}',state['nonce'])
 for name in state['containerFiles']:assert name.startswith('/lab/linuxcast-s003-denial-'+state['nonce']+'-') and re.fullmatch('/lab/[A-Za-z0-9_.-]+',name)
 stages=[state['stage']]+state.get('captureStages',[]);assert len(stages)==len(set(stages))
 assert all(re.fullmatch('/tmp/linuxcast-s003-denial-stage-[A-Za-z0-9_]+',p) for p in stages)
 before=control.remote(baseline.CODE,root=True,timeout=20);validate_baseline(before,True)
 assert control.remote('STAGES='+repr(stages)+'\n'+STAGE_CHECK,root=True)=={'onlyOwnedPrivateStagesPresent':True,'ownedStageAndRuntimeExecutablesAbsent':True}
 identity=control.remote("import pathlib,json; m=pathlib.Path("+repr(state['stage'])+").lstat();print(json.dumps({'identity':[m.st_dev,m.st_ino]}))",root=True)['identity']
 assert type(identity)is list and len(identity)==2 and all(type(x)is int and x>=0 for x in identity)
 # Exact prior journal/inode cleanup, no new runtime preparation or chmod.
 removed=control.run_staged(state,'runtime.py','--cleanup-created')
 assert removed=={'operation':'REMOVE_CREATED_PINNED_RUNTIME','complete':True,'originalAllMissingStateRestored':True}
 # These reviewed removal checks require no executable from the exact capsule.
 for capsule in list(state.get('captureStages',[])):control.remove_capture_stage(state,capsule)
 assert control.remote('STAGE='+repr(state['stage'])+'\nIDENTITY='+repr(identity)+'\n'+REMOVE_STAGE,root=True,timeout=45)=={'ownedStageRemoved':True}
 for name in state['containerFiles']:
  assert name.startswith('/lab/linuxcast-s003-denial-'+state['nonce']+'-') and re.fullmatch('/lab/[A-Za-z0-9_.-]+',name)
  control.fixed(['docker','exec','linuxcast-s0-04-vm','rm','--',name])
 code="import pathlib,json;print(json.dumps({'ownedContainerCopiesAbsent':not any(pathlib.Path('/lab').glob("+repr('linuxcast-s003-denial-'+state['nonce']+'-*')+"))}))"
 assert json.loads(control.fixed(['docker','exec','linuxcast-s0-04-vm','python3','-c',code]))=={'ownedContainerCopiesAbsent':True}
 after=control.remote(baseline.CODE,root=True,timeout=20);validate_baseline(after,False)
 assert control.remote('TOOLS='+repr(TOOL_PATHS)+'\n'+FINAL_CHECK,root=True)=={'allFiveCreatedToolPathsMissing':True,'allOwnedStagePathsMissing':True}
 # Do not rewrite kernelCleanupComplete; preserve the actual failed gate.
 m=control.STATE.lstat();assert stat.S_ISREG(m.st_mode) and (m.st_dev,m.st_ino)==state_identity and m.st_uid==os.getuid()
 control.STATE.unlink();assert not control.STATE.exists() and sha(outcome)==OUTCOME_SHA
 value={'schemaVersion':1,'task':'S0-03','operation':'REVIEWED_RESOURCE_RELEASE_AFTER_INCOMPLETE_WRAPPER','complete':True,'wrapperGatePassed':False,'originalArtifactSha256':OUTCOME_SHA,'collectorManifestSha256':MANIFEST_SHA,'elapsedMs':round((time.monotonic()-started)*1000,3),'beforeReleaseBaseline':before,'afterReleaseBaseline':after,'onlyOwnedResourcesRemoved':True,'ownedStageAndRuntimeExecutablesAbsent':True,'allFiveCreatedToolPathsMissing':True,'allOwnedStagePathsMissing':True,'ownedContainerCopiesAbsent':True,'privateControlStateRemoved':True,'originalWrapperOutcomeUnchanged':True,'inputOrObservationProgramsExecutedDuringRelease':False,'policyChanged':False,'ac01Complete':False,'ac02Complete':False}
 path=evidence/'denial-reviewed-release.json'
 with path.open('x') as output:json.dump(value,output,indent=2);output.write('\n')
 print(json.dumps({'operation':value['operation'],'complete':True,'wrapperGatePassed':False,'originalArtifactSha256':OUTCOME_SHA,'artifactSha256':sha(path)}))
if __name__=='__main__':
 try:main()
 except Exception:
  print('{"operation":"REVIEWED_RESOURCE_RELEASE_AFTER_INCOMPLETE_WRAPPER","complete":false,"code":"OWNED_RELEASE_STOPPED_SAFETY_OR_PREREQUISITE","wrapperGatePassed":false}');sys.exit(3)
