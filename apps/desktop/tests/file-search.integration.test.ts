import { afterEach,expect,it } from 'vitest';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication,Page } from '@playwright/test';
import type { FileSearchApi,DataSettingsApi } from '@linuxcast/contracts';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync,spawnSync } from 'node:child_process';
import { existsSync,mkdtempSync,mkdirSync,writeFileSync,symlinkSync,renameSync,rmSync,utimesSync,readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const executable=createRequire(import.meta.url)('electron') as string;
let application:ElectronApplication|undefined,temporary='';
afterEach(async()=>{if(application)await application.close().catch(()=>{application?.process().kill('SIGKILL');});application=undefined;if(temporary)rmSync(temporary,{recursive:true,force:true});});
async function action(page:Page,title:string){
  await page.locator('.lc-view:not([hidden])').focus();await page.keyboard.press('Control+k');
  const filter=page.getByRole('searchbox',{name:'Find an action',exact:true});await filter.fill(title);await filter.press('Enter');
}
it('opens selected-folder search through the real launcher and preserves native index/owner semantics across clear, removal and restart',async()=>{
  if(!process.env.DISPLAY||process.env.LINUXCAST_PRIVATE_DISPLAY!=='1')throw new Error('Requires an owned private Xvfb display. This does not establish desktop/session acceptance.');
  execFileSync(process.execPath,['apps/desktop/build.ts'],{cwd:root,timeout:60000,stdio:'pipe'});
  temporary=mkdtempSync(join(tmpdir(),'linuxcast-file-app-'));
  for(const directory of ['home','profile','config','data','cache','runtime','system','Public documents'])mkdirSync(join(temporary,directory),{mode:0o700});
  const selected=join(temporary,'Public documents'),notes=join(selected,'public-notes.txt');
  const publicText='Public <script>literal</script>\n雪 🐧\n[link](https://example.invalid)';
  writeFileSync(notes,'SYNTHETIC_CONTENT_SENTINEL');writeFileSync(join(selected,'public-summary.txt'),publicText);writeFileSync(join(selected,'.public-hidden.txt'),'Excluded hidden fixture');symlinkSync('/nonexistent/synthetic',join(selected,'public-link'));
  utimesSync(notes,new Date('2024-01-01T12:00:00Z'),new Date('2024-01-01T12:00:00Z'));utimesSync(join(selected,'public-summary.txt'),new Date('2024-01-03T12:00:00Z'),new Date('2024-01-03T12:00:00Z'));
  const wrapper=join(temporary,'entry.cjs');
  writeFileSync(wrapper,`const {app}=require('electron');process.argv=process.argv.filter(value=>value!=='--inspect=0'&&value!=='--remote-debugging-port=0');app.setPath('userData',${JSON.stringify(join(temporary,'profile'))});app.setPath('sessionData',${JSON.stringify(join(temporary,'profile'))});require(${JSON.stringify(join(root,'apps/desktop/dist/main.cjs'))});`,{mode:0o600});
  const env:Record<string,string>={HOME:join(temporary,'home'),XDG_DATA_HOME:join(temporary,'data'),XDG_CONFIG_HOME:join(temporary,'config'),XDG_CACHE_HOME:join(temporary,'cache'),XDG_RUNTIME_DIR:join(temporary,'runtime'),XDG_DATA_DIRS:join(temporary,'system'),XDG_CONFIG_DIRS:join(temporary,'config'),XDG_SESSION_TYPE:'x11',DBUS_SESSION_BUS_ADDRESS:'unix:path=/nonexistent-linuxcast-files-bus'};
  for(const key of ['DISPLAY','XAUTHORITY','PATH','LANG'])if(process.env[key])env[key]=process.env[key]!;
  const launch=async()=>{
    application=await electron.launch({executablePath:executable,args:[wrapper,'--show'],chromiumSandbox:true,env,timeout:20000});
    const launcher=await application.firstWindow();await launcher.waitForURL('linuxcast-app://shell/index.html');await launcher.getByRole('searchbox',{name:'Search commands',exact:true}).waitFor();return {app:application,launcher};
  };
  let {app,launcher}=await launch();
  const clipboardText=()=>execFileSync('xclip',['-selection','clipboard','-out'],{env,encoding:'utf8',timeout:3000});
  await app.evaluate(async({clipboard})=>{await clipboard.writeText('PUBLIC_PATH_CLIPBOARD_SENTINEL');});expect(clipboardText()).toBe('PUBLIC_PATH_CLIPBOARD_SENTINEL');
  const openFiles=async()=>{
    const query=launcher.getByRole('searchbox',{name:'Search commands',exact:true});await query.fill('file search');await expect.poll(()=>launcher.getByRole('option',{selected:true}).textContent()).toContain('File search');
    const opened=app.waitForEvent('window');await query.press('Enter');const page=await opened;await page.waitForURL('linuxcast-app://shell/file-search.html');await page.getByRole('searchbox',{name:'Folders',exact:true}).waitFor();return page;
  };
  let files=await openFiles();
  const state=()=>files.evaluate(async()=>{const reply=await (window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles.getState();return reply.ok?reply.value:null;});
  await expect.poll(state).toMatchObject({roots:[]});await expect.poll(()=>files.getByRole('option').count()).toBe(0);
  expect(await files.evaluate(()=>({node:typeof process,require:typeof (window as unknown as {require?:unknown}).require,keys:Object.keys((window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles).sort()}))).toEqual({node:'undefined',require:'undefined',keys:['chooseFolder','close','copyPath','copyPreviewText','getState','onState','pauseIndex','previewText','removeFolder','search','startIndex']});
  // Native dialogs alone are instrumented; renderer, IPC, native index, storage and lifecycle are production.
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});
  await files.getByRole('searchbox',{name:'Folders',exact:true}).press('Enter');expect((await state())?.roots).toEqual([]);
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},selected);
  await files.getByRole('searchbox',{name:'Folders',exact:true}).press('Enter');const search=files.getByRole('searchbox',{name:'Search files',exact:true});await search.waitFor();
  await expect.poll(state).toMatchObject({roots:[{activity:'paused',state:'idle',generation:null}]});
  await action(files,'Index folder');await expect.poll(state).toMatchObject({roots:[{activity:'watching',state:'ready',generation:expect.any(String)}]});
  await search.fill('public');await expect.poll(()=>files.getByRole('option').count()).toBe(2);await search.press('ArrowDown');await search.press('Enter');
  await files.getByRole('heading',{name:'public-summary.txt',exact:true}).waitFor();await expect.poll(()=>files.getByText('public-summary.txt',{exact:true}).count()).toBeGreaterThan(0);
  expect(clipboardText()).toBe('PUBLIC_PATH_CLIPBOARD_SENTINEL');
  expect(await files.locator('body').textContent()).not.toContain('SYNTHETIC_CONTENT_SENTINEL');expect((await new AxeBuilder({page:files}).setLegacyMode().analyze()).violations).toEqual([]);
  const evidence=join(root,'packages/builtins/universal-actions/evidence');mkdirSync(evidence,{recursive:true});
  await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='dark';});await expect.poll(()=>files.locator('[data-lc-theme="dark"]').count()).toBeGreaterThan(0);await files.screenshot({path:join(evidence,'application-dark-indexed-path.png')});
  await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='light';});await expect.poll(()=>files.locator('[data-lc-theme="light"]').count()).toBeGreaterThan(0);await files.screenshot({path:join(evidence,'application-light-indexed-path.png')});
  // Querying and showing details never copy. Only the deliberate selected-result action writes.
  await action(files,'Copy path');await expect.poll(clipboardText).toBe(join(selected,'public-summary.txt'));await expect.poll(()=>files.getByRole('status').textContent()).toBe('Path copied.');
  await files.keyboard.press('Escape');await search.fill('public-notes');await expect.poll(()=>files.getByRole('option',{selected:true}).textContent()).toContain('public-notes.txt');expect(clipboardText()).toBe(join(selected,'public-summary.txt'));
  await action(files,'Copy path');await expect.poll(clipboardText).toBe(notes);await expect.poll(()=>files.getByRole('status').textContent()).toBe('Path copied.');
  // Explicit real native read: no automatic content access or HTML/Markdown interpretation.
  await search.fill('public-summary');await expect.poll(()=>files.getByRole('option',{selected:true}).textContent()).toContain('public-summary.txt');
  expect(await files.locator('pre.lc-text-content').count()).toBe(0);
  const external:string[]=[];files.on('request',request=>{if(!request.url().startsWith('linuxcast-app://'))external.push(request.url());});
  await action(files,'Preview text');await files.getByRole('heading',{name:'Text preview · public-summary.txt',exact:true}).waitFor();
  await expect.poll(()=>files.locator('pre.lc-text-content').textContent()).toBe(publicText);
  expect(await files.locator('pre script, pre a, pre img').count()).toBe(0);expect(clipboardText()).toBe(notes);
  for(const theme of ['dark','light'] as const){await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);await expect.poll(()=>files.locator(`[data-lc-theme="${theme}"]`).count()).toBeGreaterThan(0);expect((await new AxeBuilder({page:files}).setLegacyMode().analyze()).violations).toEqual([]);await files.screenshot({path:join(evidence,`application-${theme}-text-preview.png`)});}
  // Copy is a separate explicit effect and copies the exact displayed literal snapshot.
  await action(files,'Copy text');await expect.poll(()=>files.getByRole('status').textContent()).toBe('Text copied.');await expect.poll(clipboardText).toBe(publicText);
  for(const theme of ['dark','light'] as const){await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);await expect.poll(()=>files.locator(`[data-lc-theme="${theme}"]`).count()).toBeGreaterThan(0);expect((await new AxeBuilder({page:files}).setLegacyMode().analyze()).violations).toEqual([]);await files.screenshot({path:join(evidence,`application-${theme}-preview-text-copied.png`)});}
  await app.evaluate(()=>{process.env.XDG_SESSION_TYPE='unknown';});await action(files,'Copy text');await expect.poll(()=>files.getByRole('alert').textContent()).toContain('Text was not copied.');expect(clipboardText()).toBe(publicText);await files.screenshot({path:join(evidence,'application-preview-copy-unavailable.png')});
  await app.evaluate(()=>{process.env.XDG_SESSION_TYPE='x11';});expect(clipboardText()).toBe(publicText);await action(files,'Copy text');await expect.poll(()=>files.getByRole('status').textContent()).toBe('Text copied.');expect(clipboardText()).toBe(publicText);
  await files.keyboard.press('Escape');await expect.poll(()=>search.inputValue()).toBe('public-summary');await expect.poll(()=>search.evaluate(element=>element===document.activeElement)).toBe(true);expect(await files.getByRole('option',{selected:true}).textContent()).toContain('public-summary.txt');
  expect(await files.locator('pre.lc-text-content').count()).toBe(0);expect(external).toEqual([]);expect(readFileSync(join(selected,'public-summary.txt'),'utf8')).toBe(publicText);
  await search.fill('public-notes');await expect.poll(()=>files.getByRole('option',{selected:true}).textContent()).toContain('public-notes.txt');
  await action(files,'Copy path');await expect.poll(clipboardText).toBe(notes);
  // Known unsupported session does not write; recovery needs another explicit action.
  await app.evaluate(()=>{process.env.XDG_SESSION_TYPE='unknown';});await action(files,'Copy path');await expect.poll(()=>files.getByRole('alert').textContent()).toContain('not copied');expect(clipboardText()).toBe(notes);await app.evaluate(()=>{process.env.XDG_SESSION_TYPE='x11';});expect(clipboardText()).toBe(notes);await action(files,'Copy path');await expect.poll(()=>files.getByRole('status').textContent()).toBe('Path copied.');
  // Filters use real indexed metadata and the production sole-owner query, never source contents.
  const late=join(selected,'public-late.txt'),folder=join(selected,'public-folder');writeFileSync(late,'x'.repeat(100));mkdirSync(folder);
  utimesSync(late,new Date('2024-01-04T12:00:00Z'),new Date('2024-01-04T12:00:00Z'));utimesSync(folder,new Date('2024-01-02T12:00:00Z'),new Date('2024-01-02T12:00:00Z'));
  await search.fill('public');await expect.poll(()=>files.getByRole('option').count(),{timeout:10000}).toBe(4);
  await action(files,'Filter and sort');await files.getByRole('heading',{name:'Filter and sort',exact:true}).waitFor();
  await files.getByLabel('Sort (required)',{exact:true}).selectOption('modified-desc');await files.getByLabel('Kind (required)',{exact:true}).selectOption('file');
  const from=files.getByLabel('Modified from (UTC)',{exact:true}),through=files.getByLabel('Modified through (UTC)',{exact:true});
  await from.fill('2024-01-04');await through.fill('2024-01-02');await action(files,'Apply filters and sort');await files.getByText('Choose a through date on or after the from date. Both dates are inclusive UTC dates.',{exact:true}).waitFor();
  await from.fill('2024-01-02');await through.fill('2024-01-04');
  const filterEvidence=join(root,'packages/builtins/file-search/evidence');
  for(const theme of ['dark','light'] as const){await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);await expect.poll(()=>files.locator(`[data-lc-theme="${theme}"]`).count()).toBeGreaterThan(0);expect((await new AxeBuilder({page:files}).setLegacyMode().analyze()).violations).toEqual([]);await files.screenshot({path:join(filterEvidence,`application-${theme}-filter-form.png`)});}
  await action(files,'Apply filters and sort');await search.waitFor();await expect.poll(()=>files.getByRole('option').count()).toBe(2);
  expect(await files.getByRole('option').allTextContents()).toEqual([expect.stringContaining('public-late.txt'),expect.stringContaining('public-summary.txt')]);expect(await search.inputValue()).toBe('public');expect(clipboardText()).toBe(notes);
  for(const theme of ['dark','light'] as const){await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);await expect.poll(()=>files.locator(`[data-lc-theme="${theme}"]`).count()).toBeGreaterThan(0);expect((await new AxeBuilder({page:files}).setLegacyMode().analyze()).violations).toEqual([]);await files.screenshot({path:join(filterEvidence,`application-${theme}-filtered-results.png`)});}
  // Selection remains stable when still present; deliberate copy is required after applying options.
  await search.press('Home');await search.press('ArrowUp');await action(files,'Copy path');await expect.poll(clipboardText).toBe(late);
  await action(files,'Filter and sort');await files.getByLabel('Kind (required)',{exact:true}).selectOption('directory');await action(files,'Apply filters and sort');await expect.poll(()=>files.getByRole('option').count()).toBe(1);expect(await files.getByRole('option').textContent()).toContain('public-folder');expect(clipboardText()).toBe(late);
  await action(files,'Reset filters and sort');await expect.poll(()=>files.getByRole('option').count()).toBe(4);expect(await search.inputValue()).toBe('public');
  // Explicit browsing lists indexed direct children, retaining the original search for Return.
  mkdirSync(join(folder,'nested'));mkdirSync(join(folder,'empty'));writeFileSync(join(folder,'chapter.txt'),'Public synthetic child');writeFileSync(join(folder,'nested','deep.txt'),'Public synthetic grandchild');
  await search.fill('public-folder');await expect.poll(()=>files.getByRole('option').count(),{timeout:10000}).toBe(5);
  await files.getByRole('option',{name:/^public-folder Public documents/}).click();await action(files,'Browse folder');await expect.poll(()=>files.getByRole('option').count()).toBe(3);expect(await search.inputValue()).toBe('');
  expect(await files.getByRole('option').allTextContents()).toEqual([expect.stringContaining('chapter.txt'),expect.stringContaining('empty'),expect.stringContaining('nested')]);expect(clipboardText()).toBe(late);
  const navigationEvidence=join(root,'packages/builtins/file-search/evidence');
  for(const theme of ['dark','light'] as const){await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);await expect.poll(()=>files.locator(`[data-lc-theme="${theme}"]`).count()).toBeGreaterThan(0);expect((await new AxeBuilder({page:files}).setLegacyMode().analyze()).violations).toEqual([]);await files.screenshot({path:join(navigationEvidence,`application-${theme}-directory.png`)});}
  await search.fill('chapter');await expect.poll(()=>files.getByRole('option').count()).toBe(1);await action(files,'Copy path');await expect.poll(clipboardText).toBe(join(folder,'chapter.txt'));
  await search.fill('');await expect.poll(()=>files.getByRole('option').count()).toBe(3);await files.getByRole('option',{name:/^nested Public documents/}).click();await action(files,'Browse folder');await expect.poll(()=>files.getByRole('option').count()).toBe(1);expect(await files.getByRole('option').textContent()).toContain('deep.txt');
  await action(files,'Parent folder');await expect.poll(()=>files.getByRole('option').count()).toBe(3);await files.getByRole('option',{name:/^empty Public documents/}).click();await action(files,'Browse folder');await expect.poll(()=>files.getByRole('option').count()).toBe(0);expect(await search.inputValue()).toBe('');expect(clipboardText()).toBe(join(folder,'chapter.txt'));
  await action(files,'Browse root folder');await expect.poll(()=>files.getByRole('option').count()).toBe(4);await action(files,'Return to search scope');await expect.poll(()=>files.getByRole('option').count()).toBe(5);expect(await search.inputValue()).toBe('public-folder');
  await search.fill('SYNTHETIC_CONTENT_SENTINEL');await expect.poll(()=>files.getByRole('option').count()).toBe(0);
  renameSync(notes,join(selected,'public-renamed.txt'));await search.fill('public renamed');await expect.poll(()=>files.getByRole('option').count(),{timeout:10000}).toBe(1);
  await action(files,'Pause indexing');await expect.poll(state).toMatchObject({roots:[{activity:'paused'}]});
  // Paused metadata never authorizes a mismatched source read; retry is explicit.
  await search.fill('public-summary');await expect.poll(()=>files.getByRole('option',{selected:true}).textContent()).toContain('public-summary.txt');
  await action(files,'Preview text');await expect.poll(()=>files.locator('pre.lc-text-content').textContent()).toBe(publicText);
  writeFileSync(join(selected,'public-summary.txt'),'PUBLIC_CHANGED_SOURCE_WITH_DIFFERENT_SIZE');
  await action(files,'Copy text');await expect.poll(()=>files.getByRole('status').textContent()).toBe('Text copied.');await expect.poll(clipboardText).toBe(publicText);expect(await files.locator('pre.lc-text-content').textContent()).toBe(publicText);await files.screenshot({path:join(evidence,'application-paused-preview-snapshot-copy.png')});await files.keyboard.press('Escape');
  await action(files,'Preview text');await files.getByRole('heading',{name:'Text preview · public-summary.txt',exact:true}).waitFor();await expect.poll(()=>files.getByRole('alert').textContent()).toContain('Text preview was not read.');
  expect(await files.locator('pre.lc-text-content').textContent()).not.toContain('PUBLIC_CHANGED_SOURCE');
  await files.screenshot({path:join(evidence,'application-text-preview-stale.png')});await files.keyboard.press('Escape');
  writeFileSync(join(selected,'public-summary.txt'),publicText);utimesSync(join(selected,'public-summary.txt'),new Date('2024-01-03T12:00:00Z'),new Date('2024-01-03T12:00:00Z'));
  // Closing this workspace preserves the resident owner. Reopening reuses saved metadata.
  await files.close();files=await openFiles();await expect.poll(state).toMatchObject({roots:[{activity:'paused',state:'ready'}]});
  const quit=async()=>{const exited=new Promise<number|null>(resolve=>app.process().once('exit',resolve));const query=launcher.getByRole('searchbox',{name:'Search commands',exact:true});await query.fill('quit');await query.press('Enter',{noWaitAfter:true});expect(await exited).toBe(0);application=undefined;};
  await quit();({app,launcher}=await launch());files=await openFiles();await expect.poll(state).toMatchObject({roots:[{activity:'paused',state:'ready'}]});
  await files.getByRole('searchbox',{name:'Folders',exact:true}).press('Enter');await files.getByRole('searchbox',{name:'Search files',exact:true}).fill('public renamed');await expect.poll(()=>files.getByRole('option').count()).toBe(1);
  // Reopened queries establish fresh main-owned selections. Old metadata never opens a source.
  const admitted=await files.evaluate(async()=>await (window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles.search({query:'public renamed'}));
  if(!admitted.ok||admitted.value.results.length!==1)throw new Error('Synthetic indexed selection missing.');
  const savedSelection={resultId:admitted.value.results[0]!.id,rootId:admitted.value.results[0]!.rootId,generation:admitted.value.results[0]!.generation};
  await action(files,'Copy path');await expect.poll(clipboardText).toBe(join(selected,'public-renamed.txt'));

  await action(files,'Preview text');await expect.poll(()=>files.locator('pre.lc-text-content').textContent()).toBe('SYNTHETIC_CONTENT_SENTINEL');

  const issuedPreview=await files.evaluate(async selection=>await (window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles.previewText!(selection),savedSelection);
  if(!issuedPreview.ok||!issuedPreview.value.previewId)throw new Error('Synthetic preview token missing.');
  const savedPreviewCopy={...savedSelection,previewId:issuedPreview.value.previewId};

  // This root remains paused: clear must publish invalidation without any live job callback.
  const local=launcher.getByRole('searchbox',{name:'Search commands',exact:true});await local.fill('local data');const opened=app.waitForEvent('window');await local.press('Enter');const data=await opened;await data.waitForURL('linuxcast-app://shell/data-settings.html');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});
  expect(await data.evaluate(async()=>await (window as unknown as {linuxcastData:DataSettingsApi}).linuxcastData.clearCategory('file-index'))).toMatchObject({ok:true});
  await expect.poll(()=>files.getByRole('option').count()).toBe(0);await expect.poll(state).toMatchObject({roots:[{activity:'paused',generation:null}]});
  expect(await files.evaluate(async selection=>await (window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles.copyPath!(selection),savedSelection)).toMatchObject({ok:false});expect(clipboardText()).toBe(join(selected,'public-renamed.txt'));
  await expect.poll(()=>files.locator('pre.lc-text-content').count()).toBe(0);expect(await files.evaluate(async selection=>await (window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles.previewText!(selection),savedSelection)).toMatchObject({ok:false});
  expect(await files.evaluate(async selection=>await (window as unknown as {linuxcastFiles:FileSearchApi}).linuxcastFiles.copyPreviewText!(selection),savedPreviewCopy)).toMatchObject({ok:false});expect(clipboardText()).toBe(join(selected,'public-renamed.txt'));
  expect(readFileSync(join(selected,'public-renamed.txt'),'utf8')).toBe('SYNTHETIC_CONTENT_SENTINEL');expect(readFileSync(join(selected,'public-summary.txt'),'utf8')).toBe(publicText);
  // Original sources survive index clearing and both removal outcomes.
  expect(existsSync(join(selected,'public-renamed.txt'))).toBe(true);await data.close();await files.getByRole('searchbox',{name:'Search files',exact:true}).press('Escape');
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});});await action(files,'Remove folder');await expect.poll(()=>files.getByRole('option').count()).toBe(1);
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});await action(files,'Remove folder');await expect.poll(state).toMatchObject({roots:[]});expect(existsSync(join(selected,'public-renamed.txt'))).toBe(true);
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},selected);
  await files.getByRole('searchbox',{name:'Folders',exact:true}).press('Enter');await files.getByRole('searchbox',{name:'Search files',exact:true}).waitFor();await action(files,'Index folder');await expect.poll(state).toMatchObject({roots:[{activity:'watching'}]});
  const empty=join(selected,'public-empty.txt');writeFileSync(empty,'');const finalSearch=files.getByRole('searchbox',{name:'Search files',exact:true});await finalSearch.fill('public-empty');const emptyRow=files.getByRole('option',{name:/^public-empty[.]txt /});await emptyRow.waitFor();await emptyRow.click();await action(files,'Preview text');await expect.poll(()=>files.getByRole('status').textContent()).toContain('This text file is empty.');expect(clipboardText()).toBe(join(selected,'public-renamed.txt'));await action(files,'Copy text');await expect.poll(()=>files.getByRole('status').textContent()).toBe('Text copied.');expect(await app.evaluate(async({clipboard})=>(await clipboard.read()).flatMap(item=>item.types))).toEqual([]);expect(await app.evaluate(async({clipboard})=>await clipboard.readText())).toBe('');const targets=spawnSync('xclip',['-selection','clipboard','-target','TARGETS','-out'],{env,encoding:'utf8',timeout:3000});if(targets.status===0)expect(targets.stdout.trim().split(/\s+/u).filter(target=>target&&!['TIMESTAMP','TARGETS','SAVE_TARGETS','MULTIPLE'].includes(target))).toEqual([]);else{expect(targets.status).toBe(1);expect(targets.stdout).toBe('');expect(targets.stderr.trim()).toBe('Error: target TARGETS not available');}await files.screenshot({path:join(evidence,'application-empty-preview-copy.png')});expect(readFileSync(empty,'utf8')).toBe('');await quit();
},60000);
