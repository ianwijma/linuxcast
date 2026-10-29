import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { applicationReferenceSchema, fileReferenceSchema, formFieldSchema, uiTextSchema, MAX_ENVELOPE_BYTES, type ViewModel } from '@linuxcast/contracts';
import { Button, TextField } from '../primitives/index.ts';
import type { DraftValue, Field, ViewHost } from './types.ts';
type FormView = Extract<ViewModel, { kind: 'form' }>;
const initial = (field: Field): DraftValue => field.kind === 'secret' ? '' : field.value;
export function ViewForm({ view, host, active, onDirty, requestCancel, isCurrent = () => true }: { view: FormView; host: ViewHost; active: boolean; onDirty: (dirty: boolean) => void; requestCancel: () => void; isCurrent?: (viewId: string, revision: number) => boolean }) {
  const prefix = useId();
  const formElement = useRef<HTMLFormElement>(null);
  const fieldIds = useRef(new Map<string, string>());
  const fieldId = (id: string) => {
    let generated = fieldIds.current.get(id);
    if (!generated) { generated = `${prefix}-field-${fieldIds.current.size}`; fieldIds.current.set(id, generated); }
    return generated;
  };
  useEffect(() => { if (active) formElement.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus(); }, []);
  const [drafts, setDrafts] = useState<Record<string, { kind: Field['kind']; value: DraftValue; revision: number; validation: string }>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  // Loading/status rows shrink the viewport; keep Cancel reachable without
  // moving focus onto an action that a held submit key could activate.
  useLayoutEffect(() => { if(active&&(busy||view.loading))formElement.current?.querySelector<HTMLElement>('.lc-form-actions')?.scrollIntoView?.({block:'nearest'}); },[active,busy,view.loading]);
  useLayoutEffect(()=>{
    // A disabled native submit/field can retain focus until after layout, then
    // lose it even when loading transitions
    // batch into one host revision. Recover only lost document focus; preserve
    // deliberate field/Cancel focus. Pending forms receive inert container focus so
    // Escape stays reachable without placing a held submit key on Cancel.
    const focused=document.activeElement,lost=focused===document.body||focused===formElement.current||focused instanceof HTMLElement&&formElement.current?.contains(focused)&&focused.matches(':disabled');
    if(active&&lost){
      if(busy||view.loading)formElement.current?.focus();
      else formElement.current?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)')?.focus();
    }
  },[active,busy,view.loading,view.revision]);
  const current = useRef({ view, active }); current.current = { view, active };
  const lifetime = useRef(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  // Removed or retyped fields cannot retain a credential or incompatible value.
  useEffect(() => { setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id, draft]) => view.fields.some(field => field.id === id && field.kind === draft.kind)))); }, [view.fields]);
  const valueOf = (field: Field) => drafts[field.id]?.kind === field.kind ? drafts[field.id]!.value : initial(field);
  // Unrelated host revisions (appearance/progress/status) must not revive a
  // validation error already corrected in this draft. New host values/errors do.
  const hostError = (field: Field) => field.error && drafts[field.id]?.revision !== view.revision && drafts[field.id]?.validation !== JSON.stringify([initial(field),field.error]) ? field.error : undefined;
  const change = (field: Field, value: DraftValue) => { setDrafts(previous => ({ ...previous, [field.id]: { kind: field.kind, value, revision: view.revision, validation: JSON.stringify([initial(field),field.error]) } })); setErrors(previous => ({ ...previous, [field.id]: '' })); onDirty(true); };
  const pick = async (field: Extract<Field, { kind: 'file' | 'directory' | 'application' }>) => {
    if (!host.pickReference) return;
    const revision = view.revision; setFailure(false);
    try {
      const result = await host.pickReference(field.kind, lifetime.current.signal);
      if (lifetime.current.signal.aborted || !current.current.active || current.current.view.revision !== revision || !isCurrent(view.viewId, revision) || result === null) return;
      const checked = field.kind === 'application' ? applicationReferenceSchema.safeParse(result) : fileReferenceSchema.safeParse(result);
      if (!checked.success) throw new Error('Invalid reference');
      change(field, checked.data);
    } catch { if (!lifetime.current.signal.aborted) setFailure(true); }
  };
  const submit = async () => {
    const action = view.actions?.find(item => item.id === view.submitActionId);
    if (busy || view.loading || !active || !action || action.disabledReason) return;
    const invalid: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const field of view.fields) {
      const value = valueOf(field);
      if (!(field.kind === 'secret' ? uiTextSchema.safeParse(value) : formFieldSchema.safeParse({ ...field, value })).success) invalid[field.id] = 'Enter a valid value within the field limits.';
      if (field.required && (value === null || value === '' || (field.kind === 'boolean' && value === false))) invalid[field.id] = 'Complete this required field.';
      const hostValidation = hostError(field); if (hostValidation) invalid[field.id] = hostValidation;
      if (field.kind === 'number' && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))) invalid[field.id] = 'Enter a number within the allowed range.';
      if (field.kind === 'date' && value && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || (field.min && value < field.min) || (field.max && value > field.max))) invalid[field.id] = 'Choose a date within the allowed range.';
      if (field.kind === 'enum' && value !== null && !field.options.some(option => option.value === value)) invalid[field.id] = 'Choose an available option.';
      if (field.kind === 'secret' && value && (!host.sealSecret || !host.releaseSecret)) invalid[field.id] = 'Secure credential entry is unavailable. Configure the host credential service.';
    }
    setErrors(invalid);
    const size = new TextEncoder().encode(JSON.stringify(view.fields.map(field => [field.id, valueOf(field)]))).byteLength;
    if (size > MAX_ENVELOPE_BYTES - 8192) { setFailure(true); return; }
    if (Object.keys(invalid).length) { document.getElementById(fieldId(Object.keys(invalid)[0]!))?.focus(); return; }
    setBusy(true); setFailure(false);
    const revision = view.revision;
    const handles: string[] = [];
    let transferred = false;
    try {
      const values = Object.create(null) as Record<string, DraftValue | { secretHandle: string }>;
      for (const field of view.fields) {
        if (lifetime.current.signal.aborted || !current.current.active || current.current.view.revision !== revision || !isCurrent(view.viewId, revision)) throw new Error('Stale submission');
        const value = valueOf(field);
        if (field.kind === 'secret') {
          if (value) {
            const handle = await host.sealSecret!(String(value), lifetime.current.signal);
            if (!handle || typeof handle.secretHandle !== 'string' || !handle.secretHandle || handle.secretHandle.length > 4096) throw new Error('Invalid credential handle');
            handles.push(handle.secretHandle); values[field.id] = { secretHandle: handle.secretHandle };
          }
        } else values[field.id] = value;
      }
      if (lifetime.current.signal.aborted || !current.current.active || current.current.view.revision !== revision || !isCurrent(view.viewId, revision)) return;
      host.action({ viewId: view.viewId, revision, actionId: action.id, values }); transferred = true;
      setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([, draft]) => draft.kind !== 'secret')));
      onDirty(false);
    } catch { if (!lifetime.current.signal.aborted) setFailure(true); }
    finally { if (!transferred) handles.forEach(handle => host.releaseSecret?.(handle)); if (!lifetime.current.signal.aborted) setBusy(false); }
  };
  return <form ref={formElement} tabIndex={-1} noValidate className="lc-view-form" onSubmit={event => { event.preventDefault(); void submit(); }} aria-label={view.title}>
    {view.fields.map(field => {
      const id = fieldId(field.id);
      const value = valueOf(field);
      const error = (Object.hasOwn(errors, field.id) ? errors[field.id] : undefined) || hostError(field);
      if (field.kind === 'text' && field.multiline) return <div className="lc-field" key={field.id}>
        <label className="lc-field-label" htmlFor={id}>{field.title}{field.required && ' (required)'}</label>
        <textarea className="lc-input lc-focus" id={id} rows={6} required={field.required} disabled={busy || view.loading} value={String(value)} autoComplete="off" maxLength={65536}
          aria-describedby={[field.description ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined} aria-invalid={Boolean(error)} onChange={event => change(field, event.target.value)} />
        {field.description && <p className="lc-field-hint" id={`${id}-hint`}>{field.description}</p>}
        {error && <p className="lc-field-error" id={`${id}-error`}>{error}</p>}
      </div>;
      if (field.kind === 'text' || field.kind === 'secret' || field.kind === 'number') return <TextField key={field.id} id={id} label={field.title} type={field.kind === 'secret' ? 'password' : field.kind === 'number' ? 'number' : 'text'} required={field.required} disabled={busy || view.loading} value={value === null ? '' : String(value)}
        {...(field.description ? { hint: field.description } : {})} {...(error ? { error } : {})} autoComplete="off" maxLength={65536}
        {...(field.kind === 'number' ? { min: field.min, max: field.max, step: 'any' } : {})}
        onChange={event => change(field, field.kind === 'number' ? event.target.value === '' ? null : event.target.valueAsNumber : event.target.value)} />;
      const description = [field.description ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
      return <div className="lc-field" key={field.id}>
        <label className="lc-field-label" htmlFor={id}>{field.title}{field.required && ' (required)'}</label>
        {field.kind === 'boolean' ? <input className="lc-focus" id={id} type="checkbox" disabled={busy || view.loading} checked={value === true} required={field.required} aria-describedby={description} aria-invalid={Boolean(error)} onChange={event => change(field, event.target.checked)} /> :
          field.kind === 'enum' ? <select className="lc-input lc-focus" id={id} disabled={busy || view.loading} required={field.required} aria-describedby={description} aria-invalid={Boolean(error)} value={typeof value === 'string' ? value : ''} onChange={event => change(field, event.target.value || null)}><option value="">Choose an option</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> :
          field.kind === 'date' ? <input className="lc-input lc-focus" id={id} type="date" disabled={busy || view.loading} min={field.min} max={field.max} value={typeof value === 'string' ? value : ''} required={field.required} aria-describedby={description} aria-invalid={Boolean(error)} onChange={event => change(field, event.target.value || null)} /> :
            <Button id={id} aria-label={`${field.title}: ${value && typeof value === 'object' ? value.displayName : `Choose ${field.kind}`}`} aria-describedby={description} aria-invalid={Boolean(error)} disabled={busy || view.loading || !host.pickReference} onClick={() => { void pick(field); }}>{value && typeof value === 'object' ? value.displayName : `Choose ${field.kind}`}</Button>}
        {field.description && <p className="lc-field-hint" id={`${id}-hint`}>{field.description}</p>}
        {('file' === field.kind || 'directory' === field.kind || 'application' === field.kind) && !host.pickReference && <p className="lc-field-hint">Selection unavailable. Connect the host picker to choose a permitted resource.</p>}
        {error && <p className="lc-field-error" id={`${id}-error`}>{error}</p>}
      </div>;
    })}
    {failure && <p role="alert">The request could not be completed. Your draft is still available.</p>}
    <div className="lc-form-actions"><Button variant="primary" type="submit" busy={busy} disabled={Boolean(view.actions?.find(action => action.id === view.submitActionId)?.disabledReason)}>{view.actions?.find(action => action.id === view.submitActionId)?.title}</Button><Button disabled={Boolean(view.actions?.find(action => action.id === view.cancelActionId)?.disabledReason)} onClick={requestCancel}>{view.actions?.find(action => action.id === view.cancelActionId)?.title}</Button></div>
  </form>;
}
