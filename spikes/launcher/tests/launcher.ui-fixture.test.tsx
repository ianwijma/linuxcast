// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { App } from "../src/renderer/App.tsx";
import { waylandComponentFixture } from "../fixtures.ts";
import type { LauncherAPI, LauncherState, Reply } from "../src/contract.ts";
afterEach(cleanup);
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
