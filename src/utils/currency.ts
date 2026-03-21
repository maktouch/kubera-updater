export function parseCurrencyValue(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, "");

  if (!cleaned) {
    throw new Error(`Unable to parse currency value from "${raw}"`);
  }

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    const decimalSeparator = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    const normalized = cleaned.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
    return Number(normalized);
  }

  if (hasComma) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      return Number(cleaned.replace(",", "."));
    }

    return Number(cleaned.split(",").join(""));
  }

  return Number(cleaned);
}
