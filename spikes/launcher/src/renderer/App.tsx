import { useCallback, useEffect, useRef, useState } from "react";
import type { LauncherState } from "../contract.ts";
import { DEFAULT_SHORTCUT, normalizeShortcut } from "../contract.ts";
type View = "search" | "capabilities" | "shortcut";
export function App() {
  const [state, setState] = useState<LauncherState | null>(null);
  const [failure, setFailure] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("search");
  const [selected, setSelected] = useState("capabilities");
  const [actions, setActions] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState("");
  const [feedback, setFeedback] = useState(
    "Feasibility commands only. Search stays on this device.",
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const load = useCallback(async () => {
    setFailure("");
    try {
      const reply = await window.linuxcast.getState();
      if (reply.ok) setState(reply.value);
      else setFailure(reply.error.message);
    } catch {
      setFailure(
        "Launcher state is unavailable. Retry or reopen the prototype. If the bridge is missing, run linuxcast --quit before reopening.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
    if (!window.linuxcast?.onState) return;
    return window.linuxcast.onState((next) => {
      setState(next);
      setRecording(next.recording);
    });
  }, [load]);
  useEffect(() => {
    if (state?.visible && view === "search") queryRef.current?.focus();
  }, [state?.visible, view]);
  useEffect(() => {
    if (actions) firstAction.current?.focus();
  }, [actions]);
  useEffect(() => {
    const inner = contentRef.current;
    if (!inner || state?.session !== "x11") return;
    const measure = () => {
      const header =
        document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const footer =
        document.querySelector("footer")?.getBoundingClientRect().height ?? 0;
      const parent = getComputedStyle(inner.parentElement!);
      const height = Math.ceil(
        inner.getBoundingClientRect().height +
          header +
          footer +
          parseFloat(parent.paddingTop) +
          parseFloat(parent.paddingBottom) +
          2,
      );
      void window.linuxcast.reportContentHeight(height);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, [state?.session]);
  const rows = [
    {
      id: "capabilities",
      icon: "◇",
      title: "Launcher capabilities",
      subtitle: "Inspect this session’s focus, placement and shortcut status",
    },
    {
      id: "shortcut",
      icon: "⌨",
      title: "Change session shortcut",
      subtitle:
        state?.shortcut.effective ??
        "Choose a key for this disposable prototype",
    },
    {
      id: "appearance",
      icon: "◐",
      title:
        state?.appearance === "dark"
          ? "Use light appearance"
          : "Use dark appearance",
      subtitle: "Switch the opaque host theme",
    },
    {
      id: "hide",
      icon: "−",
      title: "Hide launcher",
      subtitle: "Keep the resident process running",
    },
    {
      id: "quit",
      icon: "×",
      title: "Quit Linuxcast",
      subtitle: "Exit this disposable prototype",
    },
  ];
  const filtered = rows.filter((row) =>
    `${row.title} ${row.subtitle}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const selectedId = filtered.some((row) => row.id === selected)
    ? selected
    : filtered[0]?.id;
  function closeActions() {
    setActions(false);
    actionRef.current?.focus();
  }
  async function invoke(id: string) {
    if (!state || !window.linuxcast) return;
    if (id === "capabilities" || id === "shortcut") {
      setView(id);
      setFeedback("");
      return;
    }
    if (id === "appearance") {
      const reply = await window.linuxcast.setAppearance(
        state?.appearance === "dark" ? "light" : "dark",
      );
      if (!reply.ok) setFailure(reply.error.message);
      return;
    }
    if (id === "hide") {
      await window.linuxcast.hideLauncher();
      return;
    }
    if (id === "quit") await window.linuxcast.quit();
  }
  function cancelRecording() {
    void window.linuxcast.cancelShortcutRecording();
    setRecording(false);
    setPending("");
    setFeedback(
      "Shortcut change cancelled. The current session binding is unchanged.",
    );
  }
  const shortcutLabel =
    state?.shortcut.effective ??
    (state?.shortcut.state === "permission-required"
      ? "Managed by desktop"
      : "No active shortcut");
  return (
    <main
      data-theme={state?.appearance ?? "dark"}
      onKeyDown={(event) => {
        if (!state || !window.linuxcast) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (recording || pending) {
            cancelRecording();
            return;
          }
          if (actions) {
            closeActions();
            return;
          }
          if (view !== "search") {
            setView("search");
            return;
          }
          void window.linuxcast.hideLauncher();
        }
        if (event.ctrlKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          if (actions) closeActions();
          else setActions(true);
        }
      }}
    >
      <header className="query-header">
        <span className="app-symbol" aria-hidden="true">
          ›_
        </span>
        {view === "search" ? (
          <label className="query-label">
            <span className="sr-only">Search commands</span>
            <input
              ref={queryRef}
              disabled={!state}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.ctrlKey &&
                  !event.altKey &&
                  !event.metaKey &&
                  selectedId
                ) {
                  event.preventDefault();
                  void invoke(selectedId);
                }
              }}
              placeholder="Search Linuxcast…"
              spellCheck={false}
            />
          </label>
        ) : (
          <>
            <button
              aria-label="Back to commands"
              onClick={() => setView("search")}
            >
              ←
            </button>
            <h1>
              {view === "capabilities"
                ? "Launcher capabilities"
                : "Session shortcut"}
            </h1>
          </>
        )}
        <button
          disabled={!state}
          aria-label="Dismiss launcher"
          title="Hide launcher; keep running"
          onClick={() => void window.linuxcast.hideLauncher()}
        >
          Esc
        </button>
      </header>
      <div className="content">
        <div ref={contentRef}>
          {!state && !failure && (
            <p role="status" className="notice">
              Loading local launcher state…
            </p>
          )}
          {failure && (
            <div className="notice error" role="alert">
              <p>{failure}</p>
              <button onClick={() => void load()}>Retry launcher state</button>
            </div>
          )}
          {state && view === "search" && (
            <>
              <p className="group-caption">
                Launcher feasibility · local commands
              </p>
              {filtered.length ? (
                <ul className="results" aria-label="Launcher commands">
                  {filtered.map((row, index) => (
                    <li key={row.id}>
                      <button
                        aria-label={row.title}
                        aria-describedby={`subtitle-${row.id}`}
                        aria-pressed={row.id === selectedId}
                        title={`${row.title} — ${row.subtitle}`}
                        ref={(el) => {
                          if (el) rowRefs.current.set(row.id, el);
                          else rowRefs.current.delete(row.id);
                        }}
                        onFocus={() => setSelected(row.id)}
                        onClick={() => void invoke(row.id)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "ArrowDown" ||
                            event.key === "ArrowUp"
                          ) {
                            event.preventDefault();
                            const target =
                              filtered[
                                (index +
                                  (event.key === "ArrowDown" ? 1 : -1) +
                                  filtered.length) %
                                  filtered.length
                              ]!;
                            setSelected(target.id);
                            rowRefs.current.get(target.id)?.focus();
                          }
                        }}
                      >
                        <span className="row-icon" aria-hidden="true">
                          {row.icon}
                        </span>
                        <span>
                          <strong>{row.title}</strong>
                          <small id={`subtitle-${row.id}`}>
                            {row.subtitle}
                          </small>
                        </span>
                        <kbd aria-hidden="true">↵</kbd>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty">
                  <h2>No matching commands</h2>
                  <p>Try “shortcut”, “capabilities” or “quit”.</p>
                </div>
              )}
              <div
                className={`notice ${state.shortcut.state === "available" ? "" : "warning"}`}
              >
                <strong>{shortcutLabel}</strong>
                <p>{state.shortcut.reason}</p>
                {state.shortcut.state !== "available" && (
                  <button onClick={() => setView("shortcut")}>
                    Choose a shortcut
                  </button>
                )}
              </div>
            </>
          )}
          {state && view === "capabilities" && (
            <>
              <p className="group-caption">
                {state.session.toUpperCase()} session · runtime observations
              </p>
              <dl className="capabilities">
                {state.capabilities.map((capability) => (
                  <div key={capability.id}>
                    <dt>
                      {capability.id === "launcher.activate"
                        ? "Focus and activation"
                        : "Window placement"}
                      <span className="badge">
                        {capability.state.replaceAll("-", " ")}
                      </span>
                    </dt>
                    <dd>
                      <p>{capability.reason}</p>
                      {capability.remediation && (
                        <p className="muted">{capability.remediation}</p>
                      )}
                      <small>
                        Backend: {capability.backend ?? "no validated backend"}
                      </small>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="notice warning">
                Native Wayland GNOME/KDE acceptance is outstanding. This session
                does not establish those results.
              </p>
              <p className="caption">{state.identity}</p>
            </>
          )}
          {state && view === "shortcut" && (
            <section aria-label="Shortcut configuration">
              <p className="group-caption">This disposable session only</p>
              <p>
                Current binding: <kbd>{shortcutLabel}</kbd>
              </p>
              <p className="muted">
                Default request is {DEFAULT_SHORTCUT}. A reserved or denied key
                preserves any still-active binding. You can also bind{" "}
                <code>linuxcast --toggle</code> in desktop settings.
              </p>
              <button
                className={recording ? "recording" : ""}
                aria-pressed={recording}
                onClick={async () => {
                  const reply = await window.linuxcast.beginShortcutRecording();
                  if (reply.ok) {
                    setRecording(true);
                    setPending("");
                    setFeedback(
                      "Press a shortcut while this control is focused. Escape cancels.",
                    );
                  } else setFeedback(reply.error.message);
                }}
                onKeyDown={(event) => {
                  if (
                    !recording ||
                    ["Control", "Alt", "Shift", "Meta"].includes(event.key) ||
                    event.key === "Escape"
                  )
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  const key =
                    event.code === "Space"
                      ? "Space"
                      : event.key.length === 1
                        ? event.key.toUpperCase()
                        : event.key;
                  try {
                    setPending(
                      normalizeShortcut(
                        [
                          ...(event.ctrlKey ? ["Ctrl"] : []),
                          ...(event.altKey ? ["Alt"] : []),
                          ...(event.shiftKey ? ["Shift"] : []),
                          ...(event.metaKey ? ["Super"] : []),
                          key,
                        ].join("+"),
                      ),
                    );
                    setRecording(false);
                    void window.linuxcast.cancelShortcutRecording();
                    setFeedback(
                      "Shortcut captured locally. Apply to request registration.",
                    );
                  } catch {
                    setFeedback(
                      "Choose Ctrl, Alt or Super with a letter, number, function key or Space.",
                    );
                  }
                }}
              >
                {recording ? "Listening for a shortcut…" : "Record shortcut"}
              </button>
              {pending && (
                <p className="notice">
                  Requested: <kbd>{pending}</kbd>
                </p>
              )}
              <div className="button-row">
                <button
                  disabled={!pending}
                  onClick={async () => {
                    const reply = await window.linuxcast.setShortcut(pending);
                    if (reply.ok) {
                      setFeedback(reply.value.reason);
                      setPending("");
                    } else setFeedback(reply.error.message);
                  }}
                >
                  Apply shortcut
                </button>
                <button onClick={cancelRecording}>
                  Cancel shortcut change
                </button>
              </div>
              <p className="caption">
                This prototype changes no desktop preferences, autostart entries
                or companion settings.
              </p>
            </section>
          )}
        </div>
      </div>
      <footer>
        <span className="footer-context" role="status">
          {feedback || shortcutLabel}
        </span>
        <button
          ref={actionRef}
          disabled={!state}
          aria-expanded={actions}
          aria-controls="launcher-actions"
          onClick={() => setActions((value) => !value)}
        >
          Actions <kbd>Ctrl K</kbd>
        </button>
      </footer>
      {actions && (
        <section
          role="dialog"
          aria-label="Launcher actions"
          id="launcher-actions"
          className="action-panel"
        >
          <p className="group-caption">Application</p>
          <button
            ref={firstAction}
            onClick={() => {
              closeActions();
              void invoke("hide");
            }}
          >
            Hide launcher
          </button>
          <button className="danger" onClick={() => void invoke("quit")}>
            Quit Linuxcast
          </button>
          <button onClick={closeActions}>
            Close actions <kbd>Esc</kbd>
          </button>
        </section>
      )}
    </main>
  );
}
