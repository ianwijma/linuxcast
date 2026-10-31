import { afterEach,expect,it } from 'vitest';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication,Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash,randomUUID } from 'node:crypto';
import { StorageOwner } from '../../../packages/storage/src/owner.ts';
import { createWorkflowDraft,EDITOR_NODE_TYPES } from '../../../packages/workflows/src/registry.ts';
import { stableWorkflowJson } from '../../../packages/storage/src/workflow-editor-json.ts';
import type { WorkflowRunWorkspaceApi,DesktopShellApi,WorkflowEditorRecord } from '@linuxcast/contracts';
import type { PermissionSettingsApi } from '../../../packages/platform-contracts/src/permission-settings.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),executable=createRequire(import.meta.url)('electron') as string;
let application:ElectronApplication|undefined,temporary='';
afterEach(async()=>{
  if(application)await application.close().catch(()=>{application?.process().kill('SIGKILL');});
  application=undefined;if(temporary)rmSync(temporary,{recursive:true,force:true});
});
const run=(page:Page)=>page.evaluate(async()=>{const reply=await(window as unknown as {linuxcastWorkflow:WorkflowRunWorkspaceApi}).linuxcastWorkflow.getWorkflowRun();return reply.ok?reply.value:null;});
it('reviews actual persisted permissions, confirms removal without replay and requires fresh workflow approval after restart',async()=>{
  if(!process.env.DISPLAY||process.env.LINUXCAST_PRIVATE_DISPLAY!=='1')throw new Error('Requires owned private Xvfb; no native supported-session acceptance.');
  execFileSync(process.execPath,['apps/desktop/build.ts'],{cwd:root,timeout:60000,stdio:'pipe'});
  temporary=mkdtempSync(join(tmpdir(),'linuxcast-permissions-product-'));
  for(const directory of ['home','profile','config','data','cache','runtime','system'])mkdirSync(join(temporary,directory),{mode:0o700});
  const directory=join(temporary,'data/linuxcast'),owner=await StorageOwner.open({dataDirectory:directory,applicationBuild:'public-permission-fixture'});
  const definition=createWorkflowDraft();definition.name='Public permission workflow';definition.permissions=[{id:'clipboard.write',reason:'Explicit copy of public text'}];
  definition.nodes=EDITOR_NODE_TYPES.map((type,index)=>({id:`node-${index}`,type:type.type,typeVersion:1,config:structuredClone(type.config)}));
  definition.edges=[{id:'edge-1',from:{nodeId:'node-0',port:'out'},to:{nodeId:'node-1',port:'in'},order:0},{id:'edge-2',from:{nodeId:'node-1',port:'out'},to:{nodeId:'node-2',port:'in'},order:0}];
  const unrelated={schemaVersion:1,id:randomUUID(),principal:{kind:'builtin',id:'public.saved-source'},declarationHash:'a'.repeat(64),permissionId:'files.read',scope:{kind:'resource',resourceId:'public-selected-resource'},decision:'deny',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'};
  const long={...unrelated,id:randomUUID(),principal:{kind:'extension',id:`public.long-source.${'synthetic-segment-'.repeat(8)}end`,version:`1.0.0-${'public.build.'.repeat(6)}final`,integrity:'c'.repeat(64)},declarationHash:'c'.repeat(64),permissionId:'files.write',scope:{kind:'resource',resourceId:`public-long-resource.${'segment-'.repeat(20)}final`},decision:'allow'};
  const savedWorkflow=owner.request({schemaVersion:1,requestId:randomUUID(),method:'workflows.editor.write',params:{expectedRevision:0,draft:definition,action:'save'}}).result as WorkflowEditorRecord;
  owner.request({schemaVersion:1,requestId:randomUUID(),method:'permissions.put',params:{record:unrelated}});
  await owner.confirmSuccessfulLaunch();await owner.close();
  const wrapper=join(temporary,'entry.cjs');
  writeFileSync(wrapper,`const {app}=require('electron');process.argv=process.argv.filter(value=>value!=='--inspect=0'&&value!=='--remote-debugging-port=0');app.setPath('userData',${JSON.stringify(join(temporary,'profile'))});app.setPath('sessionData',${JSON.stringify(join(temporary,'profile'))});require(${JSON.stringify(join(root,'apps/desktop/dist/main.cjs'))});`,{mode:0o600});
  const env:Record<string,string>={HOME:join(temporary,'home'),XDG_DATA_HOME:join(temporary,'data'),XDG_CONFIG_HOME:join(temporary,'config'),XDG_CACHE_HOME:join(temporary,'cache'),XDG_RUNTIME_DIR:join(temporary,'runtime'),XDG_DATA_DIRS:join(temporary,'system'),XDG_CONFIG_DIRS:join(temporary,'config'),XDG_SESSION_TYPE:'x11',DBUS_SESSION_BUS_ADDRESS:'unix:path=/nonexistent-linuxcast-permissions-bus'};
  for(const key of ['DISPLAY','XAUTHORITY','PATH','LANG'])if(process.env[key])env[key]=process.env[key]!;
  const launch=async()=>{
    application=await electron.launch({executablePath:executable,args:[wrapper,'--show'],chromiumSandbox:true,env,timeout:20000});
    const page=await application.firstWindow();page.setDefaultTimeout(5000);await page.waitForURL('linuxcast-app://shell/index.html');return {app:application,page};
  };
  let {app,page}=await launch();
  const open=async(title:string,url:string)=>{
    const query=page.getByRole('combobox',{name:'Search commands',exact:true});await query.fill(title);
    await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain(title);
    const opened=app.waitForEvent('window');await query.press('Enter');const workspace=await opened;workspace.setDefaultTimeout(5000);await workspace.waitForURL(url);return workspace;
  };
  let editor=await open('Workflow draft','linuxcast-app://shell/workflow-editor.html');
  await editor.getByRole('button',{name:'Run saved workflow',exact:true}).click();
  const start=async(text:string)=>{
    const previous=(await run(editor))?.runId;await editor.getByRole('textbox',{name:'Text to run',exact:true}).fill(text);
    await editor.getByRole('button',{name:/^(Run saved version|Start new run)$/u}).click();
    await expect.poll(async()=>(await run(editor))?.runId).not.toBe(previous);
  };
  await start('Public permission result');await editor.getByRole('button',{name:'Always allow for this saved version',exact:true}).click();
  await expect.poll(async()=>(await run(editor))?.state).toBe('succeeded');
  expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('Public permission result');
  let permissions=await open('Saved permissions','linuxcast-app://shell/permission-settings.html');
  const refresh=()=>permissions.getByRole('button',{name:'Refresh',exact:true});
  await expect.poll(()=>permissions.locator('.permission-row').count()).toBe(2);
  await expect.poll(()=>refresh().evaluate(element=>document.activeElement===element)).toBe(true);
  expect(await permissions.evaluate(()=>({node:typeof(window as unknown as {process?:unknown}).process,require:typeof(window as unknown as {require?:unknown}).require,shell:typeof(window as unknown as {linuxcast?:unknown}).linuxcast,methods:Object.keys((window as unknown as {linuxcastPermissions:PermissionSettingsApi}).linuxcastPermissions).sort()})))
    .toEqual({node:'undefined',require:'undefined',shell:'undefined',methods:['close','getState','onAppearance','revoke']});
  const firstClose=permissions.waitForEvent('close');
  await permissions.keyboard.press('Escape').catch(error=>{if(!permissions.isClosed()||!(error instanceof Error)||!error.message.includes('Target page, context or browser has been closed'))throw error;});
  await firstClose;expect(app.process().exitCode).toBeNull();
  permissions=await open('Saved permissions','linuxcast-app://shell/permission-settings.html');
  await expect.poll(()=>permissions.locator('.permission-row').count()).toBe(2);
  const review=()=>permissions.getByRole('button',{name:'Review removal: Public permission workflow · Replace the clipboard',exact:true});
  await review().click();await expect.poll(()=>permissions.getByRole('button',{name:'Keep decision',exact:true}).evaluate(element=>document.activeElement===element)).toBe(true);
  await permissions.keyboard.press('Escape');await expect.poll(()=>review().evaluate(element=>document.activeElement===element)).toBe(true);
  expect(await permissions.locator('.permission-row').count()).toBe(2);
  // Instrument refresh captures; historical permissions-application-* evidence stays unchanged.
  const evidence=join(root,'apps/desktop/evidence/instrument-permissions');mkdirSync(evidence,{recursive:true});
  const shot=async(name:string)=>{await permissions.evaluate(async()=>{await document.fonts.ready;});expect((await new AxeBuilder({page:permissions}).setLegacyMode().analyze()).violations).toEqual([]);await permissions.screenshot({path:join(evidence,name),fullPage:true});};
  const themed=async(name:string)=>{
    for(const theme of ['dark','light'] as const){
      await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);
      await expect.poll(()=>permissions.locator('[data-lc-theme]').getAttribute('data-lc-theme')).toBe(theme);
      await shot(`${name}-${theme}.png`);
    }
  };
  for(const theme of ['dark','light'] as const){
    await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);
    await expect.poll(()=>permissions.locator('[data-lc-theme]').getAttribute('data-lc-theme')).toBe(theme);
    await permissions.evaluate(async()=>{await document.fonts.ready;});
    expect((await new AxeBuilder({page:permissions}).setLegacyMode().analyze()).violations).toEqual([]);
    await permissions.screenshot({path:join(evidence,`list-${theme}.png`),fullPage:true});
  }
  const captureNative=async(name:string)=>{
    const image=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()==='linuxcast-app://shell/permission-settings.html')!.capturePage()).toPNG().toString('base64'));
    writeFileSync(join(evidence,name),Buffer.from(image,'base64'));
  };
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()==='linuxcast-app://shell/permission-settings.html')!.webContents.setZoomFactor(2);});
  await expect.poll(()=>permissions.evaluate(()=>devicePixelRatio)).toBe(2);
  expect(await permissions.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  // Record UUID order can place this workflow before or after the unrelated
  // decision. Traverse away and back without assuming either row order.
  await permissions.keyboard.press('Shift+Tab');
  await permissions.keyboard.press('Tab');
  const scaledControl=review();
  await expect.poll(()=>scaledControl.evaluate(element=>document.activeElement===element)).toBe(true);
  expect(await scaledControl.evaluate(element=>{const rect=element.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth;})).toBe(true);
  expect((await new AxeBuilder({page:permissions}).setLegacyMode().analyze()).violations).toEqual([]);
  await captureNative('list-200-percent-keyboard-focus-light.png');
  await permissions.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
  expect(await permissions.evaluate(()=>matchMedia('(forced-colors: active)').matches&&matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect((await new AxeBuilder({page:permissions}).setLegacyMode().analyze()).violations).toEqual([]);
  await captureNative('list-200-percent-forced-colors-reduced-motion.png');
  await permissions.emulateMedia({forcedColors:'none',reducedMotion:'no-preference'});
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()==='linuxcast-app://shell/permission-settings.html')!.webContents.setZoomFactor(1);});
  await review().click();
  await expect.poll(()=>permissions.getByRole('button',{name:'Keep decision',exact:true}).evaluate(element=>document.activeElement===element)).toBe(true);
  expect(await permissions.getByRole('region',{name:'Complete saved decision',exact:true}).textContent()).toContain('Public permission workflow');
  await themed('review-allow');
  await permissions.getByRole('button',{name:'Remove decision',exact:true}).click();
  await expect.poll(()=>permissions.getByRole('status').textContent()).toContain('Saved decision removed.');
  await expect.poll(()=>permissions.locator('.permission-row').count()).toBe(1);
  await expect.poll(()=>refresh().evaluate(element=>document.activeElement===element)).toBe(true);
  // The receipt is the controller's fixed neutral copy, never a success plate or capability claim.
  expect(await permissions.locator('.lc-plate[data-kind="success"]').count()).toBe(0);
  await themed('removed');
  expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('Public permission result');
  await app.evaluate(({clipboard})=>{clipboard.writeText('Public after-removal sentinel');});
  await start('Public request after removal');
  await editor.getByRole('button',{name:'Allow once',exact:true}).waitFor();
  expect((await run(editor))?.state).toBe('waiting-ui');
  expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('Public after-removal sentinel');
  await editor.getByRole('button',{name:'Cancel run',exact:true}).click();await expect.poll(async()=>(await run(editor))?.state).toBe('cancelled');
  const quit=async()=>{
    const process=app.process();expect((await page.evaluate(async()=>(window as unknown as {linuxcast:DesktopShellApi}).linuxcast.quit())).ok).toBe(true);
    if(process.exitCode===null)await new Promise(resolve=>process.once('exit',resolve));expect(process.exitCode).toBe(0);application=undefined;
  };
  await quit();
  const preserved=await StorageOwner.open({dataDirectory:directory,applicationBuild:'public-permission-preservation'});
  try{
    expect((preserved.request({schemaVersion:1,requestId:randomUUID(),method:'permissions.inventory',params:{limit:50}}).result as {records:unknown[]}).records).toEqual([unrelated]);
    // Seed an obsolete declaration choice for the same immutable source,
    // analogous to an earlier host declaration set. It cannot approve this run.
    // Synthetic public long-text seed for overflow review: unbroken source and version labels and a long declared scope.
    preserved.request({schemaVersion:1,requestId:randomUUID(),method:'permissions.put',params:{record:long}});
    preserved.request({schemaVersion:1,requestId:randomUUID(),method:'permissions.put',params:{record:{...unrelated,id:randomUUID(),principal:{kind:'workflow',id:definition.id,version:definition.version,integrity:createHash('sha256').update(stableWorkflowJson(savedWorkflow.saved!)).digest('hex')},declarationHash:'b'.repeat(64),permissionId:'clipboard.write',scope:{kind:'global'},decision:'allow'}}});
  }finally{await preserved.close();}
  ({app,page}=await launch());permissions=await open('Saved permissions','linuxcast-app://shell/permission-settings.html');
  await expect.poll(()=>permissions.locator('.permission-row').count()).toBe(3);
  const unrelatedRow=permissions.locator('.permission-row').filter({hasText:'public.saved-source'});
  expect(await unrelatedRow.textContent()).toContain('Remembered: deny');
  editor=await open('Workflow draft','linuxcast-app://shell/workflow-editor.html');await editor.getByRole('button',{name:'Run saved workflow',exact:true}).click();
  await app.evaluate(({clipboard})=>{clipboard.writeText('Public pending-revocation sentinel');});
  await start('Public explicit request after restart');await editor.getByRole('button',{name:'Allow once',exact:true}).waitFor();
  await review().click();await permissions.getByRole('button',{name:'Remove decision',exact:true}).click();
  await expect.poll(async()=>(await run(editor))?.state).toBe('cancelled');
  expect(await app.evaluate(({clipboard})=>clipboard.readText())).toBe('Public pending-revocation sentinel');
  await expect.poll(()=>app.evaluate(({app})=>app.getAppMetrics().filter(metric=>metric.name==='Linuxcast workflow').length)).toBe(0);
  await expect.poll(()=>permissions.locator('.permission-row').count()).toBe(2);
  await permissions.getByRole('button',{name:'Review removal: public.saved-source · Read selected files',exact:true}).click();
  await permissions.getByText('Removing a denial permits a new request. It does not approve or rerun anything.',{exact:true}).waitFor();
  await themed('review-deny');
  await permissions.getByRole('button',{name:'Remove decision',exact:true}).click();
  await expect.poll(()=>permissions.locator('.permission-row').count()).toBe(1);
  // Long source/version/scope: complete text stays in the accessible name, the tooltip and the review region.
  const longReview=permissions.getByRole('button',{name:`Review removal: ${long.principal.id} · Write selected files`,exact:true});
  expect(await permissions.locator('.permission-row').getByTitle(long.principal.version,{exact:true}).textContent()).toBe(long.principal.version);
  await themed('long-source-list');
  await longReview.click();
  const details=permissions.getByRole('region',{name:'Complete saved decision',exact:true});
  for(const text of [long.principal.id,long.principal.version,'Selected resource: '+long.scope.resourceId])expect(await details.textContent()).toContain(text);
  await themed('long-source-review');
  const permissionWindow=async(zoom:number)=>app.evaluate(({BrowserWindow},value)=>{BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()==='linuxcast-app://shell/permission-settings.html')!.webContents.setZoomFactor(value);},zoom);
  await permissionWindow(2);await expect.poll(()=>permissions.evaluate(()=>devicePixelRatio)).toBe(2);
  await expect.poll(()=>permissions.getByRole('button',{name:'Keep decision',exact:true}).evaluate(element=>document.activeElement===element)).toBe(true);
  await permissions.keyboard.press('Shift+Tab');
  await expect.poll(()=>details.evaluate(element=>document.activeElement===element)).toBe(true);
  expect(await permissions.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await details.evaluate(element=>{const rect=element.getBoundingClientRect();return rect.top>=0&&rect.top<innerHeight&&rect.left>=0&&rect.right<=innerWidth+1;})).toBe(true);
  expect((await new AxeBuilder({page:permissions}).setLegacyMode().analyze()).violations).toEqual([]);
  await captureNative('long-source-review-200-percent-keyboard-focus-light.png');
  await permissionWindow(1);
  await permissions.keyboard.press('Escape');await expect.poll(()=>longReview.evaluate(element=>document.activeElement===element)).toBe(true);
  await longReview.click();
  await permissions.getByRole('button',{name:'Remove decision',exact:true}).click();
  await permissions.getByRole('heading',{name:'No saved decisions on this page',exact:true}).waitFor();
  await themed('empty');
  // This is an actual kill of only this fixture's owned storage child.
  await app.evaluate(({app})=>{const child=app.getAppMetrics().find(metric=>metric.name==='Linuxcast storage');if(!child)throw new Error('Missing owned storage child.');process.kill(child.pid,'SIGKILL');});
  await refresh().click();await permissions.getByRole('heading',{name:'Review current permissions',exact:true}).waitFor();
  await permissions.getByText('Saved permissions are unavailable. Refresh after local data opens, or quit and reopen Linuxcast to reconnect.',{exact:true}).waitFor();
  await themed('unavailable');
  // Pending read is a labelled renderer-state fixture, not a storage recovery.
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('permission-settings:list');ipcMain.handle('permission-settings:list',()=>new Promise(()=>{}));});
  await permissions.reload();await permissions.getByText('Reading saved permissions…',{exact:true}).waitFor();
  await expect.poll(()=>refresh().evaluate(element=>document.activeElement===element)).toBe(true);
  await themed('loading-fixture');
  await expect.poll(()=>refresh().evaluate(element=>document.activeElement===element)).toBe(true);
  await quit();
  const final=await StorageOwner.open({dataDirectory:directory,applicationBuild:'public-permission-result'});
  try{
    const records=final.request({schemaVersion:1,requestId:randomUUID(),method:'permissions.inventory',params:{limit:50}}).result as {records:unknown[]};
    expect(records.records).toEqual([]);
  }finally{await final.close();}
},90000);
