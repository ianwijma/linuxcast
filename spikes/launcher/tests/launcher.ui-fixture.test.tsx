// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { App } from "../src/renderer/App.tsx";
import { waylandComponentFixture } from "../fixtures.ts";
import type { LauncherAPI, LauncherState, Reply } from "../src/contract.ts";
import { capabilities } from "../src/contract.ts";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fixtureApi(getState: LauncherAPI["getState"]): LauncherAPI {
  return {
    getState,
    reportContentHeight: vi.fn(async () => ({
      ok: true as const,
      value: null,
    })),
    hideLauncher: vi.fn(async () => ({ ok: true as const, value: null })),
    quit: vi.fn(async () => ({ ok: true as const, value: null })),
    setShortcut: vi.fn(async () => ({
      ok: true as const,
      value: waylandComponentFixture.shortcut,
    })),
    setAppearance: vi.fn(async () => ({ ok: true as const, value: null })),
    beginShortcutRecording: vi.fn(async () => ({
      ok: true as const,
      value: null,
    })),
    cancelShortcutRecording: vi.fn(async () => ({
      ok: true as const,
      value: null,
    })),
    onState: () => () => undefined,
    runtime: { sandboxed: true, contextIsolated: true },
  };
}
it("shows loading while a synthetic host fixture is pending then exposes Wayland component requirements without claiming desktop success", async () => {
  let finish!: (reply: Reply<LauncherState>) => void;
  window.linuxcast = fixtureApi(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<App />);
  expect(view.getByText("Loading local launcher state…").textContent).toContain(
    "Loading local launcher state",
  );
  finish({ ok: true as const, value: waylandComponentFixture });
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: "Launcher capabilities" }),
    ).toBeTruthy(),
  );
  expect(view.queryByRole("region", { name: "Unconfirmed activation" })).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Launcher capabilities" }));
  expect(view.getAllByText("component required")).toHaveLength(2);
  expect(
    view.getByText(/Native Wayland GNOME\/KDE acceptance is outstanding/),
  ).toBeTruthy();
  expect(view.getAllByText(/no validated backend/)).toBeTruthy();
});
it("surfaces synthetic permission denial and retry recovery with no grant or hidden transmission", async () => {
  const getState = vi
    .fn<LauncherAPI["getState"]>()
    .mockResolvedValueOnce({
      ok: false,
      error: {
        code: "permission-denied",
        message:
          "Synthetic permission-denied fixture. No permission was changed.",
      },
    })
    .mockResolvedValueOnce({
      ok: true as const,
      value: waylandComponentFixture,
    });
  window.linuxcast = fixtureApi(getState);
  const view = render(<App />);
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain(
      "Synthetic permission-denied fixture",
    ),
  );
  fireEvent.click(view.getByRole("button", { name: "Retry launcher state" }));
  await waitFor(() =>
    expect(
      view.getByRole("button", { name: "Launcher capabilities" }),
    ).toBeTruthy(),
  );
  expect(getState).toHaveBeenCalledTimes(2);
  expect(window.linuxcast.setShortcut).not.toHaveBeenCalled();
});

