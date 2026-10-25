import type { Page } from '@playwright/test';
import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer,type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
test.describe.configure({mode:'serial'});
let server:ViteDevServer,url:string;
const evidence=fileURLToPath(new URL('../evidence/',import.meta.url));
test.beforeAll(async()=>{
  server=await createServer({configFile:false,root:fileURLToPath(new URL('../fixtures/',import.meta.url)),esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0,fs:{allow:[fileURLToPath(new URL('../../../../../../',import.meta.url))]}},logLevel:'silent'});
  await server.listen();const address=server.httpServer!.address();if(!address || typeof address==='string')throw new Error();url=`http://127.0.0.1:${address.port}`;await mkdir(evidence,{recursive:true});
});
test.afterAll(async()=>{await server?.close();});
async function ready(page:Page,suffix=''){await page.setViewportSize({width:800,height:600});await page.goto(url+suffix);await expect(page.getByRole('searchbox',{name:'Search commands'})).toBeVisible();await page.evaluate(()=>document.fonts.ready);}
for(const theme of ['dark','light'])test(`${theme} real shared launcher rendering and accessible screenshot`,async({page})=>{
  await ready(page,`?theme=${theme}`);await expect(page.getByRole('option')).toHaveCount(3);await expect(page.getByRole('option',{name:/Local data/})).toHaveAttribute('aria-selected','true');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:`${evidence}/${theme}-launcher.png`,fullPage:true});
});
test('query arrows, list Home/End, native query caret and Enter dispatch one stable command intent',async({page})=>{
  await ready(page);const query=page.getByRole('searchbox',{name:'Search commands'});await expect(query).toBeFocused();await query.press('ArrowDown');await expect(page.getByRole('option',{name:/Hide Linuxcast/})).toHaveAttribute('aria-selected','true');
  const list=page.getByRole('listbox');await list.focus();await list.press('End');await expect(page.getByRole('option',{name:/Quit Linuxcast/})).toHaveAttribute('aria-selected','true');await list.press('Home');await expect(page.getByRole('option',{name:/Local data/})).toHaveAttribute('aria-selected','true');
  await query.fill('privacy');await expect(page.getByRole('option')).toHaveCount(1);await query.press('Home');await expect(query).toBeFocused();await query.press('Enter');await expect(page.locator('output')).toHaveText('Requested linuxcast:open-local-data.');
});
test('Ctrl K actions preserve focus and Escape dismisses only after closing actions',async({page})=>{
  await ready(page);const query=page.getByRole('searchbox',{name:'Search commands'});await query.press('Control+k');await expect(page.getByRole('dialog',{name:'Actions'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(query).toBeFocused();await expect(page.locator('output')).toHaveText('No command requested.');await query.press('Escape');await expect(page.locator('output')).toHaveText('Requested Hide.');await expect(query).toBeVisible();
});
test('disabled commands remain discoverable and cannot execute',async({page})=>{
  await ready(page,'?state=disabled');const query=page.getByRole('searchbox',{name:'Search commands'});await query.fill('data');await expect(page.getByRole('option')).toHaveAttribute('aria-disabled','true');await query.press('Enter');await expect(page.locator('output')).toHaveText('No command requested.');await expect(page.getByRole('option')).toContainText('Reopen Linuxcast');expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:`${evidence}/dark-unavailable.png`,fullPage:true});
});
test('loading, filtered-empty and failed execution are explicit safe states',async({page})=>{
  await ready(page,'?state=loading');await expect(page.getByRole('status').filter({hasText:'Loading…'})).toBeVisible();await page.screenshot({path:`${evidence}/dark-loading.png`,fullPage:true});
  await ready(page);await page.getByRole('searchbox').fill('unmatched fixture');await expect(page.getByRole('heading',{name:'No matching results'})).toBeVisible();await page.screenshot({path:`${evidence}/dark-empty.png`,fullPage:true});
  await ready(page,'?state=execution-error');await page.getByRole('searchbox').fill('data');await page.getByRole('searchbox').press('Enter');await expect(page.getByRole('alert')).toContainText('outcome is unknown');await expect(page.locator('body')).not.toContainText('synthetic fixture error');expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:`${evidence}/dark-error.png`,fullPage:true});
});

