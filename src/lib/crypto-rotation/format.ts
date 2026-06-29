/** Strip quote currency suffix (e.g., "-USD", "-USDT") from crypto symbols. */
export function baseSymbol(sym: string): string {
  return sym.replace(/-USD[T]?$/, "");
}
