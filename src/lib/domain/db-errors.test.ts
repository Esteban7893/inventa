import { describe, expect, it } from "vitest";
import { dbErrorMessage } from "@/lib/domain/db-errors";

const GENERIC = "No se ha podido completar la operación. Inténtalo de nuevo.";

describe("dbErrorMessage", () => {
  it("traduce sesión no autenticada", () => {
    expect(dbErrorMessage({ message: "NO_AUTENTICADO" })).toBe(
      "Tu sesión ha caducado. Vuelve a entrar.",
    );
  });

  it("traduce cliente no encontrado", () => {
    expect(dbErrorMessage({ message: "CLIENTE_NO_ENCONTRADO" })).toBe(
      "El cliente no existe o ya no está disponible.",
    );
  });

  it("traduce pedido vacío", () => {
    expect(dbErrorMessage({ message: "PEDIDO_VACIO" })).toBe(
      "El pedido tiene que tener al menos una línea.",
    );
  });

  it("traduce cantidad inválida", () => {
    expect(dbErrorMessage({ message: "CANTIDAD_INVALIDA" })).toBe(
      "Las cantidades tienen que ser números enteros mayores que cero.",
    );
  });

  it("traduce producto repetido", () => {
    expect(dbErrorMessage({ message: "PRODUCTO_REPETIDO" })).toBe(
      "Hay un producto repetido en el pedido. Junta sus cantidades en una sola línea.",
    );
  });

  it("traduce producto no encontrado", () => {
    expect(dbErrorMessage({ message: "PRODUCTO_NO_ENCONTRADO" })).toBe(
      "Alguno de los productos no existe o ya no está disponible.",
    );
  });

  it("traduce total demasiado alto", () => {
    expect(dbErrorMessage({ message: "TOTAL_DEMASIADO_ALTO" })).toBe(
      "El total del pedido es demasiado alto.",
    );
  });

  it("traduce pedido no encontrado", () => {
    expect(dbErrorMessage({ message: "PEDIDO_NO_ENCONTRADO" })).toBe(
      "El pedido no existe o ya no está disponible.",
    );
  });

  it("traduce estado inválido", () => {
    expect(dbErrorMessage({ message: "ESTADO_INVALIDO" })).toBe(
      "Solo se pueden enviar o cancelar pedidos pendientes.",
    );
  });

  it("nombra el producto cuando falta stock", () => {
    expect(dbErrorMessage({ message: "STOCK_INSUFICIENTE: Taza" })).toBe(
      'No hay stock suficiente de "Taza".',
    );
  });

  it("conserva el nombre completo aunque tenga dos puntos o espacios alrededor", () => {
    expect(dbErrorMessage({ message: "STOCK_INSUFICIENTE: Taza: modelo 2 " })).toBe(
      'No hay stock suficiente de "Taza: modelo 2".',
    );
  });

  it("da un mensaje sin nombre si falta stock y no llega el nombre", () => {
    const expected = "No hay stock suficiente de alguno de los productos.";
    expect(dbErrorMessage({ message: "STOCK_INSUFICIENTE" })).toBe(expected);
    expect(dbErrorMessage({ message: "STOCK_INSUFICIENTE:" })).toBe(expected);
    expect(dbErrorMessage({ message: "STOCK_INSUFICIENTE:   " })).toBe(expected);
  });

  it("ignora espacios alrededor del código", () => {
    expect(dbErrorMessage({ message: "  PEDIDO_VACIO \n" })).toBe(
      "El pedido tiene que tener al menos una línea.",
    );
  });

  it("no confunde un código con otro que empieza igual", () => {
    expect(dbErrorMessage({ message: "PEDIDO_VACIO_X" })).toBe(GENERIC);
    expect(dbErrorMessage({ message: "STOCK_INSUFICIENTEX: Taza" })).toBe(GENERIC);
  });

  it("traduce el borrado de un cliente o producto que está en pedidos", () => {
    const expected = "No se puede borrar porque aparece en algún pedido.";
    expect(
      dbErrorMessage({
        code: "23503",
        message:
          'update or delete on table "clientes" violates foreign key constraint "pedidos_cliente_id_owner_id_fkey" on table "pedidos"',
      }),
    ).toBe(expected);
  });

  it("no usa el mensaje de borrado cuando la clave ajena falla al insertar", () => {
    expect(
      dbErrorMessage({
        code: "23503",
        message:
          'insert or update on table "pedidos" violates foreign key constraint "pedidos_cliente_id_owner_id_fkey"',
      }),
    ).toBe(GENERIC);
  });

  it("traduce el SKU repetido", () => {
    expect(
      dbErrorMessage({
        code: "23505",
        message: 'duplicate key value violates unique constraint "productos_owner_sku_key"',
      }),
    ).toBe("Ya tienes otro producto con ese SKU.");
  });

  it("usa el mensaje genérico con mensajes vacíos o desconocidos y nunca repite el texto técnico", () => {
    expect(dbErrorMessage({ message: "" })).toBe(GENERIC);
    expect(dbErrorMessage({})).toBe(GENERIC);
    expect(dbErrorMessage({ message: "CODIGO_DESCONOCIDO" })).toBe(GENERIC);
    expect(dbErrorMessage({ message: "toString" })).toBe(GENERIC);
    expect(dbErrorMessage({ message: "__proto__" })).toBe(GENERIC);
    expect(
      dbErrorMessage({
        code: "42501",
        message: 'new row violates row-level security policy for table "productos"',
      }),
    ).toBe(GENERIC);
    expect(dbErrorMessage({ code: "23505", message: "duplicate key value" })).toBe(GENERIC);
  });
});
