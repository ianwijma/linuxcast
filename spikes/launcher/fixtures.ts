import { APP_ID, capabilities } from "./src/contract.ts";
import type { LauncherState } from "./src/contract.ts";
/** Synthetic protocol fixtures. These never establish native Wayland/portal acceptance. */
export const waylandComponentFixture: LauncherState = {
  protocolVersion: 1,
  identity: APP_ID,
  session: "wayland",
  shortcut: {
    requested: "Alt+Space",
    effective: null,
    state: "permission-required",
    reason:
      "Synthetic portal-consent fixture. Review the effective binding in desktop settings.",
  },
  capabilities: capabilities("wayland", false),
  visible: true,
  focused: false,
  appearance: "dark",
  recording: false,
};
