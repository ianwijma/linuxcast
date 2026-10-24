import type { LauncherAPI } from "../contract.ts";
declare global {
  interface Window {
    linuxcast: LauncherAPI;
  }
}
declare module "*.css";
