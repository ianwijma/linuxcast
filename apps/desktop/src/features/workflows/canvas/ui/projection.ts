/**
 * UI-only canvas projection (presentation, never persisted).
 *
 * Node cards use rem tokens (208 px at 100% root text), so they grow with text size, while persisted
 * `editor.positions` are numeric flow units laid out by the controller with a fixed horizontal step.
 * The canvas therefore renders every stored position multiplied by one measured factor `f` and maps
 * pointer/keyboard moves back with the exact inverse. Persisted positions, viewport, undo history and
 * the execution graph are never rewritten by a text-size change: only an explicit user move writes.
 *
 * `f` is chosen so one controller step fits a measured card plus a measured typed-edge label slot,
 * which keeps default layouts free of card/label collisions at any root text size. Native (CSS pixel)
 * zoom scales cards and coordinates together, so it leaves `f` unchanged.
 */
export type Point = { x: number; y: number };

/** Horizontal step the controller uses for new nodes (`x: index * 240`, flow units). Read-only mirror. */
export const CONTROLLER_LAYOUT_STEP = 240;

export function projectionFactor(cardWidth: number, labelSlotWidth: number): number {
  if (!Number.isFinite(cardWidth) || cardWidth <= 0) return 1;
  const slot = Number.isFinite(labelSlotWidth) && labelSlotWidth > 0 ? labelSlotWidth : 0;
  return Math.max(1, (cardWidth + slot) / CONTROLLER_LAYOUT_STEP);
}
export const toDisplay = (point: Point, factor: number): Point => ({ x: point.x * factor, y: point.y * factor });
export const toStored = (point: Point, factor: number): Point => ({ x: point.x / factor, y: point.y / factor });
