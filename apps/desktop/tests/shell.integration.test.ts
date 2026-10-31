import { afterEach, expect, it } from 'vitest';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import type { DesktopShellApi, DataSettingsApi } from '@linuxcast/contracts';
import { LAUNCHER_BUILTIN_COMMAND_IDS } from '@linuxcast/contracts';
import { StorageOwner } from '../../../packages/storage/src/owner.ts';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const executable = createRequire(import.meta.url)('electron') as string;
const appUrl = 'linuxcast-app://shell/index.html';
let application: ElectronApplication | undefined;
let temporary = '';

afterEach(async () => {
  if (application) await application.close().catch(() => { application?.process().kill('SIGKILL'); });
  application = undefined;
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

it('runs the bundled isolated shell, rejects renderer privileges and preserves resident ownership', async () => {
  if (!process.env.DISPLAY || process.env.LINUXCAST_PRIVATE_DISPLAY !== '1')
    throw new Error('Run only with an owned Xvfb display and LINUXCAST_PRIVATE_DISPLAY=1; this is not a desktop integration pass.');
  execFileSync(process.execPath, ['apps/desktop/build.ts'], { cwd: root, timeout: 30000, stdio: 'pipe' });
  temporary = mkdtempSync(join(tmpdir(), 'linuxcast-product-shell-'));
  const profile = join(temporary, 'profile'), wrapper = join(temporary, 'entry.cjs');
  for (const name of ['profile', 'home', 'config', 'cache', 'data', 'runtime', 'system']) mkdirSync(join(temporary, name), { mode: 0o700 });
  mkdirSync(join(temporary,'data/applications'),{recursive:true,mode:0o700});
  const launchMarker=join(temporary,'application-launch.json'),actionMarker=join(temporary,'application-action.json'),applicationTarget=join(temporary,'fixture executable with spaces');
  writeFileSync(applicationTarget,`#!/usr/bin/python3
import json,sys
marker=${JSON.stringify(actionMarker)} if sys.argv[1:2]==['--new-window'] else ${JSON.stringify(launchMarker)}
with open(marker,'w',encoding='utf-8') as output:
 json.dump({'argv':sys.argv[1:],'stdin':sys.stdin.read()},output)
print('SYNTHETIC_CHILD_STDOUT')
print('SYNTHETIC_CHILD_STDERR',file=sys.stderr)
`,{mode:0o700});
  const applicationEntry=join(temporary,'data/applications/public-fixture.desktop');
  const applicationDesktop=`[Desktop Entry]
Type=Application
Name=Public fixture app
Comment=Public synthetic application
Exec="${applicationTarget}" "two words" "literal;$(no-shell)" %c %% %f %u
Actions=NewWindow;
[Desktop Action NewWindow]
Name=New window
Exec="${applicationTarget}" --new-window "two words" "literal;$(no-shell)"
`;
  writeFileSync(applicationEntry,applicationDesktop,{mode:0o600});
  const urlMarker=join(temporary,'url-handoff.json'),urlTarget=join(temporary,'public browser handler with spaces');
  writeFileSync(urlTarget,`#!/usr/bin/python3
import json,sys
with open(${JSON.stringify(urlMarker)},'w',encoding='utf-8') as output:
 json.dump({'argv':sys.argv[1:],'stdin':sys.stdin.read()},output)
print('SYNTHETIC_BROWSER_STDOUT')
print('SYNTHETIC_BROWSER_STDERR',file=sys.stderr)
`,{mode:0o700});
  const browserEntry=join(temporary,'data/applications/public-web.desktop');
  const browserDesktop=`[Desktop Entry]
Type=Application
Name=Public browser fixture
NoDisplay=true
Exec="${urlTarget}" %u
MimeType=x-scheme-handler/http;x-scheme-handler/https;
`;
  writeFileSync(browserEntry,browserDesktop,{mode:0o600});
  writeFileSync(join(temporary,'config/mimeapps.list'),'[Default Applications]\nx-scheme-handler/http=public-web.desktop;\nx-scheme-handler/https=public-web.desktop;\n',{mode:0o600});
  const seed=await StorageOwner.open({dataDirectory:join(temporary,'data/linuxcast'),applicationBuild:'synthetic-data-settings'});
  seed.request({schemaVersion:1,requestId:randomUUID(),method:'commands.recordUse',params:{commandId:'builtin.public-fixture'}});
  await seed.confirmSuccessfulLaunch();await seed.close();
  // Wrapper owns the test profile and strips only Playwright instrumentation flags; all app bundles are production.
  writeFileSync(wrapper, `const { app } = require('electron');\nprocess.argv = process.argv.filter(value => value !== '--inspect=0' && value !== '--remote-debugging-port=0');\napp.setPath('userData', ${JSON.stringify(profile)});\napp.setPath('sessionData', ${JSON.stringify(profile)});\nrequire(${JSON.stringify(join(root, 'apps/desktop/dist/main.cjs'))});\n`, { mode: 0o600 });
  const env: Record<string, string> = { HOME: join(temporary, 'home'), XDG_CONFIG_HOME: join(temporary, 'config'),
    XDG_CACHE_HOME: join(temporary, 'cache'), XDG_DATA_HOME: join(temporary, 'data'),
    XDG_RUNTIME_DIR: join(temporary, 'runtime'), XDG_SESSION_TYPE: 'x11',XDG_DATA_DIRS:join(temporary,'system'),XDG_CONFIG_DIRS:join(temporary,'config'),XDG_CURRENT_DESKTOP:'GNOME',DBUS_SESSION_BUS_ADDRESS:'unix:path=/nonexistent-linuxcast-app-fixture-bus' };
  for (const key of ['DISPLAY', 'XAUTHORITY', 'PATH', 'LANG'])
    if (process.env[key]) env[key] = process.env[key]!;
  const showExisting=async()=>await new Promise<number>((resolve,reject)=>{
    const second=spawn(executable,[wrapper,'--show'],{env,stdio:'ignore'});
    const timer=setTimeout(()=>{second.kill('SIGKILL');reject(new Error('Application reopen timed out.'));},10000);
    second.once('error',error=>{clearTimeout(timer);reject(error);});second.once('exit',code=>{clearTimeout(timer);resolve(code??1);});
  });
  application = await electron.launch({ executablePath: executable, args: [wrapper, '--show'],
    chromiumSandbox: true, env, timeout: 20000 });
  const app = application, page = await app.firstWindow();
  await page.waitForURL(appUrl);
  const query=page.getByRole('combobox',{name:'Search commands',exact:true});
  await query.waitFor({timeout:5000});
  await expect.poll(()=>page.getByRole('option').count()).toBe(LAUNCHER_BUILTIN_COMMAND_IDS.length+1);
  await expect.poll(()=>query.evaluate(element=>element===document.activeElement)).toBe(true);
  await query.fill('Public fixture app');
  await expect.poll(()=>page.getByRole('option').count()).toBe(1);
  await query.press('Enter');
  await expect.poll(async()=>{try{return JSON.parse(await readFile(launchMarker,'utf8'));}catch{return null;}}).toEqual({argv:['two words','literal;$(no-shell)','Public fixture app','%'],stdin:''});
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
  expect(await showExisting()).toBe(0);
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  // The declared action is distinct from primary Open. A change to action Exec
  // alone invalidates the old fingerprint and cannot run with a stale selection.
  await query.fill('Public fixture app');await expect.poll(()=>page.getByRole('option').count()).toBe(1);
  expect(existsSync(actionMarker)).toBe(false);
  writeFileSync(applicationEntry,applicationDesktop.replace('--new-window "two words"','--new-window "updated two words"'),{mode:0o600});
  await query.press('Control+k');const appActions=page.getByRole('searchbox',{name:'Find an action'});await appActions.fill('New window');await appActions.press('Enter');
  await expect.poll(()=>page.getByRole('alert').textContent()).toContain('The application action was not requested.');expect(existsSync(actionMarker)).toBe(false);
  await query.press('Control+k');await appActions.fill('Reload commands');await appActions.press('Enter');
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Public fixture app');
  await query.press('Control+k');await appActions.fill('New window');
  // A single filtered action must fit the compact production window without
  // clipping its separate Close button inside the popup's scrollport.
  const menuGeometry=await page.getByRole('dialog',{name:'Actions',exact:true}).evaluate(element=>({scroll:element.scrollHeight,client:element.clientHeight,height:element.getBoundingClientRect().height,viewport:window.innerHeight,list:element.querySelector('.lc-action-list')?.getBoundingClientRect().height,field:element.querySelector('.lc-field')?.getBoundingClientRect().height,close:element.querySelector('button:last-child')?.getBoundingClientRect().height}));
  expect(menuGeometry.scroll,JSON.stringify(menuGeometry)).toBeLessThanOrEqual(menuGeometry.client);
  const actionEvidence=join(root,'apps/desktop/evidence/instrument-renderer');mkdirSync(actionEvidence,{recursive:true});
  for(const theme of ['dark','light'] as const){
    await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);await expect.poll(()=>page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    await page.screenshot({path:join(actionEvidence,`application-action-${theme}.png`)});expect((await new AxeBuilder({page}).setLegacyMode().analyze()).violations).toEqual([]);
  }
  expect(existsSync(actionMarker)).toBe(false);await appActions.press('Enter');
  await expect.poll(async()=>{try{return JSON.parse(await readFile(actionMarker,'utf8'));}catch{return null;}}).toEqual({argv:['--new-window','updated two words','literal;$(no-shell)'],stdin:''});
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
  expect(await showExisting()).toBe(0);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  // A URL query offers a local command. Only explicit Form submission reaches GIO.
  const publicUrl='https://example.invalid/search?q=%24%28touch%20NO_SHELL%29%3B%20%22two%20words%22#public';
  await query.fill(publicUrl);await expect.poll(()=>page.getByRole('option').count()).toBe(1);
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Open URL');
  expect(existsSync(urlMarker)).toBe(false);await query.press('Enter');
  const urlField=page.getByRole('textbox',{name:/^URL/});await urlField.waitFor();
  expect(await urlField.inputValue()).toBe(publicUrl);expect(existsSync(urlMarker)).toBe(false);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await query.waitFor();expect(existsSync(urlMarker)).toBe(false);
  await query.press('Enter');await urlField.waitFor();await urlField.fill('javascript:alert(1)');
  await page.getByRole('button',{name:'Open URL',exact:true}).click();
  await expect.poll(()=>urlField.getAttribute('aria-invalid')).toBe('true');expect(existsSync(urlMarker)).toBe(false);
  await urlField.fill(publicUrl);
  const urlEvidence=join(root,'apps/desktop/evidence/instrument-renderer');mkdirSync(urlEvidence,{recursive:true});
  for(const theme of ['dark','light'] as const){
    await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);
    await expect.poll(()=>page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    await page.screenshot({path:join(urlEvidence,`open-url-${theme}.png`)});
    expect((await new AxeBuilder({page}).setLegacyMode().analyze()).violations).toEqual([]);
  }
  // Missing native default is real, not an instrumented browser-success response.
  rmSync(browserEntry);await page.getByRole('button',{name:'Open URL',exact:true}).click();
  await expect.poll(()=>page.getByRole('alert').textContent()).toContain('Browser handoff is unavailable');
  expect(await urlField.inputValue()).toBe(publicUrl);expect(await urlField.getAttribute('aria-invalid')).not.toBe('true');expect(existsSync(urlMarker)).toBe(false);
  writeFileSync(browserEntry,browserDesktop,{mode:0o600});
  await page.getByRole('button',{name:'Open URL',exact:true}).click();
  await expect.poll(async()=>{try{return JSON.parse(await readFile(urlMarker,'utf8'));}catch{return null;}}).toEqual({argv:[publicUrl],stdin:''});
  await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
  expect(await showExisting()).toBe(0);await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>{
    const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();
    return reply.ok?reply.value.commands.find(command=>command.id==='linuxcast:open-url')?.usage:null;
  })).toMatchObject({useCount:1});
  await query.fill('data');await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Local data');await query.fill('');
  await expect.poll(()=>page.getByRole('option').count()).toBe(LAUNCHER_BUILTIN_COMMAND_IDS.length+1);
  await query.press('ArrowDown');
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Hide Linuxcast');
  await query.press('ArrowUp');
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Local data');
  await query.fill('no actual command');
  await expect.poll(()=>page.getByRole('heading',{name:'No matching results'}).isVisible()).toBe(true);
  await query.fill('');
  await expect.poll(()=>page.getByRole('option').count()).toBe(LAUNCHER_BUILTIN_COMMAND_IDS.length+1);
  // Pinning is an explicit metadata edit, not a command execution.
  await query.fill('hide');await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Hide Linuxcast');await query.fill('');
  await expect.poll(()=>page.getByRole('option').count()).toBe(LAUNCHER_BUILTIN_COMMAND_IDS.length+1);
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Hide Linuxcast');
  await query.press('Control+k');
  await page.getByRole('searchbox',{name:'Find an action'}).fill('Pin command');
  await page.getByRole('searchbox',{name:'Find an action'}).press('Enter');
  await expect.poll(()=>page.getByRole('option').first().textContent()).toContain('Hide Linuxcast');
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Hide Linuxcast');
  await expect.poll(()=>page.evaluate(async()=>{
    const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();
    return reply.ok?reply.value.commands.find(command=>command.id==='linuxcast:hide')?.usage:null;
  })).toMatchObject({pinned:true,useCount:0,lastUsedAt:null});
  // A search alias changes metadata only. Known collision leaves the draft editable.
  await query.press('Control+k');
  await page.getByRole('searchbox',{name:'Find an action'}).fill('Edit search alias');
  await page.getByRole('searchbox',{name:'Find an action'}).press('Enter');
  const aliasField=page.getByRole('textbox',{name:'Search alias',exact:true});
  await aliasField.fill('quit');await page.getByRole('button',{name:'Save alias',exact:true}).click();
  await expect.poll(()=>page.getByText('This alias is already used by another command. Choose another alias.').isVisible()).toBe(true);
  expect(await aliasField.inputValue()).toBe('quit');
  await aliasField.fill('public-hide');
  const aliasEvidence=join(root,'apps/desktop/evidence/instrument-renderer');mkdirSync(aliasEvidence,{recursive:true});
  for(const theme of ['dark','light'] as const){
    await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);
    await expect.poll(()=>page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    await page.screenshot({path:join(aliasEvidence,`alias-${theme}.png`)});
    expect((await new AxeBuilder({page}).setLegacyMode().analyze()).violations).toEqual([]);
  }
  await page.getByRole('button',{name:'Save alias',exact:true}).click();
  await query.waitFor();
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Hide Linuxcast');
  await expect.poll(()=>page.evaluate(async()=>{
    const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();
    return reply.ok?reply.value.commands.find(command=>command.id==='linuxcast:hide')?.usage:null;
  })).toMatchObject({alias:'public-hide',pinned:true,useCount:0,lastUsedAt:null});
  await query.fill('public-hide');await expect.poll(()=>page.getByRole('option').count()).toBe(1);
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Hide Linuxcast');await query.fill('');
  expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(profile);
  expect(await page.evaluate(() => {
    const windowApi = window as unknown as { require?: unknown; process?: unknown; linuxcast?: DesktopShellApi };
    return { require: typeof windowApi.require, process: typeof windowApi.process,
      methods: Object.keys(windowApi.linuxcast ?? {}).sort(), runtime: windowApi.linuxcast?.runtime };
  })).toEqual({ require: 'undefined', process: 'undefined',
    methods: ['checkDictionarySpelling','copyDictionarySpellingSuggestion','releaseDictionarySpelling','searchDictionaryDefinitions','readDictionaryDefinition','configureDictionaryDefinitions','releaseDictionaryDefinitionsSearch','searchDictionary','copyDictionaryWord','releaseDictionarySearch','searchEmoji','copyEmoji','setEmojiFavourite','setEmojiKeywords','updateEmojiFrecency','releaseEmojiSearch','searchLauncherNotes','openLauncherNote','getRateConfiguration','configureRateSource','convertRate','copyRateResult','clearRateCache','exportQuicklink','listQuicklinks','getQuicklink','saveQuicklink','removeQuicklink','openQuicklink','executeApplicationAction', 'setLauncherHidden', 'copyCalculatorResult', 'openLauncherUrl', 'setLauncherAlias', 'setLauncherPinned', 'getLauncherCommands', 'executeLauncherCommand', 'getState', 'openDataSettings', 'hideLauncher', 'reportContentHeight', 'quit', 'onState', 'runtime'].sort(),
    runtime: { sandboxed: true, contextIsolated: true } });
  expect(await page.evaluate(async () => {
    return await new Promise<boolean>(resolve => {
      document.addEventListener('securitypolicyviolation', event => {
        if (event.violatedDirective === 'connect-src') resolve(true);
      }, { once: true });
      void fetch('https://example.invalid/').catch(() => {});
      setTimeout(() => resolve(false), 1000);
    });
  })).toBe(true);
  const evidence = join(root, 'apps/desktop/evidence/instrument-renderer'); mkdirSync(evidence, { recursive: true });
  for (const theme of ['dark', 'light'] as const) {
    await app.evaluate(({ nativeTheme }, value) => { nativeTheme.themeSource = value; }, theme);
    await expect.poll(() => page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    await page.screenshot({ path: join(evidence, `shell-${theme}.png`) });
  }
  expect((await new AxeBuilder({page}).setLegacyMode().analyze()).violations).toEqual([]);
  const action=async(target:typeof page,title:string)=>{await target.keyboard.press('Control+k');const find=target.getByRole('searchbox',{name:'Find an action'});await find.fill(title);await find.press('Enter');};
  // Actual metadata administration: hiding removes an already-used, pinned,
  // aliased application from root search without running or uninstalling it.
  await query.fill('Public fixture app');await expect.poll(()=>page.getByRole('option').count()).toBe(1);
  await action(page,'Pin command');await action(page,'Edit search alias');
  await page.getByRole('textbox',{name:'Search alias',exact:true}).fill('public-application');await page.getByRole('button',{name:'Save alias',exact:true}).click();await query.waitFor();
  await query.fill('public-application');await expect.poll(()=>page.getByRole('option').count()).toBe(1);
  const applicationMetadata=await page.evaluate(async()=>{const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();return reply.ok?reply.value.commands.find(row=>row.provider==='applications'):undefined;});
  expect(applicationMetadata?.usage).toMatchObject({pinned:true,alias:'public-application',useCount:2});
  await action(page,'Hide command');await expect.poll(()=>page.getByRole('option').count()).toBe(0);
  await action(page,'Manage commands');const managed=page.getByRole('combobox',{name:'Manage commands',exact:true});await managed.fill('public-application');
  await expect.poll(()=>page.getByRole('option').count()).toBe(1);await expect.poll(()=>page.getByRole('option').textContent()).toContain('Hidden');
  expect(await page.evaluate(async()=>{const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();return reply.ok?reply.value.commands.find(row=>row.provider==='applications')?.usage:null;})).toEqual(applicationMetadata?.usage);
  for(const theme of ['dark','light'] as const){
    await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);await expect.poll(()=>page.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    await page.screenshot({path:join(evidence,`command-visibility-${theme}.png`)});expect((await new AxeBuilder({page}).setLegacyMode().analyze()).violations).toEqual([]);
  }
  await page.keyboard.press('Escape');await query.waitFor();expect(await query.inputValue()).toBe('public-application');expect(await page.getByRole('option').count()).toBe(0);
  const nextWindow=app.waitForEvent('window');
  await query.fill('settings');
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Local data');
  await query.press('Enter');
  const data=await nextWindow;await data.waitForURL('linuxcast-app://shell/data-settings.html');
  await expect.poll(()=>data.getByRole('heading',{name:'Local data',exact:true}).isVisible()).toBe(true);
  await expect.poll(()=>data.getByRole('button',{name:'Export command usage'}).isEnabled()).toBe(true);
  // Local data recorded a use after this renderer snapshot. Its valid owner ack
  // must update that total without treating an ordinary alias save as uncertain.
  await query.press('Control+k');
  await page.getByRole('searchbox',{name:'Find an action'}).fill('Edit search alias');
  await page.getByRole('searchbox',{name:'Find an action'}).press('Enter');
  await page.getByRole('textbox',{name:'Search alias',exact:true}).fill('public-data');
  await page.getByRole('button',{name:'Save alias',exact:true}).click();await query.waitFor();
  await expect.poll(()=>page.evaluate(async()=>{
    const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();
    return reply.ok?reply.value.commands.find(command=>command.id==='linuxcast:open-local-data')?.usage:null;
  })).toMatchObject({alias:'public-data',useCount:1});
  expect(await data.evaluate(()=>({require:typeof (window as unknown as {require?:unknown}).require,process:typeof (window as unknown as {process?:unknown}).process,
    shell:typeof (window as unknown as {linuxcast?:unknown}).linuxcast,methods:Object.keys((window as unknown as {linuxcastData:DataSettingsApi}).linuxcastData).sort()})))
    .toEqual({require:'undefined',process:'undefined',shell:'undefined',methods:['clearCategory','close','exportCategory','getState','onAppearance','openCredentials']});
  expect(await data.evaluate(()=>(window as unknown as {linuxcastData:DataSettingsApi}).linuxcastData.clearCategory('permissions' as never))).toMatchObject({ok:false,error:{code:'invalid-request'}});
  for(const theme of ['dark','light'] as const){
    await app.evaluate(({nativeTheme},value)=>{nativeTheme.themeSource=value;},theme);
    await expect.poll(()=>data.locator('.lc-theme').getAttribute('data-lc-theme')).toBe(theme);
    await data.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
    await data.screenshot({path:join(evidence,`data-settings-${theme}.png`)});
    expect((await new AxeBuilder({page:data}).setLegacyMode().analyze()).violations).toEqual([]);
  }
  const search=data.getByRole('searchbox',{name:'Search data categories'});await search.fill('no matching fixture');
  await expect.poll(()=>data.getByRole('heading',{name:'No matching categories'}).isVisible()).toBe(true);await search.fill('');
  // Native choices are instrumented; storage, renderer IPC and saved files are actual production paths.
  const exportFile=join(temporary,'usage-before.json');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showMessageBox=async()=>({response:0,checkboxChecked:false});},exportFile);
  await data.getByRole('button',{name:'Clear command usage'}).click();await expect.poll(()=>data.getByRole('status').textContent()).toBe('Action cancelled.');
  await data.getByRole('button',{name:'Export command usage'}).click();await expect.poll(()=>data.getByRole('status').textContent()).toBe('Export saved.');
  const before=JSON.parse(await readFile(exportFile,'utf8'));
  expect(before).toMatchObject({encrypted:false,data:{category:'command-usage'}});
  expect(before.data.records).toContainEqual(expect.objectContaining({commandId:'builtin.public-fixture',useCount:1}));
  expect(before.data.records.find((record:{commandId:string})=>record.commandId.startsWith('application:'))).toMatchObject({useCount:2});
  expect(JSON.stringify(before)).not.toContain('NewWindow');expect(JSON.stringify(before)).not.toContain('--new-window');
  expect(before.data.records).toContainEqual(expect.objectContaining({commandId:'linuxcast:open-local-data',useCount:1}));
  expect(before.data.records).toContainEqual(expect.objectContaining({commandId:'linuxcast:open-url',useCount:1}));
  expect(JSON.stringify(before)).not.toContain(publicUrl);
  expect(before.data.records).toContainEqual(expect.objectContaining({commandId:'linuxcast:hide',pinned:true,useCount:0,lastUsedAt:null,alias:'public-hide'}));
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});});
  await data.getByRole('button',{name:'Clear command usage'}).click();await expect.poll(()=>data.getByRole('status').textContent()).toBe('Data cleared.');
  const afterFile=join(temporary,'usage-after.json');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},afterFile);
  await data.getByRole('button',{name:'Export command usage'}).click();await expect.poll(()=>data.getByRole('status').textContent()).toBe('Export saved.');
  expect(JSON.parse(await readFile(afterFile,'utf8')).data.records).toContainEqual(expect.objectContaining({commandId:'builtin.public-fixture',useCount:0,lastUsedAt:null}));
  await data.getByRole('button',{name:'Export command usage'}).click();await expect.poll(()=>data.getByRole('status').textContent()).toBe('The data action could not be completed. Check the category before trying again.');
  expect(JSON.parse(await readFile(afterFile,'utf8')).data.records).toContainEqual(expect.objectContaining({commandId:'linuxcast:hide',pinned:true,useCount:0,lastUsedAt:null,alias:'public-hide'}));
  expect(JSON.parse(await readFile(afterFile,'utf8')).data.records.every((record:{useCount:number})=>record.useCount===0)).toBe(true);
  expect(await page.evaluate(async()=>{const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();return reply.ok?reply.value.commands.find(row=>row.provider==='applications'):null;})).toMatchObject({hidden:true,usage:{pinned:true,alias:'public-application',useCount:0,lastUsedAt:null}});
  await data.getByRole('button',{name:'Close settings'}).click();await expect.poll(()=>data.isClosed()).toBe(true);
  expect(await app.evaluate(({ app }) => app.getAppMetrics().filter(metric => metric.name === 'Linuxcast storage').length)).toBe(1);
  expect(await app.evaluate(async ({ utilityProcess }, options) => new Promise<boolean>((resolve, reject) => {
    const child = utilityProcess.fork(options.entry, [], { env: {}, stdio: 'ignore' });
    let denied = false;
    const timer = setTimeout(() => { child.kill(); reject(new Error('Resident owner check timed out.')); }, 5000);
    child.once('spawn', () => child.postMessage({ kind: 'initialize', dataDirectory: options.directory,
      applicationBuild: 'synthetic-contender', nativeBinding: options.binding }));
    child.on('message', (message: { kind: string; reasonCode?: string }) => {
      denied = message.kind === 'unavailable' && message.reasonCode === 'owner-already-running';
      child.kill();
    });
    child.once('exit', () => { clearTimeout(timer); resolve(denied); });
  }), { entry: join(root, 'apps/desktop/dist/storage.cjs'), directory: join(temporary, 'data/linuxcast'),
    binding: join(root, 'apps/desktop/dist/sqlite/better_sqlite3.node') })).toBe(true);
  const storage = await app.evaluate(async ({ utilityProcess }, options) => {
    async function run(write: boolean) {
      return await new Promise<{ sqliteVersion: string; value: unknown }>((resolve, reject) => {
        const child = utilityProcess.fork(options.entry, [], { env: {}, stdio: 'ignore' });
        const timer = setTimeout(() => { child.kill(); reject(new Error('Storage utility timed out.')); }, 10000);
        let sqliteVersion = '', result: unknown;
        child.once('spawn', () => child.postMessage({ kind: 'initialize', dataDirectory: options.directory,
          applicationBuild: 'synthetic-integration', nativeBinding: options.binding }));
        child.on('message', (message: { kind: string; sqliteVersion?: string; response?: { outcome: string; result?: unknown } }) => {
          if (message.kind === 'ready') {
            sqliteVersion = message.sqliteVersion!;
            child.postMessage({ kind: 'request', deadline: Date.now() + 5000, request: {
              schemaVersion: 1, requestId: write ? 'synthetic-write' : 'synthetic-read',
              method: write ? 'settings.set' : 'settings.get',
              params: write ? { id: 'ui.theme', value: 'dark', expectedRevision: 0 } : { id: 'ui.theme' },
            } });
          } else if (message.kind === 'response' && message.response?.outcome === 'completed') {
            result = message.response.result;
            child.postMessage({ kind: 'shutdown' });
          } else if (message.kind !== 'closed') {
            child.kill(); reject(new Error('Storage utility did not complete the synthetic request.'));
          }
        });
        child.once('exit', code => {
          clearTimeout(timer);
          if (code !== 0 || !sqliteVersion || result === undefined) reject(new Error('Storage utility exited without completion.'));
          else resolve({ sqliteVersion, value: result });
        });
      });
    }
    return { write: await run(true), reopened: await run(false) };
  }, { entry: join(root, 'apps/desktop/dist/storage.cjs'), directory: join(temporary, 'utility-data'),
    binding: join(root, 'apps/desktop/dist/sqlite/better_sqlite3.node') });
  expect(storage.write.sqliteVersion).toBe('3.53.4');
  expect(storage.reopened.sqliteVersion).toBe('3.53.4');
  expect(storage.reopened.value).toMatchObject({ id: 'ui.theme', value: 'dark', revision: 1 });
  const windowId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.id);
  await query.fill('public-hide');
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Hide Linuxcast');
  await query.press('Enter');
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false);
  const secondCode = await new Promise<number>((resolve, reject) => {
    const second = spawn(executable, [wrapper, '--toggle'], { env, stdio: 'ignore' });
    const timeout = setTimeout(() => { second.kill('SIGKILL'); reject(new Error('Second invocation timed out.')); }, 10000);
    second.once('error', error => { clearTimeout(timeout); reject(error); });
    second.once('exit', code => { clearTimeout(timeout); resolve(code ?? 1); });
  });
  expect(secondCode).toBe(0);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => window.id))).toEqual([windowId]);
  await query.fill('quit');
  await expect.poll(()=>page.getByRole('option',{selected:true}).textContent()).toContain('Quit Linuxcast');
  await query.focus();
  expect(await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents;
    const blocked = new Promise<boolean>(resolve => contents.once('will-frame-navigate', event => resolve(event.defaultPrevented)));
    void contents.executeJavaScript("location.href = 'https://example.invalid/';").catch(() => {});
    return await Promise.race([blocked, new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000))]);
  })).toBe(true);
  expect(page.url()).toBe(appUrl);
  await page.evaluate(() => { window.open('https://example.invalid/'); });
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  const child = app.process();
  const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
  // Actual keyboard dispatch; no locator navigation auto-wait after the denied navigation.
  await page.keyboard.press('Enter');
  expect(await exited).toBe(0);
  application = undefined;
  // Relaunch the same real private profile: pins must be durable, not renderer state.
  application=await electron.launch({executablePath:executable,args:[wrapper,'--show'],chromiumSandbox:true,env,timeout:20000});
  const restarted=application,reopened=await restarted.firstWindow();await reopened.waitForURL(appUrl);
  const reopenedQuery=reopened.getByRole('combobox',{name:'Search commands',exact:true});
  await reopenedQuery.waitFor();
  await expect.poll(()=>reopened.getByRole('option').first().textContent()).toContain('Hide Linuxcast');
  const savedUsage=await reopened.evaluate(async()=>{
    const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();
    return reply.ok?reply.value.commands.find(command=>command.id==='linuxcast:hide')?.usage:null;
  });
  expect(savedUsage).toMatchObject({pinned:true,useCount:1,alias:'public-hide'});
  // Restart proves the root exclusion is durable. Show via the same management
  // List, then execute the real registered GIO application again.
  await reopenedQuery.fill('public-application');await expect.poll(()=>reopened.getByRole('option').count()).toBe(0);
  await action(reopened,'Manage commands');const reopenedManaged=reopened.getByRole('combobox',{name:'Manage commands',exact:true});await reopenedManaged.fill('public-application');await expect.poll(()=>reopened.getByRole('option').textContent()).toContain('Hidden');
  await action(reopened,'Show command');await expect.poll(()=>reopened.getByRole('option').textContent()).toContain('Shown');
  await reopened.keyboard.press('Escape');await reopenedQuery.waitFor();expect(await reopenedQuery.inputValue()).toBe('public-application');await expect.poll(()=>reopened.getByRole('option').count()).toBe(1);
  expect(await reopened.evaluate(async()=>{const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();return reply.ok?reply.value.commands.find(row=>row.provider==='applications'):null;})).toMatchObject({hidden:false,usage:{pinned:true,alias:'public-application',useCount:0,lastUsedAt:null}});
  rmSync(launchMarker);await reopenedQuery.press('Enter');await expect.poll(()=>existsSync(launchMarker)).toBe(true);
  expect(await showExisting()).toBe(0);await expect.poll(()=>restarted.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
  await reopenedQuery.fill('public-hide');await expect.poll(()=>reopened.getByRole('option').count()).toBe(1);
  await reopenedQuery.press('Control+k');
  await reopened.getByRole('searchbox',{name:'Find an action'}).fill('Edit search alias');
  await reopened.getByRole('searchbox',{name:'Find an action'}).press('Enter');
  const persistedAlias=reopened.getByRole('textbox',{name:'Search alias',exact:true});
  expect(await persistedAlias.inputValue()).toBe('public-hide');await persistedAlias.fill('');
  await reopened.getByRole('button',{name:'Save alias',exact:true}).click();await reopenedQuery.waitFor();
  await reopenedQuery.fill('hide');await expect.poll(()=>reopened.getByRole('option',{selected:true}).textContent()).toContain('Hide Linuxcast');
  await reopenedQuery.press('Control+k');
  await reopened.getByRole('searchbox',{name:'Find an action'}).fill('Unpin command');
  await reopened.getByRole('searchbox',{name:'Find an action'}).press('Enter');
  await expect.poll(()=>reopened.evaluate(async()=>{
    const reply=await (window as unknown as {linuxcast:DesktopShellApi}).linuxcast.getLauncherCommands();
    return reply.ok?reply.value.commands.find(command=>command.id==='linuxcast:hide')?.usage:null;
  })).toMatchObject({pinned:false,useCount:1,alias:null});
  await reopenedQuery.fill('quit');
  await expect.poll(()=>reopened.getByRole('option',{selected:true}).textContent()).toContain('Quit Linuxcast');
  const stopped=new Promise<number|null>(resolve=>restarted.process().once('exit',resolve));
  await reopenedQuery.press('Enter',{noWaitAfter:true});expect(await stopped).toBe(0);application=undefined;
  const persisted=await StorageOwner.open({dataDirectory:join(temporary,'data/linuxcast'),applicationBuild:'synthetic-pin-reopen'});
  try {
    expect(persisted.request({schemaVersion:1,requestId:randomUUID(),method:'commands.getUsage',params:{commandId:'linuxcast:hide'}}).result).toMatchObject({pinned:false,useCount:1,alias:null});
    expect(persisted.request({schemaVersion:1,requestId:randomUUID(),method:'commands.listHidden',params:{}}).result).toEqual([]);
    expect(persisted.request({schemaVersion:1,requestId:randomUUID(),method:'commands.getUsage',params:{commandId:applicationMetadata!.id}}).result).toMatchObject({pinned:true,alias:'public-application',useCount:1});
  } finally {await persisted.close();}
}, 60000);
