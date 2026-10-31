import { expect,it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

it('runs the offline native-observer guards without skips; this is not native acceptance',()=>{
  const root=fileURLToPath(new URL('../../../',import.meta.url));
  const check=spawnSync('/usr/bin/python3',['-B','-c',`
import json,sys,unittest
suite=unittest.defaultTestLoader.discover('apps/desktop/tests/at',pattern='test_*.py')
result=unittest.TextTestRunner(verbosity=1).run(suite)
complete=result.wasSuccessful() and result.testsRun>0 and not result.skipped and not result.expectedFailures and not result.unexpectedSuccesses
print(json.dumps({'complete':complete,'executed':result.testsRun,'nativeRun':False}))
sys.exit(0 if complete else 1)
`],{cwd:root,encoding:'utf8',timeout:18000,maxBuffer:1024*1024});
  expect(check.error).toBeUndefined();
  expect(check.status,check.stderr).toBe(0);
  expect(JSON.parse(check.stdout)).toMatchObject({complete:true,nativeRun:false});
  expect((JSON.parse(check.stdout) as {executed:number}).executed).toBeGreaterThan(0);
},20000);
