export interface CheckoutLine {
  unitPriceCents: number;
  quantity: number;
}

export function calculateSubtotal(lines: readonly CheckoutLine[]): number {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );
  if (
    !Number.isSafeInteger(subtotal) ||
    subtotal < 0 ||
    subtotal > 2_147_483_647
  ) {
    throw new RangeError('invalid_order_total');
  }
  return subtotal;
}
