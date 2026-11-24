import { parseIsoDate, TIME_ZONE } from "@/lib/domain/dates";
import { isLowStock } from "@/lib/domain/stock";
import type { Order, Product } from "@/lib/types";

/** Pedidos que se muestran en "Últimos pedidos". */
export const LATEST_ORDERS = 5;

/** Pedido con lo que necesita el panel (puede llevar más campos, p. ej. el cliente). */
export type DashboardOrder = Pick<Order, "id" | "estado" | "total_cents" | "created_at">;

/** Producto con lo que necesita el panel (puede llevar más campos, p. ej. el nombre o el SKU). */
export type StockFields = Pick<Product, "nombre" | "stock" | "stock_minimo">;

/** Cifras de un mes natural en la hora de Madrid. */
export type MonthSummary = {
  /** Mes como "AAAA-MM", p. ej. "2026-11". */
  key: string;
  /** Pedidos del mes que no están cancelados. */
  orders: number;
  /** Pedidos del mes que se cancelaron (no cuentan en `orders` ni en `revenueCents`). */
  cancelled: number;
  /** Suma de los totales de los pedidos no cancelados (enviados y pendientes), en céntimos. */
  revenueCents: number;
};

export type InventorySummary<P extends StockFields> = {
  products: number;
  /** Unidades en stock sumando todos los productos. */
  units: number;
  /** Productos bajo mínimo, primero los que más se alejan del mínimo. */
  lowStock: P[];
};

export type Dashboard<P extends StockFields, O extends DashboardOrder> = {
  inventory: InventorySummary<P>;
  month: MonthSummary;
  previousMonth: MonthSummary;
  /** Pedidos pendientes de enviar, de cualquier mes. */
  pending: number;
  /** Los pedidos más recientes, de cualquier estado. */
  latest: O[];
};

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  year: "numeric",
  month: "2-digit",
  timeZone: TIME_ZONE,
});

const monthNameFormatter = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" });

const byName = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function toDate(value: Date | string): Date {
  if (typeof value === "string") {
    return parseIsoDate(value);
  }
  if (Number.isNaN(value.getTime())) {
    throw new RangeError("La fecha no es válida.");
  }
  return value;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const match = MONTH_KEY.exec(key);
  if (!match) {
    throw new RangeError("El mes tiene que tener la forma AAAA-MM.");
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function formatMonthKey(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function addCents(total: number, cents: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError("El total de un pedido tiene que ser un número entero de céntimos, igual o mayor que cero.");
  }
  const sum = total + cents;
  if (!Number.isSafeInteger(sum)) {
    throw new RangeError("La suma de los importes es demasiado alta.");
  }
  return sum;
}

/**
 * Mes natural ("AAAA-MM") de un instante en la hora de Madrid, con su horario de verano.
 * Un pedido del 30/11 a las 23:30 UTC es del 1/12 a las 00:30 en Madrid: cuenta en diciembre.
 */
export function madridMonthKey(value: Date | string): string {
  const parts = monthFormatter.formatToParts(toDate(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) {
    throw new RangeError("La fecha no es válida.");
  }
  return formatMonthKey(Number(year), Number(month));
}

/** Mes anterior a uno dado: "2026-11" → "2026-10" y "2027-01" → "2026-12". */
export function previousMonthKey(key: string): string {
  const { year, month } = parseMonthKey(key);
  return month === 1 ? formatMonthKey(year - 1, 12) : formatMonthKey(year, month - 1);
}

/** Nombre del mes en español, en minúsculas: "2026-11" → "noviembre". */
export function monthName(key: string): string {
  const { year, month } = parseMonthKey(key);
  return monthNameFormatter.format(new Date(Date.UTC(year, month - 1, 15)));
}

/**
 * Pedidos e ingresos de un mes natural de Madrid. Los cancelados no cuentan como pedidos
 * del mes ni suman ingresos; se cuentan aparte en `cancelled`.
 */
export function summarizeMonth(orders: ReadonlyArray<DashboardOrder>, key: string): MonthSummary {
  parseMonthKey(key);
  const summary: MonthSummary = { key, orders: 0, cancelled: 0, revenueCents: 0 };
  for (const order of orders) {
    if (madridMonthKey(order.created_at) !== key) {
      continue;
    }
    if (order.estado === "cancelado") {
      summary.cancelled += 1;
    } else {
      summary.orders += 1;
      summary.revenueCents = addCents(summary.revenueCents, order.total_cents);
    }
  }
  return summary;
}

/** Nº de productos, unidades en stock y productos bajo mínimo (ver `isLowStock`). */
export function summarizeInventory<P extends StockFields>(products: ReadonlyArray<P>): InventorySummary<P> {
  let units = 0;
  const lowStock: P[] = [];
  for (const product of products) {
    if (isLowStock(product.stock, product.stock_minimo)) {
      lowStock.push(product);
    }
    units += product.stock;
    if (!Number.isSafeInteger(units)) {
      throw new RangeError("La suma del stock es demasiado alta.");
    }
  }
  lowStock.sort(
    (a, b) => a.stock - a.stock_minimo - (b.stock - b.stock_minimo) || byName.compare(a.nombre, b.nombre),
  );
  return { products: products.length, units, lowStock };
}

/** Pedidos pendientes de enviar, sean del mes que sean. */
export function countPending(orders: ReadonlyArray<DashboardOrder>): number {
  return orders.filter((order) => order.estado === "pendiente").length;
}

/** Los `limit` pedidos más recientes (de cualquier estado), del más nuevo al más antiguo. */
export function latestOrders<O extends DashboardOrder>(orders: ReadonlyArray<O>, limit: number): O[] {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError("El límite tiene que ser un número entero igual o mayor que cero.");
  }
  return orders
    .map((order) => ({ order, time: parseIsoDate(order.created_at).getTime() }))
    .sort((a, b) => b.time - a.time)
    .slice(0, limit)
    .map(({ order }) => order);
}

/** Todas las cifras del panel para el mes de Madrid en que cae `now`. */
export function buildDashboard<P extends StockFields, O extends DashboardOrder>(
  products: ReadonlyArray<P>,
  orders: ReadonlyArray<O>,
  now: Date,
): Dashboard<P, O> {
  const key = madridMonthKey(now);
  return {
    inventory: summarizeInventory(products),
    month: summarizeMonth(orders, key),
    previousMonth: summarizeMonth(orders, previousMonthKey(key)),
    pending: countPending(orders),
    latest: latestOrders(orders, LATEST_ORDERS),
  };
}
