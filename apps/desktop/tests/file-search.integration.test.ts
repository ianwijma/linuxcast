import { afterEach,expect,it } from 'vitest';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication,Page } from '@playwright/test';
import type { FileSearchApi,DataSettingsApi } from '@linuxcast/contracts';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { existsSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,renameSync,rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const executable=createRequire(import.meta.url)('electron') as string;
let application:ElectronApplication|undefined,temporary='';
afterEach(async()=>{if(application)await application.close().catch(()=>{application?.process().kill('SIGKILL');});application=undefined;if(temporary)rmSync(temporary,{recursive:true,force:true});});
async function action(page:Page,title:string){
  await page.getByRole('searchbox').first().press('Control+k');
  const filter=page.getByRole('searchbox',{name:'Find an action',exact:true});await filter.fill(title);await filter.press('Enter');
}
it('opens selected-folder search through the real launcher and preserves native index/owner semantics across clear, removal and restart',async()=>{
  if(!process.env.DISPLAY||process.env.LINUXCAST_PRIVATE_DISPLAY!=='1')throw new Error('Requires an owned private Xvfb display. This does not establish desktop/session acceptance.');
  execFileSync(process.execPath,['apps/desktop/build.ts'],{cwd:root,timeout:60000,stdio:'pipe'});
  temporary=mkdtempSync(join(tmpdir(),'linuxcast-file-app-'));
  for(const directory of ['home','profile','config','data','cache','runtime','system','Public documents'])mkdirSync(join(temporary,directory),{mode:0o700});
  const selected=join(temporary,'Public documents'),notes=join(selected,'public-notes.txt');
  writeFileSync(notes,'SYNTHETIC_CONTENT_SENTINEL');writeFileSync(join(selected,'public-summary.txt'),'Public synthetic fixture');writeFileSync(join(selected,'.public-hidden.txt'),'Excluded hidden fixture');symlinkSync('/nonexistent/synthetic',join(selected,'public-link'));
  const wrapper=join(temporary,'entry.cjs');
  writeFileSync(wrapper,`const {app}=require('electron');process.argv=process.argv.filter(value=>value!=='--inspect=0'&&value!=='--remote-debugging-port=0');app.setPath('userData',${JSON.stringify(join(temporary,'profile'))});app.setPath('sessionData',${JSON.stringify(join(temporary,'profile'))});require(${JSON.stringify(join(root,'apps/desktop/dist/main.cjs'))});`,{mode:0o600});
  const env:Record<string,string>={HOME:join(temporary,'home'),XDG_DATA_HOME:join(temporary,'data'),XDG_CONFIG_HOME:join(temporary,'config'),XDG_CACHE_HOME:join(temporary,'cache'),XDG_RUNTIME_DIR:join(temporary,'runtime'),XDG_DATA_DIRS:join(temporary,'system'),XDG_CONFIG_DIRS:join(temporary,'config'),XDG_SESSION_TYPE:'x11',DBUS_SESSION_BUS_ADDRESS:'unix:path=/nonexistent-linuxcast-files-bus'};
  for(const key of ['DISPLAY','XAUTHORITY','PATH','LANG'])if(process.env[key])env[key]=process.env[key]!;
  const launch=async()=>{
    application=await electron.launch({executablePath:executable,args:[wrapper,'--show'],chromiumSandbox:true,env,timeout:20000});
    const launcher=await application.firstWindow();await launcher.waitForURL('linuxcast-app://shell/index.html');await launcher.getByRole('searchbox',{name:'Search commands',exact:true}).waitFor();return {app:application,launcher};
  };
  let {app,launcher}=await launch();
  const openFiles=async()=>{
    const query=launcher.getByRole('searchbox',{name:'Search commands',exact:true});await query.fill('file search');await expect.poll(()=>launcher.getByRole('option',{selected:true}).textContent()).toContain('File search');
    const opened=app.waitForEvent('window');await query.press('Enter');const page=await opened;await page.waitForURL('linuxcast-app://shell/file-search.html');await page.getByRole('searchbox',{name:'Folders',exact:true}).waitFor();return page;
  };
  let files=await openFiles();
  const state=()=>files.evaluate(async()=>{const reply=await (window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles.getState();return reply.ok?reply.value:null;});
  await expect.poll(state).toMatchObject({roots:[]});await expect.poll(()=>files.getByRole('option').count()).toBe(0);
  expect(await files.evaluate(()=>({node:typeof process,require:typeof (window as unknown as {require?:unknown}).require,keys:Object.keys((window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles).sort()}))).toEqual({node:'undefined',require:'undefined',keys:['chooseFolder','close','getState','onState','pauseIndex','removeFolder','search','startIndex']});
  // Native dialogs alone are instrumented; renderer, IPC, native index, storage and lifecycle are production.
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});
  await files.getByRole('searchbox',{name:'Folders',exact:true}).press('Enter');expect((await state())?.roots).toEqual([]);
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},selected);
  await files.getByRole('searchbox',{name:'Folders',exact:true}).press('Enter');const search=files.getByRole('searchbox',{name:'Search files',exact:true});await search.waitFor();
  await expect.poll(state).toMatchObject({roots:[{activity:'paused',state:'idle',generation:null}]});
  await action(files,'Index folder');await expect.poll(state).toMatchObject({roots:[{activity:'watching',state:'ready',generation:expect.any(String)}]});
  await search.fill('public');await expect.poll(()=>files.getByRole('option').count()).toBe(2);await search.press('ArrowDown');await search.press('Enter');
  await files.getByRole('heading',{name:'public-summary.txt',exact:true}).waitFor();await expect.poll(()=>files.getByText('public-summary.txt',{exact:true}).count()).toBeGreaterThan(0);
  expect(await files.locator('body').textContent()).not.toContain('SYNTHETIC_CONTENT_SENTINEL');expect((await new AxeBuilder({page:files}).analyze()).violations).toEqual([]);
  const evidence=join(root,'packages/builtins/file-search/evidence');mkdirSync(evidence,{recursive:true});
  await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='dark';});await expect.poll(()=>files.locator('[data-lc-theme="dark"]').count()).toBeGreaterThan(0);await files.screenshot({path:join(evidence,'application-dark-details.png')});
  await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='light';});await expect.poll(()=>files.locator('[data-lc-theme="light"]').count()).toBeGreaterThan(0);await files.screenshot({path:join(evidence,'application-light-details.png')});
  await files.keyboard.press('Escape');await search.fill('SYNTHETIC_CONTENT_SENTINEL');await expect.poll(()=>files.getByRole('option').count()).toBe(0);
  renameSync(notes,join(selected,'public-renamed.txt'));await search.fill('public renamed');await expect.poll(()=>files.getByRole('option').count(),{timeout:10000}).toBe(1);
  await action(files,'Pause indexing');await expect.poll(state).toMatchObject({roots:[{activity:'paused'}]});
  // Closing this workspace preserves the resident owner. Reopening reuses saved metadata.
  await files.close();files=await openFiles();await expect.poll(state).toMatchObject({roots:[{activity:'paused',state:'ready'}]});
  const quit=async()=>{const exited=new Promise<number|null>(resolve=>app.process().once('exit',resolve));const query=launcher.getByRole('searchbox',{name:'Search commands',exact:true});await query.fill('quit');await query.press('Enter',{noWaitAfter:true});expect(await exited).toBe(0);application=undefined;};
  await quit();({app,launcher}=await launch());files=await openFiles();await expect.poll(state).toMatchObject({roots:[{activity:'paused',state:'ready'}]});
  await files.getByRole('searchbox',{name:'Folders',exact:true}).press('Enter');await files.getByRole('searchbox',{name:'Search files',exact:true}).fill('public renamed');await expect.poll(()=>files.getByRole('option').count()).toBe(1);
  // This root remains paused: clear must publish invalidation without any live job callback.
  const local=launcher.getByRole('searchbox',{name:'Search commands',exact:true});await local.fill('local data');const opened=app.waitForEvent('window');await local.press('Enter');const data=await opened;await data.waitForURL('linuxcast-app://shell/data-settings.html');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});
  expect(await data.evaluate(async()=>await (window as unknown as {linuxcastData:DataSettingsApi}).linuxcastData.clearCategory('file-index'))).toMatchObject({ok:true});
  await expect.poll(()=>files.getByRole('option').count()).toBe(0);await expect.poll(state).toMatchObject({roots:[{activity:'paused',generation:null}]});
  // Original sources survive index clearing and both removal outcomes.
  expect(existsSync(join(selected,'public-renamed.txt'))).toBe(true);await data.close();await files.getByRole('searchbox',{name:'Search files',exact:true}).press('Escape');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});await action(files,'Remove folder');await expect.poll(()=>files.getByRole('option').count()).toBe(1);
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});await action(files,'Remove folder');await expect.poll(state).toMatchObject({roots:[]});expect(existsSync(join(selected,'public-renamed.txt'))).toBe(true);
  await files.getByRole('searchbox',{name:'Folders',exact:true}).press('Enter');await files.getByRole('searchbox',{name:'Search files',exact:true}).waitFor();await action(files,'Index folder');await expect.poll(state).toMatchObject({roots:[{activity:'watching'}]});await quit();
},60000);
