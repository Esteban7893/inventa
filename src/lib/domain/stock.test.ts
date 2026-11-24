import { describe, expect, it } from "vitest";
import { isLowStock } from "@/lib/domain/stock";

/**
 * Regla: un producto está "bajo mínimo" cuando su stock es menor **o igual** que su stock
 * mínimo. Llegar justo al mínimo ya cuenta como bajo: es el momento de reponer.
 */
describe("isLowStock", () => {
  it("no marca un producto con stock por encima del mínimo", () => {
    expect(isLowStock(40, 10)).toBe(false);
    expect(isLowStock(11, 10)).toBe(false);
  });

  it("marca un producto con stock por debajo del mínimo", () => {
    expect(isLowStock(9, 10)).toBe(true);
    expect(isLowStock(1, 10)).toBe(true);
  });

  it("marca un producto con el stock justo en el mínimo (igual cuenta como bajo)", () => {
    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(1, 1)).toBe(true);
  });

  it("marca un producto agotado aunque su mínimo sea cero", () => {
    expect(isLowStock(0, 0)).toBe(true);
    expect(isLowStock(0, 5)).toBe(true);
  });

  it("no marca un producto con existencias y mínimo cero", () => {
    expect(isLowStock(1, 0)).toBe(false);
  });

  it("rechaza stock o mínimo negativos", () => {
    expect(() => isLowStock(-1, 5)).toThrow(RangeError);
    expect(() => isLowStock(5, -1)).toThrow(RangeError);
  });

  it("rechaza valores que no son enteros", () => {
    expect(() => isLowStock(1.5, 1)).toThrow(RangeError);
    expect(() => isLowStock(1, Number.NaN)).toThrow(RangeError);
    expect(() => isLowStock(Number.POSITIVE_INFINITY, 1)).toThrow(RangeError);
  });
});
