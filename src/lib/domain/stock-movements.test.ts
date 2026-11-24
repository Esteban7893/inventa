import { describe, expect, it } from "vitest";
import {
  MOVEMENT_PAGE_SIZE,
  formatStockDelta,
  isMovementReason,
  movementReasonLabel,
  parseMovementReason,
} from "@/lib/domain/stock-movements";

describe("isMovementReason", () => {
  it("acepta los tres motivos de la base de datos", () => {
    expect(isMovementReason("pedido")).toBe(true);
    expect(isMovementReason("cancelacion")).toBe(true);
    expect(isMovementReason("ajuste")).toBe(true);
  });

  it("rechaza cualquier otro valor", () => {
    for (const value of ["", "Pedido", "cancelación", "otro", " ajuste", null, undefined, 1, {}]) {
      expect(isMovementReason(value)).toBe(false);
    }
  });
});

describe("parseMovementReason", () => {
  it("devuelve el motivo si es válido", () => {
    expect(parseMovementReason("cancelacion")).toBe("cancelacion");
  });

  it("lanza un error con un motivo desconocido", () => {
    expect(() => parseMovementReason("devolucion")).toThrow(RangeError);
    expect(() => parseMovementReason("")).toThrow(RangeError);
  });
});

describe("movementReasonLabel", () => {
  it("traduce cada motivo al español", () => {
    expect(movementReasonLabel("pedido")).toBe("Pedido");
    expect(movementReasonLabel("cancelacion")).toBe("Cancelación");
    expect(movementReasonLabel("ajuste")).toBe("Ajuste");
  });
});

describe("formatStockDelta", () => {
  it("pone el signo más a las entradas", () => {
    expect(formatStockDelta(1)).toBe("+1");
    expect(formatStockDelta(40)).toBe("+40");
  });

  it("pone el signo menos tipográfico a las salidas", () => {
    expect(formatStockDelta(-1)).toBe("\u22121");
    expect(formatStockDelta(-250)).toBe("\u2212250");
  });

  it("no agrupa los miles (como el resto de cantidades de la app)", () => {
    expect(formatStockDelta(12345)).toBe("+12345");
    expect(formatStockDelta(-2147483647)).toBe("\u22122147483647");
  });

  it("rechaza cero y lo que no es un entero", () => {
    for (const value of [0, -0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
      expect(() => formatStockDelta(value)).toThrow(RangeError);
    }
  });
});

describe("MOVEMENT_PAGE_SIZE", () => {
  it("es un entero positivo pequeño (la ficha muestra una página con límite)", () => {
    expect(Number.isSafeInteger(MOVEMENT_PAGE_SIZE)).toBe(true);
    expect(MOVEMENT_PAGE_SIZE).toBeGreaterThan(0);
    expect(MOVEMENT_PAGE_SIZE).toBeLessThanOrEqual(50);
  });
});
