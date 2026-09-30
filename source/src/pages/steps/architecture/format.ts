/** Formatting helpers for formulas, where rounding must not hide the arithmetic. */

/** GB value with sensible precision (1 decimal under 100, whole numbers above). */
export const gb = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) < 100 ? 1 : 0 });

/** Multiplier such as 1.25 → "1.25". */
export const mult = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const pct = (n: number) => `${Math.round(n)}%`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
