import type { Database } from "@/lib/database.types";

/**
 * Cifras del panel. Las calcula la función SQL `panel_resumen()` (migración
 * `20261124144658_consultas_escalables.sql`): mes natural de Madrid con su horario de verano,
 * los cancelados no cuentan como pedidos ni como ingresos, los pendientes son de cualquier mes
 * y un producto está bajo mínimo si `stock <= stock_minimo`. Los casos límite de esas reglas
 * se prueban en `supabase/tests/05_consultas_escalables.sql`. Aquí solo se comprueba que la
 * fila que llega tiene sentido y se le da la forma que usa la página.
 */

/** Pedidos que se muestran en "Últimos pedidos". */
export const LATEST_ORDERS = 5;

/** Productos que se muestran en "Stock bajo mínimo" (el total sale aparte). */
export const LOW_STOCK_SHOWN = 10;

/** Fila que devuelve `panel_resumen()`. */
export type PanelSummaryRow = Database["public"]["Functions"]["panel_resumen"]["Returns"][number];

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

export type InventorySummary = {
  products: number;
  /** Unidades en stock sumando todos los productos. */
  units: number;
  /** Cuántos productos están bajo mínimo (la lista del panel puede mostrar menos). */
  lowStock: number;
};

export type Dashboard = {
  inventory: InventorySummary;
  month: MonthSummary;
  previousMonth: MonthSummary;
  /** Pedidos pendientes de enviar, de cualquier mes. */
  pending: number;
};

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const monthNameFormatter = new Intl.DateTimeFormat("es-ES", { month: "long", timeZone: "UTC" });

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

function count(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} tiene que ser un número entero igual o mayor que cero.`);
  }
  return value;
}

/**
 * Pasa la fila de `panel_resumen()` a las cifras del panel. Lanza `RangeError` si alguna cifra
 * no es un entero seguro igual o mayor que cero, si los meses no tienen la forma "AAAA-MM",
 * si el mes anterior no es el anterior al actual o si hay más productos bajo mínimo que productos.
 */
export function readPanelSummary(row: PanelSummaryRow): Dashboard {
  if (previousMonthKey(row.mes_actual) !== row.mes_anterior) {
    throw new RangeError("El mes anterior no corresponde al mes actual.");
  }
  const products = count(row.productos, "El número de productos");
  const lowStock = count(row.productos_bajo_minimo, "El número de productos bajo mínimo");
  if (lowStock > products) {
    throw new RangeError("No puede haber más productos bajo mínimo que productos.");
  }
  return {
    inventory: { products, units: count(row.unidades, "Las unidades en stock"), lowStock },
    month: {
      key: row.mes_actual,
      orders: count(row.pedidos_mes, "Los pedidos del mes"),
      cancelled: count(row.cancelados_mes, "Los pedidos cancelados del mes"),
      revenueCents: count(row.ingresos_mes_cents, "Los ingresos del mes"),
    },
    previousMonth: {
      key: row.mes_anterior,
      orders: count(row.pedidos_mes_anterior, "Los pedidos del mes anterior"),
      cancelled: count(row.cancelados_mes_anterior, "Los pedidos cancelados del mes anterior"),
      revenueCents: count(row.ingresos_mes_anterior_cents, "Los ingresos del mes anterior"),
    },
    pending: count(row.pendientes, "Los pedidos pendientes"),
  };
}