it("survives an absent preload bridge and keeps unavailable operations disabled", async () => {
  Reflect.deleteProperty(window, "linuxcast");
  const view = render(<App />);
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain(
      "run linuxcast --quit",
    ),
  );
  expect(
    (
      view.getByRole("button", {
        name: "Dismiss launcher",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (view.getByRole("button", { name: /Actions/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.keyDown(view.getByRole("main"), { key: "Escape" });
  fireEvent.keyDown(view.getByRole("main"), { key: "k", ctrlKey: true });
  expect(view.queryByRole("dialog")).toBeNull();
  fireEvent.click(view.getByRole("button", { name: "Retry launcher state" }));
  await waitFor(() =>
    expect(view.getByRole("alert").textContent).toContain(
      "Launcher state is unavailable",
    ),
  );
});

it("offers keyboard-accessible help for an unconfirmed request, then removes the notice on focus without treating later blur as failure", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const pending: LauncherState = {
    ...waylandComponentFixture,
    session: "x11",
    capabilities: capabilities("x11", false, true),
  };
  const api = fixtureApi(async () => ({ ok: true, value: pending }));
  let publish!: (next: LauncherState) => void;
  api.onState = (listener) => { publish = listener; return () => undefined; };
  window.linuxcast = api;
  const view = render(<App />);
  const notice = await view.findByRole("region", { name: "Unconfirmed activation" });
  expect(within(notice).getByRole("status").textContent).toContain("desktop app switcher");
  const help = within(notice).getByRole("button", { name: "View activation help" });
  help.focus();
  fireEvent.click(help); // Native button Enter/Space activation follows this handler.
  await waitFor(() => expect(document.activeElement).toBe(view.getByRole("heading", { name: "Launcher capabilities" })));
  expect(view.getByText(/none is connected in this prototype/)).toBeTruthy();
  const details = view.getByRole("region", { name: "Launcher capability details" });
  expect(details.tabIndex).toBe(0);
  details.focus();
  expect(document.activeElement).toBe(details);
  fireEvent.keyDown(view.getByRole("main"), { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(view.getByRole("textbox", { name: "Search commands" })));
  act(() => publish({ ...pending, focused: true, capabilities: capabilities("x11", true, false) }));
  expect(view.queryByRole("region", { name: "Unconfirmed activation" })).toBeNull();
  act(() => publish({ ...pending, capabilities: capabilities("x11", false, false) }));
  expect(view.queryByRole("region", { name: "Unconfirmed activation" })).toBeNull();
  expect(api.setShortcut).not.toHaveBeenCalled();
  expect(api.beginShortcutRecording).not.toHaveBeenCalled();
});

for (const entry of ["row", "notice"] as const) for (const exit of ["Escape", "Back"] as const) {
  it(`restores a pre-scrolled search/query/selection after ${entry} child entry and ${exit}`, async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const pending: LauncherState = { ...waylandComponentFixture, session: "x11", capabilities: capabilities("x11", false, true) };
    window.linuxcast = fixtureApi(async () => ({ ok: true, value: pending }));
    const view = render(<App />);
    const search = await view.findByRole("textbox", { name: "Search commands" });
    fireEvent.change(search, { target: { value: "shortcut" } });
    const row = view.getByRole("button", { name: "Change session shortcut" });
    act(() => row.focus());
    const scroll = () => view.container.querySelector<HTMLDivElement>(".content")!;
    for (let cycle = 0; cycle < 2; cycle++) {
      scroll().scrollTop = 115;
      fireEvent.click(entry === "row" ? view.getByRole("button", { name: "Change session shortcut" }) : view.getByRole("button", { name: "View activation help" }));
      const heading = view.getByRole("heading", { name: entry === "row" ? "Session shortcut" : "Launcher capabilities" });
      await waitFor(() => expect(document.activeElement).toBe(heading));
      expect(scroll().scrollTop).toBe(0);
      scroll().scrollTop = 500;
      if (exit === "Back") fireEvent.click(view.getByRole("button", { name: "Back to commands" }));
      else fireEvent.keyDown(view.getByRole("main"), { key: "Escape" });
      await waitFor(() => expect(document.activeElement).toBe(view.getByRole("textbox", { name: "Search commands" })));
      expect(scroll().scrollTop).toBe(115);
      expect((view.getByRole("textbox", { name: "Search commands" }) as HTMLInputElement).value).toBe("shortcut");
      expect(view.getByRole("button", { name: "Change session shortcut" }).getAttribute("aria-pressed")).toBe("true");
    }
    expect(window.linuxcast.beginShortcutRecording).not.toHaveBeenCalled();
  });
}

it("restores the parent offset at activation after focusing help scrolls its parent", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const pending: LauncherState = { ...waylandComponentFixture, session: "x11", capabilities: capabilities("x11", false, true) };
  window.linuxcast = fixtureApi(async () => ({ ok: true, value: pending }));
  const view = render(<App />);
  const help = await view.findByRole("button", { name: "View activation help" });
  const scroll = () => view.container.querySelector<HTMLDivElement>(".content")!;
  expect(scroll().scrollTop).toBe(0);
  // jsdom has no layout: model the browser's focus-scroll effect at that exact event.
  help.addEventListener("focus", () => { scroll().scrollTop = 73; });
  act(() => help.focus());
  expect(scroll().scrollTop).toBe(73);
  fireEvent.click(help);
  await waitFor(() => expect(document.activeElement).toBe(view.getByRole("heading", { name: "Launcher capabilities" })));
  expect(scroll().scrollTop).toBe(0);
  scroll().scrollTop = 500;
  fireEvent.keyDown(view.getByRole("main"), { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(view.getByRole("textbox", { name: "Search commands" })));
  expect(scroll().scrollTop).toBe(73);
});

for (const exit of ["Escape", "Back"] as const) {
  it(`keeps child and restored parent scroll stable when navigation focus would scroll after ${exit}`, async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const pending: LauncherState = { ...waylandComponentFixture, session: "x11", capabilities: capabilities("x11", false, true) };
    window.linuxcast = fixtureApi(async () => ({ ok: true, value: pending }));
    const view = render(<App />);
    const help = await view.findByRole("button", { name: "View activation help" });
    const scroll = () => view.container.querySelector<HTMLDivElement>(".content")!;
    const nativeFocus = HTMLElement.prototype.focus;
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      nativeFocus.call(this, options);
      // jsdom has no browser scrolling. Model navigation focus moving the shared
      // scroll region unless the caller explicitly preserves its position.
      if (this.tagName === "INPUT" && !options?.preventScroll) scroll().scrollTop += 4;
    });
    try {
      scroll().scrollTop = 115;
      fireEvent.click(help);
      await waitFor(() => expect(document.activeElement).toBe(view.getByRole("heading", { name: "Launcher capabilities" })));
      expect(scroll().scrollTop).toBe(0);
      scroll().scrollTop = 500;
      if (exit === "Back") fireEvent.click(view.getByRole("button", { name: "Back to commands" }));
      else fireEvent.keyDown(view.getByRole("main"), { key: "Escape" });
      await waitFor(() => expect(document.activeElement).toBe(view.getByRole("textbox", { name: "Search commands" })));
      expect(scroll().scrollTop).toBe(115);
    } finally { focus.mockRestore(); }
  });
}
