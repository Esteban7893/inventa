import { describe, expect, it } from "vitest";
import {
  isOrderStatus,
  lineSubtotal,
  MAX_LINE_QUANTITY,
  orderReference,
  orderTotal,
  parseOrderStatus,
  parseQuantity,
  validateLines,
} from "@/lib/domain/order";

const CAFE = "0b6f4c1e-8a52-4d0e-9a4b-1f2c3d4e5f60";
const TAZA = "7a1d2e3f-4b5c-4d6e-8f70-81920a1b2c3d";
const TE = "c3d4e5f6-0718-4293-a4b5-c6d7e8f90a1b";

describe("lineSubtotal", () => {
  it("multiplica la cantidad por el precio unitario en céntimos", () => {
    expect(lineSubtotal({ cantidad: 3, precio_unit_cents: 2450 })).toBe(7350);
    expect(lineSubtotal({ cantidad: 1, precio_unit_cents: 690 })).toBe(690);
  });

  it("vale cero si el precio es cero", () => {
    expect(lineSubtotal({ cantidad: 5, precio_unit_cents: 0 })).toBe(0);
  });

  it("rechaza cantidades que no son enteros mayores que cero", () => {
    expect(() => lineSubtotal({ cantidad: 0, precio_unit_cents: 100 })).toThrow(RangeError);
    expect(() => lineSubtotal({ cantidad: -1, precio_unit_cents: 100 })).toThrow(RangeError);
    expect(() => lineSubtotal({ cantidad: 1.5, precio_unit_cents: 100 })).toThrow(RangeError);
    expect(() => lineSubtotal({ cantidad: Number.NaN, precio_unit_cents: 100 })).toThrow(RangeError);
  });

  it("rechaza precios negativos o con decimales", () => {
    expect(() => lineSubtotal({ cantidad: 1, precio_unit_cents: -1 })).toThrow(RangeError);
    expect(() => lineSubtotal({ cantidad: 1, precio_unit_cents: 12.5 })).toThrow(RangeError);
  });

  it("rechaza un subtotal que no cabe en un entero seguro", () => {
    expect(() => lineSubtotal({ cantidad: Number.MAX_SAFE_INTEGER, precio_unit_cents: 2 })).toThrow(RangeError);
  });
});

describe("orderTotal", () => {
  it("suma los subtotales de todas las líneas", () => {
    expect(
      orderTotal([
        { cantidad: 6, precio_unit_cents: 2450 },
        { cantidad: 4, precio_unit_cents: 690 },
      ]),
    ).toBe(17460);
  });

  it("vale cero sin líneas", () => {
    expect(orderTotal([])).toBe(0);
  });

  it("vale cero si todas las líneas tienen precio cero", () => {
    expect(orderTotal([{ cantidad: 2, precio_unit_cents: 0 }])).toBe(0);
  });

  it("rechaza líneas con cantidad cero, negativa o con decimales", () => {
    expect(() => orderTotal([{ cantidad: 0, precio_unit_cents: 950 }])).toThrow(RangeError);
    expect(() => orderTotal([{ cantidad: -2, precio_unit_cents: 950 }])).toThrow(RangeError);
    expect(() => orderTotal([{ cantidad: 0.5, precio_unit_cents: 950 }])).toThrow(RangeError);
  });

  it("rechaza precios negativos", () => {
    expect(() => orderTotal([{ cantidad: 1, precio_unit_cents: -950 }])).toThrow(RangeError);
  });

  it("rechaza un total que no cabe en un entero seguro", () => {
    const huge = { cantidad: 1_000_000_000, precio_unit_cents: 9_000_000 };
    expect(() => orderTotal([huge, huge])).toThrow(RangeError);
  });
});

describe("parseQuantity", () => {
  it("lee un entero escrito como texto", () => {
    expect(parseQuantity("3")).toBe(3);
    expect(parseQuantity(" 12 ")).toBe(12);
    expect(parseQuantity("007")).toBe(7);
  });

  it("lee el cero (validateLines lo rechaza después)", () => {
    expect(parseQuantity("0")).toBe(0);
  });

  it("devuelve NaN si está vacío o no es un entero sin signo", () => {
    expect(parseQuantity("")).toBeNaN();
    expect(parseQuantity("   ")).toBeNaN();
    expect(parseQuantity("-1")).toBeNaN();
    expect(parseQuantity("1,5")).toBeNaN();
    expect(parseQuantity("1.5")).toBeNaN();
    expect(parseQuantity("1e3")).toBeNaN();
    expect(parseQuantity("dos")).toBeNaN();
  });

  it("devuelve NaN si el número no cabe en un entero seguro", () => {
    expect(parseQuantity("99999999999999999999")).toBeNaN();
  });
});

