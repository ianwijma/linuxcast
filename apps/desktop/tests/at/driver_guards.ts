import type { Page } from '@playwright/test';

/** No Enter may reach the application catalogue if typing/filtering failed. */
export async function enterAliasForm(page:Page):Promise<void> {
  const ready=await page.evaluate(()=>{
    const dialog=document.querySelector<HTMLDialogElement>('dialog[open][aria-label="Actions"]');
    const input=dialog?.querySelector<HTMLInputElement>('input[type="search"]');
    const actions=dialog?.querySelectorAll<HTMLButtonElement>('button.lc-panel-action');
    const action=actions?.[0];
    const label=action?.cloneNode(true) as HTMLElement|undefined;
    // The canonical host icon is decorative, excluded from the native name.
    label?.querySelectorAll('[aria-hidden="true"]').forEach(element=>element.remove());
    return !!dialog&&!!input&&input===document.activeElement&&input.value==='Edit search alias'&&
      actions?.length===1&&!!action&&label?.textContent?.trim()==='Edit search alias'&&
      !action.disabled&&action.getAttribute('aria-disabled')!=='true'&&action.dataset.current==='true';
  });
  if(!ready)throw new Error('Alias action unavailable.');
  await page.keyboard.press('Enter');
}

/** End is issued only from the fixed twenty-row projection's focused first row.
 * DOM verification supplements the separate fresh native final-row checkpoint. */
export async function endAtFinalResult(page:Page):Promise<void> {
  const ready=await page.evaluate(()=>{
    const root=document.querySelector('.lc-view:not([hidden])');
    const list=root?.querySelector<HTMLElement>('[role="listbox"][aria-label="Search commands"]');
    const query=root?.querySelector<HTMLInputElement>('input[type="search"][data-view-query="true"]');
    const rows=list?.querySelectorAll<HTMLElement>('[role="option"]');
    const first=rows?.[0],last=rows?.[19];
    const title=(row:HTMLElement|undefined)=>row?.querySelector('.lc-result-copy > span')?.textContent;
    return !!list&&list===document.activeElement&&query?.value==='Public AT filler 1'&&rows?.length===20&&
      title(first)==='Public AT filler 100'&&title(last)==='Public AT filler 119'&&
      first?.getAttribute('aria-selected')==='true'&&list.getAttribute('aria-activedescendant')===first.id&&
      list.querySelectorAll('[role="option"][aria-selected="true"]').length===1;
  });
  if(!ready)throw new Error('Final result anchor unavailable.');
  await page.keyboard.press('End');
  await page.getByRole('option',{name:'Public AT filler 119 Installed application',exact:true,selected:true}).waitFor({timeout:1500});
  const selected=await page.evaluate(()=>{
    const list=document.querySelector<HTMLElement>('.lc-view:not([hidden]) [role="listbox"][aria-label="Search commands"]');
    const rows=list?.querySelectorAll<HTMLElement>('[role="option"]'),last=rows?.[19];
    return !!list&&list===document.activeElement&&rows?.length===20&&
      last?.querySelector('.lc-result-copy > span')?.textContent==='Public AT filler 119'&&
      last.getAttribute('aria-selected')==='true'&&list.getAttribute('aria-activedescendant')===last.id&&
      list.querySelectorAll('[role="option"][aria-selected="true"]').length===1;
  });
  if(!selected)throw new Error('Final result selection unavailable.');
}
