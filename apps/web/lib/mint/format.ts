/** Exact decimal formatting: never round a native-currency amount through Number. */
export function formatWei(value: string | bigint, decimals = 18): string {
  const amount = BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const fraction = (amount % divisor)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${amount / divisor}${fraction ? `.${fraction}` : ""}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function roundLabel(value: string): string {
  return value.padStart(3, "0");
}

export function formatDuration(seconds: number): string {
  for (const [unit, size] of [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ] as const) {
    if (seconds % size === 0) {
      const amount = seconds / size;
      return `${formatCount(amount)} ${unit}${amount === 1 ? "" : "s"}`;
    }
  }
  return `${formatCount(seconds)} seconds`;
}

/** Stable UTC copy across server and browser ICU versions (Safari uses a different date separator). */
export function formatUtcDateTime(value: string): string {
  const date = new Date(value);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hour = date.getUTCHours();
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${hour % 12 || 12}:${String(date.getUTCMinutes()).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}
