import { useRef, useState } from "react";
import type { FormView, ListView } from "../model.ts";
/** Host-owned feasibility primitives, shared by graph structure and fixture preview. */
export function HostList({
  view,
  onSelect,
}: {
  view: ListView;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState(view.search.query);
  const rows = view.sections
    .flatMap((s) => s.items)
    .filter((i) =>
      `${i.title} ${i.subtitle}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    );
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  return (
    <section aria-label={view.title} className="host-list">
      <label className="search-label">
        Search {view.title.toLocaleLowerCase()}
        <input
          value={query}
          placeholder={view.search.placeholder}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {view.status && (
        <p
          className={`notice ${view.status.kind}`}
          role={view.status.kind === "error" ? "alert" : "status"}
        >
          {view.status.message}
        </p>
      )}
      {view.loading ? (
        <p role="status">Loading fixture rows…</p>
      ) : rows.length ? (
        <ul aria-label={`${view.title} list`}>
          {rows.map((row, index) => (
            <li key={row.id}>
              <button
                ref={(el) => {
                  if (el) buttons.current.set(row.id, el);
                  else buttons.current.delete(row.id);
                }}
                type="button"
                aria-pressed={view.selectedId === row.id}
                disabled={!!row.disabledReason}
                title={row.disabledReason ?? row.title}
                onClick={() => onSelect(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    buttons.current
                      .get(
                        rows[
                          (index +
                            (e.key === "ArrowDown" ? 1 : -1) +
                            rows.length) %
                            rows.length
                        ]!.id,
                      )
                      ?.focus();
                  }
                }}
              >
                <span aria-hidden="true" className="row-icon">
                  ◇
                </span>
                <span>
                  <strong>{row.title}</strong>
                  <small>{row.subtitle}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <strong>{query ? "No matching nodes" : view.empty?.title}</strong>
          <p>{query ? "Try a different search." : view.empty?.description}</p>
        </div>
      )}
    </section>
  );
}
export function HostForm({
  view,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  view: FormView;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = Object.fromEntries(view.fields.map((f) => [f.id, f.value]));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(initial) !== JSON.stringify(values);
  return (
    <form
      aria-label={view.title}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const next = Object.fromEntries(
          view.fields.flatMap((field) => {
            const value = values[field.id] ?? "";
            if (field.required && !value.trim())
              return [[field.id, "Enter a value."]];
            if (new TextEncoder().encode(value).length > 65536)
              return [[field.id, "Use at most 64 KiB of text."]];
            return [];
          }),
        );
        setErrors(next);
        if (!Object.keys(next).length) {
          onDirtyChange(false);
          onSubmit(values);
        }
      }}
    >
      {view.fields.map((field) => (
        <label key={field.id}>
          {field.title}
          <input
            value={values[field.id] ?? ""}
            required={field.required}
            aria-invalid={!!errors[field.id]}
            aria-describedby={
              errors[field.id] ? `error-${field.id}` : undefined
            }
            onChange={(e) => {
              const nextValues = { ...values, [field.id]: e.target.value };
              setValues(nextValues);
              onDirtyChange(
                JSON.stringify(initial) !== JSON.stringify(nextValues),
              );
            }}
          />
          {errors[field.id] && (
            <small id={`error-${field.id}`} className="danger">
              {errors[field.id]}
            </small>
          )}
        </label>
      ))}
      <p className="caption" role="status">
        {dirty ? "Unapplied changes" : "Configuration matches this session"}
      </p>
      <div className="button-row">
        <button className="primary" type="submit">
          {view.actions?.find((a) => a.id === view.submitActionId)?.title}
        </button>
        <button
          type="button"
          onClick={() => {
            setValues(initial);
            setErrors({});
            onDirtyChange(false);
            onCancel();
          }}
        >
          Cancel changes
        </button>
      </div>
    </form>
  );
}
