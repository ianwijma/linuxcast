// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import type { Page } from '@playwright/test';
import { rankCommands } from '../../../../packages/search/src/index.ts';
import { enterAliasForm, endAtFinalResult } from './driver_guards.ts';
afterEach(()=>{document.body.replaceChildren();});
function fixture(){
  document.body.innerHTML='<dialog open aria-label="Actions"><label for="action-search">Find an action</label><input id="action-search" type="search" value="Edit search alias"><button class="lc-panel-action" data-current="true" aria-disabled="false"><span aria-hidden="true">⌕</span><span>Edit search alias</span></button></dialog>';
  const input=document.querySelector('input')!,action=document.querySelector('button')!;
  input.focus(); // Synthetic DOM fixture only; the native driver never injects focus.
  const press=vi.fn(async()=>{}),page={evaluate:async(fn:()=>unknown)=>fn(),keyboard:{press}} as unknown as Page;
  return {input,action,press,page};
}
it('enters only the sole exact enabled current alias action',async()=>{
  const f=fixture();await enterAliasForm(f.page);expect(f.press).toHaveBeenCalledExactlyOnceWith('Enter');
});
it.each(['dropped-text','wrong-action','multiple','disabled','not-current','no-focus','no-dialog'])('does not dispatch Enter after %s',async failure=>{
  const f=fixture();
  if(failure==='dropped-text')f.input.value='';
  if(failure==='wrong-action')f.action.textContent='Open';
  if(failure==='multiple')f.action.after(f.action.cloneNode(true));
  if(failure==='disabled')f.action.setAttribute('aria-disabled','true');
  if(failure==='not-current')f.action.dataset.current='false';
  if(failure==='no-focus')f.input.blur();
  if(failure==='no-dialog')document.querySelector('dialog')!.removeAttribute('open');
  await expect(enterAliasForm(f.page)).rejects.toThrow('Alias action unavailable.');expect(f.press).not.toHaveBeenCalled();
});

function finalFixture(){
  document.body.innerHTML='<div class="lc-view"><input type="search" data-view-query="true" value="Public AT filler 1"><div role="listbox" aria-label="Search commands" tabindex="0" aria-activedescendant="row-0"></div></div>';
  const list=document.querySelector<HTMLElement>('[role="listbox"]')!;
  for(let index=0;index<20;index++){
    const row=document.createElement('div');row.id=`row-${index}`;row.setAttribute('role','option');row.setAttribute('aria-selected',String(index===0));
    row.innerHTML=`<span class="lc-result-copy"><span>Public AT filler ${String(100+index).padStart(3,'0')}</span><small>Installed application</small></span>`;list.append(row);
  }
  list.focus(); // Synthetic fixture only; production adapter uses native keys.
  const rows=[...list.querySelectorAll<HTMLElement>('[role="option"]')];
  const press=vi.fn(async()=>{rows[0]!.setAttribute('aria-selected','false');rows[19]!.setAttribute('aria-selected','true');list.setAttribute('aria-activedescendant','row-19');});
  const waitFor=vi.fn(async()=>{}),page={evaluate:async(fn:()=>unknown)=>fn(),keyboard:{press},getByRole:()=>({waitFor})} as unknown as Page;
  return {list,rows,press,page,waitFor};
}
it('presses End from the exact final-page projection anchor and verifies its sole final selection',async()=>{
  const f=finalFixture();await endAtFinalResult(f.page);expect(f.press).toHaveBeenCalledExactlyOnceWith('End');expect(f.waitFor).toHaveBeenCalledExactlyOnceWith({timeout:1500});
});
it.each(['wrong-query','short-list','wrong-last','no-focus','multiple','wrong-anchor'])('does not dispatch End with %s',async failure=>{
  const f=finalFixture();
  if(failure==='wrong-query')document.querySelector('input')!.value='Public AT result';
  if(failure==='short-list')f.rows[19]!.remove();
  if(failure==='wrong-last')f.rows[19]!.querySelector('span > span')!.textContent='Private canary';
  if(failure==='no-focus')f.list.blur();
  if(failure==='multiple')f.rows[1]!.setAttribute('aria-selected','true');
  if(failure==='wrong-anchor')f.list.setAttribute('aria-activedescendant','row-1');
  await expect(endAtFinalResult(f.page)).rejects.toThrow('Final result anchor unavailable.');expect(f.press).not.toHaveBeenCalled();
});
it('refuses to report a final selection if End did not move selection',async()=>{
  const f=finalFixture();f.press.mockImplementation(async()=>{});
  await expect(endAtFinalResult(f.page)).rejects.toThrow('Final result selection unavailable.');
});

it('derives the final twenty-row projection from actual production ranking without changing its cap',()=>{
  const commands=Array.from({length:120},(_,index)=>({id:`application:fixture-${index}`,provider:'applications' as const,title:`Public AT filler ${String(index).padStart(3,'0')}`,aliases:[],keywords:[],enabled:true,usage:null}));
  expect(rankCommands(commands,'Public AT filler 1',0).map(row=>row.title)).toEqual(Array.from({length:20},(_,index)=>`Public AT filler ${100+index}`));
});
