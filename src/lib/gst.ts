/** Splits a gross/net amount into taxable value and GST (all in paise). */
export function computeGst(amount: number, rate: number, inclusive: boolean) {
  if (inclusive) {
    const taxable = Math.round((amount * 100) / (100 + rate));
    return { taxable, gst: amount - taxable, total: amount };
  }
  const gst = Math.round((amount * rate) / 100);
  return { taxable: amount, gst, total: amount + gst };
}
