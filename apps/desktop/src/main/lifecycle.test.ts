import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResidentLifecycle } from './lifecycle.ts';
import type { ResidentWindow } from './lifecycle.ts';

function windowFixture() {
  let visible = false, destroyed = false;
  return {
    isVisible: () => visible, isDestroyed: () => destroyed,
    show: vi.fn(() => { visible = true; }), hide: vi.fn(() => { visible = false; }),
    destroy: vi.fn(() => { destroyed = true; visible = false; }),
  };
}
function deferredWindow() {
  let resolve!: (window: ResidentWindow) => void;
  const promise = new Promise<ResidentWindow>(done => { resolve = done; });
  return { resolve, promise };
}
afterEach(() => vi.useRealTimers());
describe('resident window and service ownership', () => {
  it('reuses one window, toggles visibility and keeps services alive while hidden', async () => {
    const window = windowFixture(), create = vi.fn(async () => window);
    const service = { stop: vi.fn(async () => {}), terminate: vi.fn(async () => {}) };
    const quit = vi.fn(), failure = vi.fn();
    const lifecycle = new ResidentLifecycle(create, [service], quit, failure);
    await lifecycle.dispatch('toggle'); expect(window.isVisible()).toBe(true);
    await lifecycle.dispatch('toggle'); expect(window.isVisible()).toBe(false);
    await lifecycle.dispatch('show'); lifecycle.hide(); expect(window.isVisible()).toBe(false);
    expect(create).toHaveBeenCalledTimes(1); expect(service.stop).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled(); expect(failure).not.toHaveBeenCalled();
  });
  it('preserves two invocations received before loading completes', async () => {
    const window = windowFixture();
    const deferred = deferredWindow();
    const create = vi.fn(() => deferred.promise);
    const lifecycle = new ResidentLifecycle(create, [], vi.fn(), vi.fn());
    const first = lifecycle.dispatch('toggle'), second = lifecycle.dispatch('toggle');
    expect(create).toHaveBeenCalledTimes(1);
    deferred.resolve(window); await Promise.all([first, second]);
    expect(window.isVisible()).toBe(false); expect(window.show).not.toHaveBeenCalled();
  });
  it('recreates a destroyed renderer only on a new request', async () => {
    const first = windowFixture(), second = windowFixture();
    const create = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const lifecycle = new ResidentLifecycle(create, [], vi.fn(), vi.fn());
    await lifecycle.dispatch('show'); first.destroy();
    expect(create).toHaveBeenCalledTimes(1);
    await lifecycle.dispatch('show'); expect(second.isVisible()).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
  });
  it('reports a fixed creation failure and permits an explicit recovery', async () => {
    const window = windowFixture(), failure = vi.fn();
    const create = vi.fn().mockRejectedValueOnce(new Error('SYNTHETIC_PRIVATE')).mockResolvedValueOnce(window);
    const lifecycle = new ResidentLifecycle(create, [], vi.fn(), failure);
    await lifecycle.dispatch('show'); expect(failure).toHaveBeenCalledWith();
    await lifecycle.dispatch('show'); expect(window.isVisible()).toBe(true);
  });
  it('stops services exactly once before destroying windows and quitting', async () => {
    const window = windowFixture(), order: string[] = [];
    const service = { stop: vi.fn(async () => { order.push('stop'); }), terminate: vi.fn(async () => {}) };
    const lifecycle = new ResidentLifecycle(async () => window, [service], () => order.push('quit'), vi.fn());
    await lifecycle.dispatch('show');
    await Promise.all([lifecycle.quit(), lifecycle.quit(), lifecycle.dispatch('show')]);
    expect(order).toEqual(['stop', 'quit']); expect(window.isDestroyed()).toBe(true);
    expect(service.stop).toHaveBeenCalledTimes(1); expect(service.terminate).not.toHaveBeenCalled();
  });
  it('bounds unresponsive services and terminates rejected ones without logging content', async () => {
    vi.useFakeTimers();
    const service = { stop: vi.fn(() => new Promise<void>(() => {})), terminate: vi.fn(async () => {}) };
    const failed = { stop: vi.fn(async () => { throw new Error('SYNTHETIC_PRIVATE'); }), terminate: vi.fn(async () => {}) };
    const quit = vi.fn();
    const lifecycle = new ResidentLifecycle(async () => windowFixture(), [service, failed], quit, vi.fn());
    const stopping = lifecycle.quit(); await vi.advanceTimersByTimeAsync(4999);
    expect(quit).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1); await stopping;
    expect(service.terminate).toHaveBeenCalledTimes(1); expect(failed.terminate).toHaveBeenCalledTimes(1);
    expect(quit).toHaveBeenCalledTimes(1);
  });
  it('does not reveal a window whose creation finishes after Quit', async () => {
    const window = windowFixture(), deferred = deferredWindow();
    const lifecycle = new ResidentLifecycle(() => deferred.promise, [], vi.fn(), vi.fn());
    const opening = lifecycle.dispatch('show'); await lifecycle.quit();
    deferred.resolve(window); await opening;
    expect(window.isDestroyed()).toBe(true); expect(window.show).not.toHaveBeenCalled();
  });
  it('reports failed termination honestly with nonzero exit status', async () => {
    vi.useFakeTimers();
    const service = { stop: vi.fn(async () => { throw new Error('stop'); }),
      terminate: vi.fn(() => new Promise<void>(() => {})) };
    const quit = vi.fn(), failed = vi.fn();
    const lifecycle = new ResidentLifecycle(async () => windowFixture(), [service], quit, failed);
    const stopping = lifecycle.quit(); await vi.advanceTimersByTimeAsync(1000); await stopping;
    expect(quit).toHaveBeenCalledWith(1); expect(failed).toHaveBeenCalledWith();
  });
});
