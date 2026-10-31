/** Fit the visible view to the window while reporting its unclipped content
 * height. Measuring only the viewport-constrained outer box would prevent the
 * launcher from growing again after a short search. Values remain CSS pixels;
 * the trusted native owner applies its current zoom and work-area limits. */
export function observeShellSize(content: HTMLElement, report: (height: number) => void): () => void {
  let lastHeight = 0;
  let lastScale = 0;
  let frame = 0;
  let stopped = false;
  const measure = () => {
    frame = 0;
    if (stopped) return;
    let height = content.getBoundingClientRect().height;
    for (const scroller of content.querySelectorAll<HTMLElement>('.lc-view:not([hidden]) .lc-view-scroll, .shell-content'))
      if (scroller.getClientRects().length) height += Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const desired = Math.min(4096, Math.ceil(height));
    if (desired >= 32 && (desired !== lastHeight || window.devicePixelRatio !== lastScale)) {
      lastHeight = desired; lastScale = window.devicePixelRatio; report(desired);
    }
  };
  const schedule = () => { if (!stopped && !frame) frame = requestAnimationFrame(measure); };
  const resize = new ResizeObserver(schedule);
  const observed = new Set<Element>();
  const refresh = () => {
    const next = new Set<Element>([content]);
    for (const element of content.querySelectorAll('.lc-view:not([hidden]) .lc-view-header, .lc-view:not([hidden]) .lc-view-footer, .lc-view:not([hidden]) .lc-view-scroll, .lc-view:not([hidden]) .lc-view-scroll > *, .shell-content > *, .shell-footer, .shell-launcher > p'))
      next.add(element);
    for (const element of observed) if (!next.has(element)) { resize.unobserve(element); observed.delete(element); }
    for (const element of next) if (!observed.has(element)) { resize.observe(element); observed.add(element); }
    schedule();
  };
  const mutation = new MutationObserver(refresh);
  mutation.observe(content, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', schedule);
  refresh();
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    mutation.disconnect();
    resize.disconnect();
    window.removeEventListener('resize', schedule);
  };
}