describe("validateLines", () => {
  it("acepta líneas válidas y las devuelve tal como las recibe crear_pedido", () => {
    expect(
      validateLines([
        { producto_id: CAFE, cantidad: 2 },
        { producto_id: TAZA, cantidad: 1 },
      ]),
    ).toEqual({
      ok: true,
      lines: [
        { producto_id: CAFE, cantidad: 2 },
        { producto_id: TAZA, cantidad: 1 },
      ],
    });
  });

  it("exige al menos una línea", () => {
    expect(validateLines([])).toEqual({
      ok: false,
      error: "Añade al menos una línea al pedido.",
      lineErrors: [],
    });
  });

  it("exige elegir el producto de cada línea", () => {
    const result = validateLines([
      { producto_id: CAFE, cantidad: 1 },
      { producto_id: "", cantidad: 1 },
    ]);
    expect(result).toEqual({
      ok: false,
      error: "Revisa las líneas marcadas.",
      lineErrors: [{}, { producto_id: "Elige un producto." }],
    });
  });

  it("rechaza cantidades cero, negativas, con decimales o vacías", () => {
    const message = "La cantidad tiene que ser un número entero mayor que cero.";
    for (const cantidad of [0, -1, 1.5, Number.NaN]) {
      const result = validateLines([{ producto_id: CAFE, cantidad }]);
      expect(result).toEqual({ ok: false, error: "Revisa las líneas marcadas.", lineErrors: [{ cantidad: message }] });
    }
  });

  it("rechaza cantidades por encima del máximo", () => {
    expect(validateLines([{ producto_id: CAFE, cantidad: MAX_LINE_QUANTITY }]).ok).toBe(true);
    expect(validateLines([{ producto_id: CAFE, cantidad: MAX_LINE_QUANTITY + 1 }])).toEqual({
      ok: false,
      error: "Revisa las líneas marcadas.",
      lineErrors: [{ cantidad: "La cantidad no puede ser mayor de 1.000.000.000." }],
    });
  });

  it("rechaza un producto repetido y marca la línea que lo repite", () => {
    const result = validateLines([
      { producto_id: CAFE, cantidad: 1 },
      { producto_id: TAZA, cantidad: 1 },
      { producto_id: CAFE, cantidad: 3 },
    ]);
    expect(result).toEqual({
      ok: false,
      error: "Revisa las líneas marcadas.",
      lineErrors: [
        {},
        {},
        { producto_id: "Este producto ya está en la línea 1. Junta las cantidades en una sola línea." },
      ],
    });
  });

  it("marca cada repetición, no solo la primera", () => {
    const result = validateLines([
      { producto_id: TE, cantidad: 1 },
      { producto_id: TE, cantidad: 1 },
      { producto_id: TE, cantidad: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.lineErrors.map((line) => Boolean(line.producto_id))).toEqual([false, true, true]);
    }
  });

  it("no cuenta como repetidas dos líneas sin producto", () => {
    const result = validateLines([
      { producto_id: "", cantidad: 1 },
      { producto_id: "", cantidad: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.lineErrors).toEqual([{ producto_id: "Elige un producto." }, { producto_id: "Elige un producto." }]);
    }
  });

  it("devuelve a la vez el error de producto y el de cantidad de una línea", () => {
    const result = validateLines([{ producto_id: "", cantidad: 0 }]);
    expect(result).toEqual({
      ok: false,
      error: "Revisa las líneas marcadas.",
      lineErrors: [
        {
          producto_id: "Elige un producto.",
          cantidad: "La cantidad tiene que ser un número entero mayor que cero.",
        },
      ],
    });
  });
});

describe("orderReference", () => {
  it("usa los primeros 8 caracteres del id en mayúsculas", () => {
    expect(orderReference("3f2a9c1b-0d4e-4f5a-8b6c-7d8e9f0a1b2c")).toBe("Nº 3F2A9C1B");
  });

  it("rechaza un id demasiado corto", () => {
    expect(() => orderReference("")).toThrow(RangeError);
    expect(() => orderReference("abc")).toThrow(RangeError);
  });
});

describe("isOrderStatus", () => {
  it("reconoce los tres estados válidos", () => {
    expect(isOrderStatus("pendiente")).toBe(true);
    expect(isOrderStatus("enviado")).toBe(true);
    expect(isOrderStatus("cancelado")).toBe(true);
  });

  it("rechaza cadenas desconocidas, vacías o con mayúsculas", () => {
    expect(isOrderStatus("")).toBe(false);
    expect(isOrderStatus("PENDIENTE")).toBe(false);
    expect(isOrderStatus(" pendiente ")).toBe(false);
    expect(isOrderStatus("borrador")).toBe(false);
    expect(isOrderStatus(null)).toBe(false);
    expect(isOrderStatus(undefined)).toBe(false);
    expect(isOrderStatus(0)).toBe(false);
  });
});

describe("parseOrderStatus", () => {
  it("devuelve el estado cuando es válido", () => {
    expect(parseOrderStatus("pendiente")).toBe("pendiente");
    expect(parseOrderStatus("enviado")).toBe("enviado");
    expect(parseOrderStatus("cancelado")).toBe("cancelado");
  });

  it("lanza RangeError si el estado no está reconocido", () => {
    expect(() => parseOrderStatus("")).toThrow(RangeError);
    expect(() => parseOrderStatus("PENDIENTE")).toThrow(RangeError);
    expect(() => parseOrderStatus("otro")).toThrow(RangeError);
  });
});
