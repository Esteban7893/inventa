import { describe, expect, it } from "vitest";
import { formatCents, formatEurosInput, parseEuros } from "@/lib/domain/money";

const NBSP = " ";

describe("formatCents", () => {
  it("formatea cero", () => {
    expect(formatCents(0)).toBe(`0,00${NBSP}€`);
  });

  it("formatea céntimos sueltos", () => {
    expect(formatCents(5)).toBe(`0,05${NBSP}€`);
  });

  it("formatea un importe con decimales", () => {
    expect(formatCents(1250)).toBe(`12,50${NBSP}€`);
  });

  it("no agrupa los miles con cuatro cifras (norma es-ES)", () => {
    expect(formatCents(123456)).toBe(`1234,56${NBSP}€`);
  });

  it("agrupa los miles a partir de cinco cifras", () => {
    expect(formatCents(1234567)).toBe(`12.345,67${NBSP}€`);
    expect(formatCents(123456789)).toBe(`1.234.567,89${NBSP}€`);
  });

  it("formatea importes negativos", () => {
    expect(formatCents(-1250)).toBe(`-12,50${NBSP}€`);
  });

  it("rechaza valores que no son céntimos enteros", () => {
    expect(() => formatCents(12.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
    expect(() => formatCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("parseEuros", () => {
  it("convierte un importe con coma decimal", () => {
    expect(parseEuros("12,50")).toBe(1250);
  });

  it("convierte un importe sin decimales", () => {
    expect(parseEuros("12")).toBe(1200);
  });

  it("completa un solo decimal", () => {
    expect(parseEuros("12,5")).toBe(1250);
  });

  it("convierte céntimos sueltos y cero", () => {
    expect(parseEuros("0,05")).toBe(5);
    expect(parseEuros("0")).toBe(0);
    expect(parseEuros("0,00")).toBe(0);
  });

  it("no pierde precisión con decimales problemáticos en coma flotante", () => {
    expect(parseEuros("1,15")).toBe(115);
    expect(parseEuros("0,29")).toBe(29);
    expect(parseEuros("19,99")).toBe(1999);
  });

  it("acepta el punto como separador de miles", () => {
    expect(parseEuros("1.234,56")).toBe(123456);
    expect(parseEuros("1.234")).toBe(123400);
    expect(parseEuros("1.234.567")).toBe(123456700);
    expect(parseEuros("12.505")).toBe(1250500);
  });

  it("acepta el punto como separador decimal si no puede ser de miles", () => {
    expect(parseEuros("12.50")).toBe(1250);
    expect(parseEuros("12.5")).toBe(1250);
  });

  it("ignora espacios y el símbolo del euro", () => {
    expect(parseEuros("  12,50 € ")).toBe(1250);
    expect(parseEuros(`12,50${NBSP}€`)).toBe(1250);
    expect(parseEuros("€12,50")).toBe(1250);
  });

  it("devuelve null si está vacío", () => {
    expect(parseEuros("")).toBeNull();
    expect(parseEuros("   ")).toBeNull();
    expect(parseEuros("€")).toBeNull();
  });

  it("devuelve null con importes negativos", () => {
    expect(parseEuros("-5")).toBeNull();
    expect(parseEuros("-12,50")).toBeNull();
  });

  it("devuelve null con más de dos decimales", () => {
    expect(parseEuros("12,345")).toBeNull();
    expect(parseEuros("12.5050")).toBeNull();
  });

  it("devuelve null con textos que no son importes", () => {
    expect(parseEuros("abc")).toBeNull();
    expect(parseEuros("12,50,1")).toBeNull();
    expect(parseEuros(",50")).toBeNull();
    expect(parseEuros("12,")).toBeNull();
    expect(parseEuros("1e3")).toBeNull();
    expect(parseEuros("12 50")).toBeNull();
    expect(parseEuros("1.23.456")).toBeNull();
  });

  it("devuelve null si el importe es demasiado grande", () => {
    expect(parseEuros("99999999999999999999")).toBeNull();
  });
});

describe("formatEurosInput", () => {
  it("escribe el importe con coma decimal y sin símbolo, listo para un campo", () => {
    expect(formatEurosInput(1250)).toBe("12,50");
    expect(formatEurosInput(1200)).toBe("12,00");
  });

  it("escribe cero y céntimos sueltos", () => {
    expect(formatEurosInput(0)).toBe("0,00");
    expect(formatEurosInput(5)).toBe("0,05");
    expect(formatEurosInput(99)).toBe("0,99");
  });

  it("no agrupa los miles", () => {
    expect(formatEurosInput(123456)).toBe("1234,56");
    expect(formatEurosInput(2147483647)).toBe("21474836,47");
  });

  it("vuelve a dar los mismos céntimos al leerlo con parseEuros", () => {
    for (const cents of [0, 5, 99, 100, 1250, 123456, 2147483647]) {
      expect(parseEuros(formatEurosInput(cents))).toBe(cents);
    }
  });

  it("rechaza importes negativos o que no son céntimos enteros", () => {
    expect(() => formatEurosInput(-1)).toThrow(RangeError);
    expect(() => formatEurosInput(12.5)).toThrow(RangeError);
    expect(() => formatEurosInput(Number.NaN)).toThrow(RangeError);
  });
});
