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
