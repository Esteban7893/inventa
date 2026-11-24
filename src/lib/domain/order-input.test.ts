import { describe, expect, it } from "vitest";
import { MAX_ORDER_LINES, orderInputErrors, orderInputSchema } from "@/lib/domain/order-input";

const CLIENTE = "5e0c1a2b-3d4e-4f60-8a1b-2c3d4e5f6a7b";
const CAFE = "0b6f4c1e-8a52-4d0e-9a4b-1f2c3d4e5f60";
const TAZA = "7a1d2e3f-4b5c-4d6e-8f70-81920a1b2c3d";

function errorsOf(input: unknown) {
  const result = orderInputSchema.safeParse(input);
  if (result.success) {
    throw new Error("Se esperaba un error de validación");
  }
  return orderInputErrors(result.error);
}

describe("orderInputSchema", () => {
  it("convierte el formulario en los argumentos de crear_pedido, sin precios", () => {
    expect(
      orderInputSchema.parse({
        cliente_id: CLIENTE,
        lineas: [
          { producto_id: CAFE, cantidad: "2" },
          { producto_id: TAZA, cantidad: " 1 " },
        ],
      }),
    ).toEqual({
      p_cliente_id: CLIENTE,
      p_lineas: [
        { producto_id: CAFE, cantidad: 2 },
        { producto_id: TAZA, cantidad: 1 },
      ],
    });
  });

  it("ignora cualquier precio, total o dueño que llegue del cliente", () => {
    const data = orderInputSchema.parse({
      cliente_id: CLIENTE,
      owner_id: CLIENTE,
      total_cents: 1,
      lineas: [{ producto_id: CAFE, cantidad: "2", precio_unit_cents: 1 }],
    });
    expect(data).toEqual({ p_cliente_id: CLIENTE, p_lineas: [{ producto_id: CAFE, cantidad: 2 }] });
  });

  it("exige elegir un cliente válido", () => {
    expect(errorsOf({ cliente_id: "", lineas: [{ producto_id: CAFE, cantidad: "1" }] })).toEqual({
      error: "Revisa los campos marcados.",
      clienteError: "Elige un cliente.",
      lineErrors: [],
    });
    expect(errorsOf({ cliente_id: "no-es-un-id", lineas: [{ producto_id: CAFE, cantidad: "1" }] }).clienteError).toBe(
      "Elige un cliente.",
    );
  });

  it("exige al menos una línea", () => {
    expect(errorsOf({ cliente_id: CLIENTE, lineas: [] })).toEqual({
      error: "Añade al menos una línea al pedido.",
      lineErrors: [],
    });
  });

  it("marca la línea sin producto o con un producto que no es un id", () => {
    const errors = errorsOf({
      cliente_id: CLIENTE,
      lineas: [
        { producto_id: "", cantidad: "1" },
        { producto_id: "taza", cantidad: "1" },
      ],
    });
    expect(errors.lineErrors).toEqual([{ producto_id: "Elige un producto." }, { producto_id: "Elige un producto." }]);
  });

  it("marca las cantidades vacías, cero, negativas o con decimales", () => {
    const message = "La cantidad tiene que ser un número entero mayor que cero.";
    const errors = errorsOf({
      cliente_id: CLIENTE,
      lineas: ["", "0", "-1", "1,5"].map((cantidad, index) => ({
        producto_id: [CAFE, TAZA, "1f0e2d3c-4b5a-4968-8776-655443322110", "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d"][index],
        cantidad,
      })),
    });
    expect(errors.lineErrors).toEqual([{ cantidad: message }, { cantidad: message }, { cantidad: message }, { cantidad: message }]);
  });

  it("rechaza un producto repetido", () => {
    const errors = errorsOf({
      cliente_id: CLIENTE,
      lineas: [
        { producto_id: CAFE, cantidad: "1" },
        { producto_id: CAFE, cantidad: "2" },
      ],
    });
    expect(errors).toEqual({
      error: "Revisa las líneas marcadas.",
      lineErrors: [{}, { producto_id: "Este producto ya está en la línea 1. Junta las cantidades en una sola línea." }],
    });
  });

  it("devuelve a la vez el error del cliente y los de las líneas", () => {
    const errors = errorsOf({ cliente_id: "", lineas: [{ producto_id: "", cantidad: "0" }] });
    expect(errors.clienteError).toBe("Elige un cliente.");
    expect(errors.lineErrors[0]).toEqual({
      producto_id: "Elige un producto.",
      cantidad: "La cantidad tiene que ser un número entero mayor que cero.",
    });
  });

  it("limita el número de líneas", () => {
    const lineas = Array.from({ length: MAX_ORDER_LINES + 1 }, () => ({ producto_id: CAFE, cantidad: "1" }));
    expect(errorsOf({ cliente_id: CLIENTE, lineas }).error).toBe(
      `Un pedido no puede tener más de ${MAX_ORDER_LINES} líneas.`,
    );
  });

  it("rechaza una entrada con otra forma sin dar detalles técnicos", () => {
    expect(errorsOf(null)).toEqual({ error: "Revisa los datos del pedido.", lineErrors: [] });
    expect(errorsOf({ cliente_id: CLIENTE, lineas: "todo" })).toEqual({
      error: "Revisa los datos del pedido.",
      lineErrors: [],
    });
    expect(errorsOf({ cliente_id: CLIENTE, lineas: [{ producto_id: CAFE, cantidad: 2 }] })).toEqual({
      error: "Revisa los datos del pedido.",
      lineErrors: [],
    });
  });
});
