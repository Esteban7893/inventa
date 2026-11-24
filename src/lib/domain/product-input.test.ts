import { describe, expect, it } from "vitest";
import { z } from "zod";
import { productInputSchema } from "@/lib/domain/product-input";

const VALID = {
  nombre: "Taza esmaltada blanca",
  sku: "TAZ-ESM-BL",
  precio: "9,50",
  stock: "12",
  stock_minimo: "6",
};

function errorsOf(input: Record<string, unknown>): Record<string, string[] | undefined> {
  const result = productInputSchema.safeParse(input);
  if (result.success) {
    throw new Error("Se esperaba un error de validación");
  }
  return z.flattenError(result.error).fieldErrors;
}

describe("productInputSchema", () => {
  it("convierte un producto válido a las columnas de la tabla, con el precio en céntimos", () => {
    expect(productInputSchema.parse(VALID)).toEqual({
      nombre: "Taza esmaltada blanca",
      sku: "TAZ-ESM-BL",
      precio_cents: 950,
      stock: 12,
      stock_minimo: 6,
    });
  });

  it("quita los espacios de alrededor", () => {
    const data = productInputSchema.parse({ ...VALID, nombre: "  Taza  ", sku: " TAZ-1 ", stock: " 3 " });
    expect(data.nombre).toBe("Taza");
    expect(data.sku).toBe("TAZ-1");
    expect(data.stock).toBe(3);
  });

  it("guarda el SKU vacío o ausente como null", () => {
    expect(productInputSchema.parse({ ...VALID, sku: "" }).sku).toBeNull();
    expect(productInputSchema.parse({ ...VALID, sku: "   " }).sku).toBeNull();
    expect(productInputSchema.parse({ ...VALID, sku: undefined }).sku).toBeNull();
  });

  it("acepta precio, stock y mínimo a cero", () => {
    const data = productInputSchema.parse({ ...VALID, precio: "0", stock: "0", stock_minimo: "0" });
    expect(data).toMatchObject({ precio_cents: 0, stock: 0, stock_minimo: 0 });
  });

  it("acepta el precio en los formatos de parseEuros", () => {
    expect(productInputSchema.parse({ ...VALID, precio: "1.234,56" }).precio_cents).toBe(123456);
    expect(productInputSchema.parse({ ...VALID, precio: "12,5 €" }).precio_cents).toBe(1250);
  });

  it("exige el nombre", () => {
    expect(errorsOf({ ...VALID, nombre: "" }).nombre).toEqual(["Escribe el nombre del producto."]);
    expect(errorsOf({ ...VALID, nombre: "   " }).nombre).toEqual(["Escribe el nombre del producto."]);
    expect(errorsOf({ ...VALID, nombre: undefined }).nombre).toEqual(["Escribe el nombre del producto."]);
  });

  it("limita la longitud del nombre y del SKU", () => {
    expect(errorsOf({ ...VALID, nombre: "a".repeat(121) }).nombre).toEqual([
      "El nombre no puede tener más de 120 caracteres.",
    ]);
    expect(errorsOf({ ...VALID, sku: "A".repeat(41) }).sku).toEqual([
      "El SKU no puede tener más de 40 caracteres.",
    ]);
  });

  it("exige el precio", () => {
    expect(errorsOf({ ...VALID, precio: "" }).precio).toEqual(["Escribe el precio."]);
    expect(errorsOf({ ...VALID, precio: undefined }).precio).toEqual(["Escribe el precio."]);
  });

  it("rechaza precios negativos", () => {
    expect(errorsOf({ ...VALID, precio: "-5" }).precio).toEqual(["El precio no puede ser negativo."]);
    expect(errorsOf({ ...VALID, precio: "-12,50" }).precio).toEqual(["El precio no puede ser negativo."]);
  });

  it("rechaza precios mal escritos", () => {
    const message = ["Escribe un precio válido, por ejemplo 12,50."];
    expect(errorsOf({ ...VALID, precio: "abc" }).precio).toEqual(message);
    expect(errorsOf({ ...VALID, precio: "12,345" }).precio).toEqual(message);
    expect(errorsOf({ ...VALID, precio: "1e3" }).precio).toEqual(message);
  });

  it("rechaza precios por encima del máximo", () => {
    expect(productInputSchema.parse({ ...VALID, precio: "1.000.000" }).precio_cents).toBe(100_000_000);
    expect(errorsOf({ ...VALID, precio: "1.000.000,01" }).precio).toEqual([
      "El precio no puede ser mayor de 1.000.000,00 €.",
    ]);
  });

  it("exige stock y mínimo", () => {
    expect(errorsOf({ ...VALID, stock: "" }).stock).toEqual(["Escribe el stock."]);
    expect(errorsOf({ ...VALID, stock_minimo: undefined }).stock_minimo).toEqual([
      "Escribe el stock mínimo.",
    ]);
  });

  it("rechaza stock y mínimo negativos", () => {
    expect(errorsOf({ ...VALID, stock: "-1" }).stock).toEqual(["El stock no puede ser negativo."]);
    expect(errorsOf({ ...VALID, stock_minimo: "-3" }).stock_minimo).toEqual([
      "El stock mínimo no puede ser negativo.",
    ]);
  });

  it("rechaza stock y mínimo que no son enteros", () => {
    const message = ["El stock tiene que ser un número entero, sin decimales."];
    expect(errorsOf({ ...VALID, stock: "1,5" }).stock).toEqual(message);
    expect(errorsOf({ ...VALID, stock: "1.5" }).stock).toEqual(message);
    expect(errorsOf({ ...VALID, stock: "1e3" }).stock).toEqual(message);
    expect(errorsOf({ ...VALID, stock: "diez" }).stock).toEqual(message);
  });

  it("rechaza stock y mínimo por encima del máximo", () => {
    expect(productInputSchema.parse({ ...VALID, stock: "1000000000" }).stock).toBe(1_000_000_000);
    expect(errorsOf({ ...VALID, stock: "1000000001" }).stock).toEqual([
      "El stock no puede ser mayor de 1.000.000.000.",
    ]);
    expect(errorsOf({ ...VALID, stock_minimo: "99999999999999999999" }).stock_minimo).toEqual([
      "El stock mínimo no puede ser mayor de 1.000.000.000.",
    ]);
  });

  it("devuelve todos los errores a la vez", () => {
    const errors = errorsOf({ nombre: "", sku: "", precio: "x", stock: "-1", stock_minimo: "" });
    expect(Object.keys(errors).sort()).toEqual(["nombre", "precio", "stock", "stock_minimo"]);
  });
});
