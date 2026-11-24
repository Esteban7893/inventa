function assertQuantity(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} tiene que ser un número entero igual o mayor que cero.`);
  }
}

/**
 * Indica si un producto está bajo mínimo: su stock es menor **o igual** que el stock mínimo.
 * Llegar justo al mínimo ya cuenta como bajo (hay que reponer), y un producto agotado
 * siempre está bajo mínimo, aunque su mínimo sea cero.
 */
export function isLowStock(stock: number, stockMinimo: number): boolean {
  assertQuantity(stock, "El stock");
  assertQuantity(stockMinimo, "El stock mínimo");
  return stock <= stockMinimo;
}
