/**
 * Tipos de las filas de la base de datos (supabase/migrations/0001_esquema.sql).
 * Los importes van en céntimos (enteros) y las fechas llegan como texto ISO 8601.
 */

export type OrderStatus = "pendiente" | "enviado" | "cancelado";

export type Product = {
  id: string;
  owner_id: string;
  nombre: string;
  sku: string | null;
  precio_cents: number;
  stock: number;
  stock_minimo: number;
  created_at: string;
};

export type Customer = {
  id: string;
  owner_id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  owner_id: string;
  cliente_id: string;
  estado: OrderStatus;
  total_cents: number;
  created_at: string;
  enviado_at: string | null;
  cancelado_at: string | null;
};

export type OrderLine = {
  id: string;
  owner_id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  precio_unit_cents: number;
  created_at: string;
};

/** Elemento del array `p_lineas` que recibe la función SQL `crear_pedido`. */
export type CreateOrderLine = {
  producto_id: string;
  cantidad: number;
};

/** Argumentos de las funciones SQL, tal como se pasan a `supabase.rpc(...)`. */
export type CreateOrderArgs = {
  p_cliente_id: string;
  p_lineas: CreateOrderLine[];
};

export type OrderIdArgs = {
  p_pedido_id: string;
};
