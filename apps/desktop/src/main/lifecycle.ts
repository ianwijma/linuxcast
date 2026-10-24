import type { ShellCommand } from './commands.ts';

/** Trusted main-process owners only. No child/service handles reach the renderer. */
export interface ResidentService {
  /** Resolve only after resources are closed and any owned process has exited. */
  stop(): Promise<void>;
  terminate(): Promise<void>;
}

export interface ResidentWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  show(): void;
  hide(): void;
  destroy(): void;
}

/** One creation in flight; toggles received during loading retain their parity. */
export class ResidentLifecycle {
  private window: ResidentWindow | undefined;
  private creating: Promise<void> | undefined;
  private wantsVisible = false;
  private closing: Promise<void> | undefined;
  private stopped = false;
  private exitCode = 0;
  private readonly createWindow: () => Promise<ResidentWindow>;
  private readonly services: readonly ResidentService[];
  private readonly finishQuit: (exitCode: number) => void;
  private readonly reportFailure: () => void;
  constructor(
    createWindow: () => Promise<ResidentWindow>,
    services: readonly ResidentService[],
    finishQuit: (exitCode: number) => void,
    reportFailure: () => void,
  ) {
    this.createWindow = createWindow;
    this.services = services;
    this.finishQuit = finishQuit;
    this.reportFailure = reportFailure;
  }

  get quitting(): boolean { return this.stopped; }

  async dispatch(command: ShellCommand): Promise<void> {
    if (command === 'quit') return this.quit();
    if (this.stopped) return;
    this.wantsVisible = command === 'show' || !(this.creating ? this.wantsVisible : this.window?.isVisible());
    if (!this.window || this.window.isDestroyed()) {
      if (!this.creating) {
        this.creating = this.createWindow().then(window => {
          if (this.stopped) window.destroy();
          else this.window = window;
        }).catch(() => { this.reportFailure(); }).finally(() => { this.creating = undefined; });
      }
      await this.creating;
    }
    if (this.stopped || !this.window || this.window.isDestroyed()) return;
    if (this.wantsVisible) this.window.show();
    else this.window.hide();
  }

  hide(): void {
    this.wantsVisible = false;
    if (!this.window?.isDestroyed()) this.window?.hide();
  }

  quit(exitCode = 0): Promise<void> {
    this.exitCode = Math.max(this.exitCode, exitCode);
    if (this.closing) return this.closing;
    this.stopped = true;
    this.closing = this.stopServices().then(clean => {
      if (!this.window?.isDestroyed()) this.window?.destroy();
      this.finishQuit(clean ? this.exitCode : 1);
    });
    return this.closing;
  }

  private async stopServices(): Promise<boolean> {
    const pending = new Set(this.services);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = Promise.allSettled(this.services.map(async service => {
      await service.stop();
      pending.delete(service);
    }));
    await Promise.race([stopped, new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); })]);
    clearTimeout(timer);
    const terminated = Promise.allSettled([...pending].map(async service => {
      await service.terminate();
      pending.delete(service);
    }));
    await Promise.race([terminated, new Promise<void>(resolve => { timer = setTimeout(resolve, 1000); })]);
    clearTimeout(timer);
    if (pending.size) this.reportFailure();
    return pending.size === 0;
  }
}
