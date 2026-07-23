import type { TypedValueJSON } from "@invaro/opentax-core";

/** "396150" (cents) -> "$3,961.50"; negatives -> "-$…". */
export function formatMoney(cents: string | bigint): string {
  let n = typeof cents === "bigint" ? cents : BigInt(cents);
  const sign = n < 0n ? "-" : "";
  if (n < 0n) n = -n;
  const dollars = n / 100n;
  const rem = (n % 100n).toString().padStart(2, "0");
  const grouped = dollars
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}.${rem}`;
}

export function formatValue(tv: TypedValueJSON): string {
  switch (tv.type) {
    case "money":
      return formatMoney(tv.value as string);
    case "int":
      return String(tv.value);
    case "bool":
      return tv.value ? "true" : "false";
    case "enum":
      return String(tv.value);
  }
}

/** Like formatValue, but negative money is annotated as a refund. */
export function formatAnswer(tv: TypedValueJSON): string {
  if (tv.type === "money" && BigInt(tv.value as string) < 0n) {
    return `${formatMoney(tv.value as string)} (refund)`;
  }
  return formatValue(tv);
}
