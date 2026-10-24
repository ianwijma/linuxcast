import { useId } from 'react';
import type { ComponentPropsWithRef, ReactNode } from 'react';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: 'secondary' | 'primary' | 'danger' | 'quiet';
  busy?: boolean;
}
export function Button({ variant = 'secondary', busy = false, disabled, className = '', children, type = 'button', onClick, ...props }: ButtonProps) {
  return <button {...props} type={type} className={`lc-button lc-focus ${className}`} data-variant={variant}
    disabled={disabled} aria-disabled={busy || props['aria-disabled']} aria-busy={busy || undefined}
    onClick={event => { if (busy || props['aria-disabled'] === true || props['aria-disabled'] === 'true') { event.preventDefault(); return; } onClick?.(event); }}>
    {children}{busy && <span className="lc-busy-mark" aria-hidden="true">…</span>}
  </button>;
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label'> {
  label: string;
  children: ReactNode;
}
export function IconButton({ label, children, className = '', ...props }: IconButtonProps) {
  return <Button {...props} aria-label={label} title={props.title ?? label} className={`lc-icon-button ${className}`}><span aria-hidden="true">{children}</span></Button>;
}

export interface TextFieldProps extends Omit<ComponentPropsWithRef<'input'>, 'size' | 'type'> {
  label: string;
  type?: 'text' | 'search' | 'email' | 'url' | 'tel' | 'password' | 'number';
  hint?: string;
  error?: string;
}
export function TextField({ label, hint, error, id, className = '', 'aria-describedby': describedBy, ...props }: TextFieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const description = [describedBy, hint ? `${inputId}-hint` : '', error ? `${inputId}-error` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="lc-field">
    <label className="lc-field-label" htmlFor={inputId}>{label}{props.required && <span className="lc-muted"> (required)</span>}</label>
    <input {...props} id={inputId} className={`lc-input lc-focus ${className}`} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={description} />
    {hint && <p id={`${inputId}-hint`} className="lc-field-hint">{hint}</p>}
    {error && <p id={`${inputId}-error`} className="lc-field-error">{error}</p>}
  </div>;
}

export function Keycap({ children }: { children: ReactNode }) { return <kbd className="lc-keycap">{children}</kbd>; }
/** Display only: this component never installs global or local keyboard handlers. */
export function ShortcutHint({ keys, label = keys.join('+') }: { keys: readonly string[]; label?: string }) {
  return <span className="lc-shortcut" role="img" aria-label={label}>{keys.map((key, index) => <kbd className="lc-keycap" aria-hidden="true" key={`${index}-${key}`}>{key}</kbd>)}</span>;
}