test('held Enter cannot dispatch from the action-panel query',async({page})=>{
  await ready(page);await page.getByRole('searchbox',{name:'Search commands'}).press('Control+k');const actionQuery=page.getByRole('searchbox',{name:'Find an action'});await actionQuery.dispatchEvent('keydown',{key:'Enter',code:'Enter',repeat:true,bubbles:true,cancelable:true});await expect(page.locator('output')).toHaveText('No command requested.');await expect(page.getByRole('dialog',{name:'Actions'})).toBeVisible();await actionQuery.press('Enter');await expect(page.locator('output')).toHaveText('Requested linuxcast:open-local-data.');
});
for(const theme of ['dark','light'])test(`${theme} keyboard pin/unpin preserves command identity and primary action`,async({page})=>{
  await ready(page,`?theme=${theme}`);const query=page.getByRole('searchbox',{name:'Search commands'});await query.press('ArrowDown');
  await query.press('Control+k');await page.getByRole('searchbox',{name:'Find an action'}).fill('Pin command');await page.getByRole('searchbox',{name:'Find an action'}).press('Enter');
  const hide=page.getByRole('option',{name:/Hide Linuxcast/});await expect(hide).toHaveAttribute('aria-selected','true');await expect(hide).toContainText('Pinned');await expect(page.getByRole('option').first()).toContainText('Hide Linuxcast');await expect(page.getByRole('button',{name:'Hide Enter',exact:true})).toBeVisible();await expect(query).toBeFocused();
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:`${evidence}/${theme}-pinned-command.png`,fullPage:true});
  await query.press('Control+k');await page.getByRole('searchbox',{name:'Find an action'}).fill('Unpin command');await page.getByRole('searchbox',{name:'Find an action'}).press('Enter');
  await expect(hide).not.toContainText('Pinned');await expect(hide).toHaveAttribute('aria-selected','true');await expect(page.getByRole('option').first()).toContainText('Local data');await expect(page.locator('output')).toHaveText('Requested unpin for linuxcast:hide.');
});
test('pending pin does not display saved state or run the selected command',async({page})=>{
  await ready(page,'?state=pin-pending');const query=page.getByRole('searchbox',{name:'Search commands'});await query.press('Control+k');const action=page.getByRole('searchbox',{name:'Find an action'});await action.fill('Pin command');await action.press('Enter');
  const selected=page.getByRole('option',{name:/Local data/});await expect(selected).toHaveAttribute('aria-disabled','true');await expect(selected).not.toContainText('Pinned');await query.press('Enter');await expect(page.locator('output')).toHaveText('Requested pin for linuxcast:open-local-data.');await expect(selected).toContainText('Pinned');await expect(selected).toHaveAttribute('aria-disabled','false');
});
test('pin failure and unavailable storage expose safe reload remediation',async({page})=>{
  await ready(page,'?state=pin-failed');const query=page.getByRole('searchbox',{name:'Search commands'});await query.press('Control+k');await page.getByRole('searchbox',{name:'Find an action'}).fill('Pin command');await page.getByRole('searchbox',{name:'Find an action'}).press('Enter');
  await expect(page.getByRole('alert')).toContainText('could not be confirmed');await expect(page.getByRole('option').first()).not.toContainText('Pinned');await expect(page.locator('body')).not.toContainText('synthetic pin error');await page.screenshot({path:`${evidence}/dark-pin-unconfirmed.png`,fullPage:true});
  await ready(page,'?state=ranking-unavailable');await page.getByRole('searchbox',{name:'Search commands'}).press('Control+k');const pin=page.getByRole('button',{name:/^Pin command/});await expect(pin).toHaveAttribute('aria-disabled','true');await expect(pin).toContainText('Reload commands');await page.getByRole('searchbox',{name:'Find an action'}).fill('Pin command');await page.getByRole('searchbox',{name:'Find an action'}).press('Enter');await expect(page.locator('output')).toHaveText('No command requested.');expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);await page.screenshot({path:`${evidence}/dark-pin-unavailable.png`,fullPage:true});
});
