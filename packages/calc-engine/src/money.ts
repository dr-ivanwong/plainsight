/**
 * Money discipline (the money policy, data-model section 4): integer minor
 * units with explicit currency and scale metadata. The engine asserts safe
 * integers at its boundary; formatting is a separate, final step (see
 * format.ts).
 */
import type { Scale } from './types.js';

/** Minor units in one unit at each entry scale (the rounding-tolerance policy's scaleUnit). */
const SCALE_UNIT_MINOR: Readonly<Record<Scale, number>> = {
  ones: 100,
  thousands: 100_000,
  millions: 100_000_000,
  billions: 100_000_000_000
};

export function scaleUnitMinor(scale: Scale): number {
  return SCALE_UNIT_MINOR[scale];
}

/**
 * Boundary assertion from spec section 3: NaN and Infinity are unrepresentable
 * in storage, and every amount the engine reads must be a safe integer.
 */
export function assertSafeInteger(value: number, context: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${context}: expected a safe integer amount, got ${value}`);
  }
  return value;
}
