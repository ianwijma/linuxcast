import { afterEach,expect,it } from 'vitest';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication,Page } from '@playwright/test';
import type { WorkflowWorkspaceApi,WorkflowEditorRecord,DesktopShellApi } from '@linuxcast/contracts';
import { StorageOwner } from '../../../packages/storage/src/owner.ts';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),executable=createRequire(import.meta.url)('electron') as string;
let application:ElectronApplication|undefined,temporary='';
afterEach(async()=>{if(application)await application.close().catch(()=>{application?.process().kill('SIGKILL');});application=undefined;if(temporary)rmSync(temporary,{recursive:true,force:true});});
async function loaded(page:Page):Promise<WorkflowEditorRecord|null>{return page.evaluate(async()=>{const result=await(window as unknown as {linuxcastWorkflow:WorkflowWorkspaceApi}).linuxcastWorkflow.load();return result.ok?result.value:null;});}
it('opens the real workflow editor, saves a keyboard-built graph and recovers drafts through close and restart',async()=>{
  if(!process.env.DISPLAY||process.env.LINUXCAST_PRIVATE_DISPLAY!=='1')throw new Error('Requires an owned private Xvfb display; not native desktop acceptance.');
  execFileSync(process.execPath,['apps/desktop/build.ts'],{cwd:root,timeout:60000,stdio:'pipe'});
  temporary=mkdtempSync(join(tmpdir(),'linuxcast-workflow-app-'));for(const directory of ['home','profile','config','data','cache','runtime','system'])mkdirSync(join(temporary,directory),{mode:0o700});
  const wrapper=join(temporary,'entry.cjs');writeFileSync(wrapper,`const {app}=require('electron');process.argv=process.argv.filter(value=>value!=='--inspect=0'&&value!=='--remote-debugging-port=0');app.setPath('userData',${JSON.stringify(join(temporary,'profile'))});app.setPath('sessionData',${JSON.stringify(join(temporary,'profile'))});require(${JSON.stringify(join(root,'apps/desktop/dist/main.cjs'))});`,{mode:0o600});
  const env:Record<string,string>={HOME:join(temporary,'home'),XDG_DATA_HOME:join(temporary,'data'),XDG_CONFIG_HOME:join(temporary,'config'),XDG_CACHE_HOME:join(temporary,'cache'),XDG_RUNTIME_DIR:join(temporary,'runtime'),XDG_DATA_DIRS:join(temporary,'system'),XDG_CONFIG_DIRS:join(temporary,'config'),XDG_SESSION_TYPE:'x11',XDG_CURRENT_DESKTOP:'GNOME',DBUS_SESSION_BUS_ADDRESS:'unix:path=/nonexistent-linuxcast-workflow-bus'};
  for(const key of ['DISPLAY','XAUTHORITY','PATH','LANG'])if(process.env[key])env[key]=process.env[key]!;
  const launch=async()=>{application=await electron.launch({executablePath:executable,args:[wrapper,'--show'],chromiumSandbox:true,env,timeout:20000});const page=await application.firstWindow();await page.waitForURL('linuxcast-app://shell/index.html');return {app:application,page};};
  let {app,page}=await launch();
  const open=async()=>{const query=page.getByRole('combobox',{name:'Search commands',exact:true});await query.fill('workflow');await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Workflow draft');const ready=app.waitForEvent('window');await query.press('Enter');const editor=await ready;await editor.waitForURL('linuxcast-app://shell/workflow-editor.html');await editor.emulateMedia({reducedMotion:'reduce'});await editor.getByRole('heading',{name:'Workflow editor',exact:true}).waitFor();return editor;};
  let editor=await open();await editor.getByRole('button',{name:'New workflow',exact:true}).click();
  await editor.getByRole('textbox',{name:'Workflow name',exact:true}).fill('Public text workflow');
  for(const title of ['Add Keyword','Add Transform text','Add Copy text'])await editor.getByRole('button',{name:new RegExp(`^${title}`)}).click();
  await expect.poll(async()=>(await loaded(editor))?.draft.nodes.length).toBe(3);
  const draft=(await loaded(editor))!.draft,keyword=draft.nodes.find(node=>node.type==='input.keyword')!,transform=draft.nodes.find(node=>node.type==='utility.transform')!,copy=draft.nodes.find(node=>node.type==='output.clipboard')!;
  for(const [from,to] of [[keyword.id,transform.id],[transform.id,copy.id]]){await editor.getByLabel('Connection source',{exact:true}).selectOption(from!);await editor.getByLabel('Output port',{exact:true}).selectOption('out');await editor.getByLabel('Connection target',{exact:true}).selectOption(to!);await editor.getByRole('button',{name:'Connect nodes',exact:true}).click();}
  await editor.getByRole('button',{name:'Save workflow',exact:true}).click();await expect.poll(async()=>(await loaded(editor))?.saved?.edges.length).toBe(2);
  expect((await loaded(editor))?.saved).toMatchObject({name:'Public text workflow',permissions:[{id:'clipboard.write',reason:expect.any(String)}]});
  const run=editor.getByRole('button',{name:/^Run/});expect(await run.isDisabled()).toBe(false);
  const evidence=join(root,'apps/desktop/evidence');mkdirSync(evidence,{recursive:true});
  for(const theme of ['dark','light'] as const){await app.evaluate(({nativeTheme},theme)=>{nativeTheme.themeSource=theme;},theme);await expect.poll(()=>editor.locator('[data-lc-theme]').first().getAttribute('data-lc-theme')).toBe(theme);await editor.screenshot({path:join(evidence,`workflow-editor-application-${theme}-saved.png`)});expect((await new AxeBuilder({page:editor}).setLegacyMode().analyze()).violations).toEqual([]);}
  // Native window-close must flush an edit made before its500ms autosave timer.
  await editor.getByRole('textbox',{name:'Workflow name',exact:true}).fill('Public recovered draft');const closed=editor.waitForEvent('close');await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()==='linuxcast-app://shell/workflow-editor.html')!.close();});await closed;
  editor=await open();await expect.poll(()=>editor.getByRole('textbox',{name:'Workflow name',exact:true}).inputValue()).toBe('Public recovered draft');expect((await loaded(editor))?.saved?.name).toBe('Public text workflow');
  {const closing=editor.waitForEvent('close');await editor.getByRole('button',{name:'Close editor',exact:true}).click({noWaitAfter:true}).catch(error=>{if(!editor.isClosed())throw error;});await closing;}
  const quit=async()=>{const reply=await page.evaluate(async()=>(window as unknown as {linuxcast:DesktopShellApi}).linuxcast.quit());expect(reply.ok).toBe(true);const process=app.process();if(process.exitCode===null)await new Promise(resolve=>process.once('exit',resolve));expect(process.exitCode).toBe(0);application=undefined;};
  await quit();({app,page}=await launch());editor=await open();await expect.poll(()=>editor.getByRole('textbox',{name:'Workflow name',exact:true}).inputValue()).toBe('Public recovered draft');
  const final=await loaded(editor);expect(final?.saved?.name).toBe('Public text workflow');expect(final?.draft.edges).toHaveLength(2);
  await editor.getByRole('textbox',{name:'Workflow name',exact:true}).fill('Public quit-flushed draft');await quit();
  const owner=await StorageOwner.open({dataDirectory:join(temporary,'data/linuxcast'),applicationBuild:'synthetic-workflow-reopen'});try{const request=(method:string,params:unknown)=>owner.request({schemaVersion:1,requestId:randomUUID(),method,params}).result;expect(request('workflows.editor.get',{})).toMatchObject({revision:final!.revision+1,draft:{...final!.draft,name:'Public quit-flushed draft'},saved:final!.saved});const exported=JSON.stringify(request('dataControls.export',{category:'command-usage'}));expect(exported).not.toContain('Public text workflow');expect(exported).not.toContain('Public recovered draft');expect(exported).not.toContain('Public quit-flushed draft');}finally{await owner.close();}
},60000);
