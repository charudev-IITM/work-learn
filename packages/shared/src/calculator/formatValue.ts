/**
 * Adaptive formatter for calculated values.
 * - Absolute values >= 10: 2 decimal places with Indian locale grouping
 * - Small values < 10: 4 decimal places (likely ratios)
 * - Zero: "0.00"
 * - Null: "—"
 */
export function formatCalcValue(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) return '0.00';
  if (abs < 10) {
    return value.toFixed(4);
  }
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
