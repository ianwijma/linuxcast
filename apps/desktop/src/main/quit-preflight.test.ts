import { afterEach,expect,it,vi } from 'vitest';
import { createQuitRequest } from './quit-preflight.ts';
afterEach(()=>vi.useRealTimers());
it('never begins timed teardown while an editor close/flush response is pending, and preserves cancelled drafts',async()=>{
  vi.useFakeTimers();let resolve!:(value:boolean)=>void;const prepare=vi.fn(()=>new Promise<boolean>(done=>{resolve=done;})),quit=vi.fn(async()=>{}),request=createQuitRequest(prepare,quit);
  const pending=request();expect(request()).toBe(pending);await vi.advanceTimersByTimeAsync(15000);expect(quit).not.toHaveBeenCalled();expect(prepare).toHaveBeenCalledTimes(1);
  resolve(false);expect(await pending).toBe(false);expect(quit).not.toHaveBeenCalled();
  const retry=request();expect(prepare).toHaveBeenCalledTimes(2);resolve(true);expect(await retry).toBe(true);expect(quit).toHaveBeenCalledTimes(1);
});
it('keeps the app alive after a failed close preflight and allows a new explicit request',async()=>{
  const prepare=vi.fn(async()=>true).mockRejectedValueOnce(new Error('Draft unavailable.')),quit=vi.fn(async()=>{}),request=createQuitRequest(prepare,quit);
  expect(await request()).toBe(false);expect(quit).not.toHaveBeenCalled();expect(await request()).toBe(true);expect(quit).toHaveBeenCalledTimes(1);
});
