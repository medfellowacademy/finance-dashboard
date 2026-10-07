/** Money is stored as integer paise. */
export const toPaise = (rupees: string | number): number =>
  Math.round(Number(rupees) * 100);

export const formatINR = (paise: number | null | undefined): string =>
  paise == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
