import { describe, expect, it } from "vitest";
import { monthName, previousMonthKey, readPanelSummary, type PanelSummaryRow } from "@/lib/domain/dashboard";

/*
 * Desde T11 las cifras del panel se calculan en SQL (`panel_resumen()`), no en JavaScript.
 * Los casos de los antiguos tests de madridMonthKey, summarizeMonth, summarizeInventory,
 * countPending, latestOrders y buildDashboard se prueban ahora donde vive la regla, en
 * `supabase/tests/05_consultas_escalables.sql`:
 * - 23:30 UTC del último día ya es el mes siguiente; 22:59:59 / 23:00 UTC en invierno y
 *   21:59:59 / 22:00 UTC en verano; enero compara con diciembre: 05#18–#22.
 * - cancelados fuera de pedidos e ingresos, pendientes de cualquier mes, unidades y
 *   productos bajo mínimo (stock <= mínimo, también agotado con mínimo 0): 05#18–#20.
 * - sin datos todo vale cero (sin nulls): 05#24.
 * - stock bajo ordenado por lo que falta y, a igualdad, por nombre: 05#25–#26.
 * - últimos pedidos del más reciente al más antiguo: ya no hay función que probar; el panel
 *   pide `order("created_at", desc).order("id", desc).limit(5)` directamente a PostgREST.
 * Aquí queda lo que sigue en JavaScript: nombres y claves de mes, y la lectura de la fila.
 */

function row(overrides: Partial<PanelSummaryRow> = {}): PanelSummaryRow {
  return {
    mes_actual: "2026-11",
    mes_anterior: "2026-10",
    pedidos_mes: 2,
    cancelados_mes: 1,
    ingresos_mes_cents: 3450,
    pedidos_mes_anterior: 1,
    cancelados_mes_anterior: 0,
    ingresos_mes_anterior_cents: 500,
    pendientes: 2,
    productos: 2,
    unidades: 43,
    productos_bajo_minimo: 1,
    ...overrides,
  };
}

describe("previousMonthKey", () => {
  it("devuelve el mes anterior", () => {
    expect(previousMonthKey("2026-11")).toBe("2026-10");
    expect(previousMonthKey("2026-10")).toBe("2026-09");
  });

  it("en enero vuelve a diciembre del año anterior", () => {
    expect(previousMonthKey("2027-01")).toBe("2026-12");
  });

  it("rechaza claves mal formadas", () => {
    expect(() => previousMonthKey("2026-13")).toThrow(RangeError);
    expect(() => previousMonthKey("2026-00")).toThrow(RangeError);
    expect(() => previousMonthKey("2026-1")).toThrow(RangeError);
    expect(() => previousMonthKey("")).toThrow(RangeError);
  });
});

describe("monthName", () => {
  it("devuelve el nombre del mes en español y en minúsculas", () => {
    expect(monthName("2026-11")).toBe("noviembre");
    expect(monthName("2027-01")).toBe("enero");
    expect(monthName("2026-12")).toBe("diciembre");
  });

  it("rechaza claves mal formadas", () => {
    expect(() => monthName("noviembre")).toThrow(RangeError);
  });
});

describe("readPanelSummary", () => {
  it("reúne las cifras del mes, del mes anterior, los pendientes y el inventario", () => {
    expect(readPanelSummary(row())).toEqual({
      inventory: { products: 2, units: 43, lowStock: 1 },
      month: { key: "2026-11", orders: 2, cancelled: 1, revenueCents: 3450 },
      previousMonth: { key: "2026-10", orders: 1, cancelled: 0, revenueCents: 500 },
      pending: 2,
    });
  });

  it("en enero acepta diciembre del año anterior como mes anterior", () => {
    const summary = readPanelSummary(row({ mes_actual: "2027-01", mes_anterior: "2026-12" }));
    expect(summary.month.key).toBe("2027-01");
    expect(summary.previousMonth.key).toBe("2026-12");
  });

  it("sin productos ni pedidos todo vale cero", () => {
    const zeros = row({
      pedidos_mes: 0,
      cancelados_mes: 0,
      ingresos_mes_cents: 0,
      pedidos_mes_anterior: 0,
      cancelados_mes_anterior: 0,
      ingresos_mes_anterior_cents: 0,
      pendientes: 0,
      productos: 0,
      unidades: 0,
      productos_bajo_minimo: 0,
    });
    expect(readPanelSummary(zeros)).toEqual({
      inventory: { products: 0, units: 0, lowStock: 0 },
      month: { key: "2026-11", orders: 0, cancelled: 0, revenueCents: 0 },
      previousMonth: { key: "2026-10", orders: 0, cancelled: 0, revenueCents: 0 },
      pending: 0,
    });
  });

  it("todos los productos pueden estar bajo mínimo", () => {
    expect(readPanelSummary(row({ productos: 3, productos_bajo_minimo: 3 })).inventory.lowStock).toBe(3);
  });

  it("rechaza un mes anterior que no es el anterior al actual", () => {
    expect(() => readPanelSummary(row({ mes_anterior: "2026-09" }))).toThrow(RangeError);
    expect(() => readPanelSummary(row({ mes_actual: "2027-01", mes_anterior: "2027-12" }))).toThrow(RangeError);
  });

  it("rechaza meses mal formados", () => {
    expect(() => readPanelSummary(row({ mes_actual: "noviembre" }))).toThrow(RangeError);
    expect(() => readPanelSummary(row({ mes_actual: "2026-13", mes_anterior: "2026-12" }))).toThrow(RangeError);
  });

  it("rechaza cifras negativas, con decimales o que no caben en un entero seguro", () => {
    expect(() => readPanelSummary(row({ ingresos_mes_cents: -1 }))).toThrow(RangeError);
    expect(() => readPanelSummary(row({ pedidos_mes: 1.5 }))).toThrow(RangeError);
    expect(() => readPanelSummary(row({ unidades: Number.MAX_SAFE_INTEGER + 2 }))).toThrow(RangeError);
    expect(() => readPanelSummary(row({ pendientes: Number.NaN }))).toThrow(RangeError);
    expect(() => readPanelSummary(row({ cancelados_mes_anterior: -3 }))).toThrow(RangeError);
  });

  it("rechaza más productos bajo mínimo que productos", () => {
    expect(() => readPanelSummary(row({ productos: 1, productos_bajo_minimo: 2 }))).toThrow(RangeError);
  });
});
