import { useId } from 'react';
import type { ComponentPropsWithRef, ReactNode } from 'react';

/* ---------------------------------------------------------------- key names */
const LINUX_KEY_NAMES: Readonly<Record<string, string>> = {
  ctrl: 'Ctrl', control: 'Ctrl', '⌃': 'Ctrl',
  alt: 'Alt', option: 'Alt', opt: 'Alt', '⌥': 'Alt',
  shift: 'Shift', '⇧': 'Shift',
  super: 'Super', meta: 'Super', cmd: 'Super', command: 'Super', win: 'Super', '⌘': 'Super',
  enter: 'Enter', return: 'Enter', '↩': 'Enter', '⏎': 'Enter',
  escape: 'Escape', esc: 'Escape', '⎋': 'Escape',
  tab: 'Tab', '⇥': 'Tab', delete: 'Delete', del: 'Delete', '⌦': 'Delete', backspace: 'Backspace', '⌫': 'Backspace',
  space: 'Space', up: 'Up', down: 'Down', left: 'Left', right: 'Right',
  arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
};
/**
 * Own-property lookup only. Key names come from untrusted, contract-validated extension data, so
 * inherited names such as `__proto__`, `constructor` or `toString` must stay ordinary text.
 */
const lookup = (names: Readonly<Record<string, string>>, key: string): string | undefined => Object.hasOwn(names, key) ? names[key] : undefined;
/** Linux keycap label for one key. macOS glyphs/names map to Ctrl/Alt/Shift/Super; single letters upper-case. */
export function linuxKeyLabel(key: string): string {
  const trimmed = String(key).trim();
  const named = lookup(LINUX_KEY_NAMES, trimmed.toLowerCase());
  if (named) return named;
  return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
}
const ARIA_KEY_NAMES: Readonly<Record<string, string>> = { Ctrl: 'Control', Super: 'Meta', Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight' };
/** `aria-keyshortcuts` value for a chord (e.g. ['Ctrl','K'] → "Control+K"). */
export function ariaKeyShortcuts(keys: readonly string[]): string {
  return keys.map(linuxKeyLabel).map(key => lookup(ARIA_KEY_NAMES, key) ?? key).join('+');
}

/* ------------------------------------------------------------------ buttons */
export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** `ghost` (additive) is a borderless toolbar/footer verb; `quiet` remains supported. */
  variant?: 'secondary' | 'primary' | 'danger' | 'quiet' | 'ghost';
  busy?: boolean;
  /**
   * Display a keycap chord inside the button and expose it via `aria-keyshortcuts`.
   * Display only: the caller must actually bind the shortcut. Never registers handlers.
   */
  shortcut?: readonly string[] | undefined;
}
export function Button({ variant = 'secondary', busy = false, shortcut, disabled, className = '', children, type = 'button', onClick, ...props }: ButtonProps) {
  return <button aria-keyshortcuts={shortcut?.length ? ariaKeyShortcuts(shortcut) : undefined} {...props} type={type} className={`lc-button lc-focus ${className}`} data-variant={variant}
    disabled={disabled} aria-disabled={busy || props['aria-disabled']} aria-busy={busy || undefined}
    onClick={event => { if (busy || props['aria-disabled'] === true || props['aria-disabled'] === 'true') { event.preventDefault(); return; } onClick?.(event); }}>
    {children}{busy && <span className="lc-busy-mark" aria-hidden="true">…</span>}
    {shortcut?.length ? <KeyChord keys={shortcut} /> : null}
  </button>;
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label'> {
  label: string;
  children: ReactNode;
}
/** Square icon-only control. Defaults to the borderless `ghost` treatment; the label is its accessible name and tooltip. */
export function IconButton({ label, children, className = '', variant = 'ghost', ...props }: IconButtonProps) {
  return <Button {...props} variant={variant} aria-label={label} title={props.title ?? label} className={`lc-icon-button ${className}`}><span aria-hidden="true">{children}</span></Button>;
}

/* --------------------------------------------------------------- text field */
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

/* ------------------------------------------------------------------ keycaps */
/** One display-only key. Strings are normalised to Linux key names. */
export function Keycap({ children }: { children: ReactNode }) {
  return <kbd className="lc-keycap">{typeof children === 'string' ? linuxKeyLabel(children) : children}</kbd>;
}
/** Decorative chord used inside buttons/rows whose accessible name already describes the action. */
function KeyChord({ keys }: { keys: readonly string[] }) {
  return <span className="lc-shortcut" aria-hidden="true">{keys.map((key, index) => <kbd className="lc-keycap" key={`${index}-${key}`}>{linuxKeyLabel(key)}</kbd>)}</span>;
}
/** Display only: this component never installs global or local keyboard handlers. Each key is its own cap. */
export function ShortcutHint({ keys, label }: { keys: readonly string[]; label?: string }) {
  const caps = keys.map(linuxKeyLabel);
  return <span className="lc-shortcut" role="img" aria-label={label ?? caps.join('+')}>{caps.map((key, index) => <kbd className="lc-keycap" aria-hidden="true" key={`${index}-${key}`}>{key}</kbd>)}</span>;
}
