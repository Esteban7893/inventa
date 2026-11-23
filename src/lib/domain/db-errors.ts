export type DbErrorInfo = {
  code?: string;
  message?: string;
};

const GENERIC_MESSAGE = "No se ha podido completar la operación. Inténtalo de nuevo.";

const STOCK_PREFIX = "STOCK_INSUFICIENTE";

/** Errores de negocio que lanzan las funciones SQL (`raise exception '<CODIGO>'`). */
const MESSAGES_BY_CODE: Record<string, string> = {
  NO_AUTENTICADO: "Tu sesión ha caducado. Vuelve a entrar.",
  CLIENTE_NO_ENCONTRADO: "El cliente no existe o ya no está disponible.",
  PEDIDO_VACIO: "El pedido tiene que tener al menos una línea.",
  CANTIDAD_INVALIDA: "Las cantidades tienen que ser números enteros mayores que cero.",
  PRODUCTO_REPETIDO:
    "Hay un producto repetido en el pedido. Junta sus cantidades en una sola línea.",
  PRODUCTO_NO_ENCONTRADO: "Alguno de los productos no existe o ya no está disponible.",
  TOTAL_DEMASIADO_ALTO: "El total del pedido es demasiado alto.",
  PEDIDO_NO_ENCONTRADO: "El pedido no existe o ya no está disponible.",
  ESTADO_INVALIDO: "Solo se pueden enviar o cancelar pedidos pendientes.",
};

/** Violación de clave ajena al borrar (`on delete restrict`). */
const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";
const SKU_CONSTRAINT = "productos_owner_sku_key";

function stockMessage(text: string): string | null {
  if (text === STOCK_PREFIX) {
    return "No hay stock suficiente de alguno de los productos.";
  }
  if (!text.startsWith(`${STOCK_PREFIX}:`)) {
    return null;
  }
  const productName = text.slice(STOCK_PREFIX.length + 1).trim();
  return productName
    ? `No hay stock suficiente de "${productName}".`
    : "No hay stock suficiente de alguno de los productos.";
}

/**
 * Traduce un error de Supabase/Postgres (llega en `error.message`, y `error.code`
 * con el SQLSTATE) a un mensaje en español para la persona.
 * Nunca devuelve el texto técnico original.
 */
export function dbErrorMessage(error: DbErrorInfo): string {
  const text = (error.message ?? "").trim();

  if (Object.hasOwn(MESSAGES_BY_CODE, text)) {
    return MESSAGES_BY_CODE[text];
  }

  const stock = stockMessage(text);
  if (stock) {
    return stock;
  }

  if (error.code === FOREIGN_KEY_VIOLATION && text.startsWith("update or delete on table")) {
    return "No se puede borrar porque aparece en algún pedido.";
  }

  if (error.code === UNIQUE_VIOLATION && text.includes(SKU_CONSTRAINT)) {
    return "Ya tienes otro producto con ese SKU.";
  }

  return GENERIC_MESSAGE;
}
