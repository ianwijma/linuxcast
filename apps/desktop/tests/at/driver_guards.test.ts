// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import type { Page } from '@playwright/test';
import { enterAliasForm } from './driver_guards.ts';
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
