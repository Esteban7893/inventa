import type { Database, Tables } from "@/lib/database.types";

/**
 * Tipos de las filas de la base de datos derivados de `database.types.ts` (`npm run db:types`).
 * Los importes van en céntimos (enteros) y las fechas llegan como texto ISO 8601.
 */

export type OrderStatus = "pendiente" | "enviado" | "cancelado";

export type Product = Tables<"productos">;

export type Customer = Tables<"clientes">;

export type Order = Omit<Tables<"pedidos">, "estado"> & {
  estado: OrderStatus;
};

export type OrderLine = Tables<"pedido_lineas">;

/** Elemento del array `p_lineas` que recibe la función SQL `crear_pedido`. */
export type CreateOrderLine = Pick<OrderLine, "producto_id" | "cantidad">;

type PublicFunctions = Database["public"]["Functions"];

/** Argumentos de la función SQL `crear_pedido`, tal como se pasan a `supabase.rpc(...)`. */
export type CreateOrderArgs = Omit<PublicFunctions["crear_pedido"]["Args"], "p_lineas"> & {
  p_lineas: CreateOrderLine[];
};
