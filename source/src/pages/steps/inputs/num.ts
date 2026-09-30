/** Clamp a NumberField value; NumberField reports NaN when the input is cleared. */
export const clampNum = (v: number, min: number, max: number, fallback: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
