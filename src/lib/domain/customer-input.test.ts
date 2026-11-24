import { describe, expect, it } from "vitest";
import { z } from "zod";
import { customerInputSchema } from "@/lib/domain/customer-input";

const VALID = {
  nombre: "Cafetería La Esquina",
  email: "pedidos@laesquina.test",
  telefono: "+34 600 111 222",
};

function errorsOf(input: Record<string, unknown>): Record<string, string[] | undefined> {
  const result = customerInputSchema.safeParse(input);
  if (result.success) {
    throw new Error("Se esperaba un error de validación");
  }
  return z.flattenError(result.error).fieldErrors;
}

describe("customerInputSchema", () => {
  it("acepta un cliente completo", () => {
    expect(customerInputSchema.parse(VALID)).toEqual(VALID);
  });

  it("quita los espacios de alrededor", () => {
    expect(
      customerInputSchema.parse({ nombre: "  Hostal  ", email: " a@b.test ", telefono: " 600 111 222 " }),
    ).toEqual({ nombre: "Hostal", email: "a@b.test", telefono: "600 111 222" });
  });

  it("guarda email y teléfono vacíos o ausentes como null", () => {
    expect(customerInputSchema.parse({ nombre: "Jordi", email: "", telefono: "  " })).toEqual({
      nombre: "Jordi",
      email: null,
      telefono: null,
    });
    expect(customerInputSchema.parse({ nombre: "Jordi" })).toEqual({
      nombre: "Jordi",
      email: null,
      telefono: null,
    });
  });

  it("exige el nombre", () => {
    const message = ["Escribe el nombre del cliente."];
    expect(errorsOf({ ...VALID, nombre: "" }).nombre).toEqual(message);
    expect(errorsOf({ ...VALID, nombre: "   " }).nombre).toEqual(message);
    expect(errorsOf({ ...VALID, nombre: undefined }).nombre).toEqual(message);
  });

  it("limita la longitud del nombre", () => {
    expect(errorsOf({ ...VALID, nombre: "a".repeat(121) }).nombre).toEqual([
      "El nombre no puede tener más de 120 caracteres.",
    ]);
  });

  it("rechaza un email mal escrito", () => {
    const message = ["Escribe un email válido, por ejemplo nombre@empresa.es."];
    expect(errorsOf({ ...VALID, email: "pedidos" }).email).toEqual(message);
    expect(errorsOf({ ...VALID, email: "pedidos@" }).email).toEqual(message);
    expect(errorsOf({ ...VALID, email: "a b@c.es" }).email).toEqual(message);
  });

  it("acepta teléfonos con prefijo, espacios, guiones, puntos y paréntesis", () => {
    for (const telefono of ["600111222", "+34 600 111 222", "(93) 412-34-56", "93.412.34.56"]) {
      expect(customerInputSchema.parse({ ...VALID, telefono }).telefono).toBe(telefono);
    }
  });

  it("rechaza teléfonos con letras, demasiado cortos o demasiado largos", () => {
    const message = ["Escribe un teléfono válido: de 6 a 15 cifras, con espacios o guiones si quieres."];
    expect(errorsOf({ ...VALID, telefono: "llamar luego" }).telefono).toEqual(message);
    expect(errorsOf({ ...VALID, telefono: "12345" }).telefono).toEqual(message);
    expect(errorsOf({ ...VALID, telefono: "1234567890123456" }).telefono).toEqual(message);
    expect(errorsOf({ ...VALID, telefono: "600+111" }).telefono).toEqual(message);
  });

  it("devuelve todos los errores a la vez", () => {
    const errors = errorsOf({ nombre: "", email: "x", telefono: "x" });
    expect(Object.keys(errors).sort()).toEqual(["email", "nombre", "telefono"]);
  });
});
