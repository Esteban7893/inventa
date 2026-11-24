import { describe, expect, it } from "vitest";
import {
  buildDashboard,
  countPending,
  latestOrders,
  madridMonthKey,
  monthName,
  previousMonthKey,
  summarizeInventory,
  summarizeMonth,
  type DashboardOrder,
} from "@/lib/domain/dashboard";

function order(id: string, estado: DashboardOrder["estado"], total_cents: number, created_at: string): DashboardOrder {
  return { id, estado, total_cents, created_at };
}

function product(nombre: string, stock: number, stock_minimo: number) {
  return { id: nombre.toLowerCase(), nombre, stock, stock_minimo };
}

describe("madridMonthKey", () => {
  it("devuelve el año y el mes en la hora de Madrid", () => {
    expect(madridMonthKey("2026-11-24T10:30:00Z")).toBe("2026-11");
    expect(madridMonthKey(new Date("2026-03-15T12:00:00Z"))).toBe("2026-03");
  });

  it("un pedido a las 23:30 UTC del último día del mes ya es del mes siguiente en Madrid (invierno, UTC+1)", () => {
    expect(madridMonthKey("2026-11-30T23:30:00Z")).toBe("2026-12");
    expect(madridMonthKey("2026-12-31T23:30:00Z")).toBe("2027-01");
  });

  it("en verano (UTC+2) el mes cambia a las 22:00 UTC", () => {
    expect(madridMonthKey("2026-07-31T21:59:59Z")).toBe("2026-07");
    expect(madridMonthKey("2026-07-31T22:00:00Z")).toBe("2026-08");
  });

  it("justo antes de la medianoche de Madrid sigue en el mismo mes", () => {
    expect(madridMonthKey("2026-11-30T22:59:59Z")).toBe("2026-11");
    expect(madridMonthKey("2026-11-30T23:00:00Z")).toBe("2026-12");
  });

  it("acepta fechas con desfase explícito", () => {
    expect(madridMonthKey("2026-10-31T23:30:00+01:00")).toBe("2026-10");
    expect(madridMonthKey("2026-10-31T23:30:00+00:00")).toBe("2026-11");
  });

  it("rechaza una fecha que no es válida", () => {
    expect(() => madridMonthKey("")).toThrow(RangeError);
    expect(() => madridMonthKey("ayer")).toThrow(RangeError);
    expect(() => madridMonthKey(new Date(Number.NaN))).toThrow(RangeError);
  });
});

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

describe("summarizeMonth", () => {
  const orders = [
    order("a", "enviado", 2450, "2026-11-02T09:00:00Z"),
    order("b", "pendiente", 1000, "2026-11-20T18:00:00Z"),
    order("c", "cancelado", 9999, "2026-11-21T10:00:00Z"),
    order("d", "enviado", 500, "2026-10-31T22:30:00Z"), // 23:30 en Madrid: octubre
    order("e", "pendiente", 700, "2026-11-30T23:30:00Z"), // 00:30 del 1 de diciembre en Madrid
  ];

  it("cuenta e ingresa solo los pedidos del mes que no están cancelados", () => {
    expect(summarizeMonth(orders, "2026-11")).toEqual({
      key: "2026-11",
      orders: 2,
      cancelled: 1,
      revenueCents: 3450,
    });
  });

  it("respeta el límite de mes en la hora de Madrid", () => {
    expect(summarizeMonth(orders, "2026-10")).toEqual({ key: "2026-10", orders: 1, cancelled: 0, revenueCents: 500 });
    expect(summarizeMonth(orders, "2026-12")).toEqual({ key: "2026-12", orders: 1, cancelled: 0, revenueCents: 700 });
  });

  it("sin pedidos vale cero", () => {
    expect(summarizeMonth([], "2026-11")).toEqual({ key: "2026-11", orders: 0, cancelled: 0, revenueCents: 0 });
  });

  it("un mes con solo pedidos cancelados no tiene ingresos", () => {
    expect(summarizeMonth([order("x", "cancelado", 1200, "2026-11-05T10:00:00Z")], "2026-11")).toEqual({
      key: "2026-11",
      orders: 0,
      cancelled: 1,
      revenueCents: 0,
    });
  });

  it("acepta pedidos de importe cero", () => {
    expect(summarizeMonth([order("z", "pendiente", 0, "2026-11-05T10:00:00Z")], "2026-11").revenueCents).toBe(0);
  });

  it("rechaza importes negativos o con decimales", () => {
    expect(() => summarizeMonth([order("n", "pendiente", -1, "2026-11-05T10:00:00Z")], "2026-11")).toThrow(RangeError);
    expect(() => summarizeMonth([order("n", "enviado", 1.5, "2026-11-05T10:00:00Z")], "2026-11")).toThrow(RangeError);
  });

  it("rechaza una suma que no cabe en un entero seguro", () => {
    const huge = order("h", "enviado", Number.MAX_SAFE_INTEGER, "2026-11-05T10:00:00Z");
    expect(() => summarizeMonth([huge, { ...huge, id: "h2" }], "2026-11")).toThrow(RangeError);
  });

  it("rechaza una fecha de pedido que no es válida", () => {
    expect(() => summarizeMonth([order("f", "pendiente", 100, "no es una fecha")], "2026-11")).toThrow(RangeError);
  });
});

describe("summarizeInventory", () => {
  it("cuenta productos y unidades y lista los que están bajo mínimo", () => {
    const summary = summarizeInventory([
      product("Café", 40, 10),
      product("Taza", 3, 6),
      product("Molinillo", 2, 2),
      product("Jarra", 11, 4),
    ]);
    expect(summary.products).toBe(4);
    expect(summary.units).toBe(56);
    expect(summary.lowStock.map((p) => p.nombre)).toEqual(["Taza", "Molinillo"]);
  });

  it("ordena el stock bajo por lo que falta para el mínimo y, a igualdad, por nombre", () => {
    const summary = summarizeInventory([
      product("Taza", 3, 6), // −3
      product("Báscula", 0, 2), // −2
      product("Agua", 1, 3), // −2
      product("Filtros", 0, 0), // 0
      product("Molinillo", 9, 4), // no está bajo mínimo
    ]);
    expect(summary.lowStock.map((p) => p.nombre)).toEqual(["Taza", "Agua", "Báscula", "Filtros"]);
  });

  it("conserva los demás datos de cada producto", () => {
    const summary = summarizeInventory([{ id: "p1", nombre: "Taza", sku: "TAZ", stock: 1, stock_minimo: 5 }]);
    expect(summary.lowStock).toEqual([{ id: "p1", nombre: "Taza", sku: "TAZ", stock: 1, stock_minimo: 5 }]);
  });

  it("sin productos vale cero y no hay stock bajo", () => {
    expect(summarizeInventory([])).toEqual({ products: 0, units: 0, lowStock: [] });
  });

  it("un producto agotado con mínimo cero cuenta como bajo mínimo", () => {
    expect(summarizeInventory([product("Té", 0, 0)]).lowStock).toHaveLength(1);
  });

  it("rechaza stock negativo o con decimales", () => {
    expect(() => summarizeInventory([product("Té", -1, 0)])).toThrow(RangeError);
    expect(() => summarizeInventory([product("Té", 1.5, 0)])).toThrow(RangeError);
  });
});

describe("countPending", () => {
  it("cuenta los pedidos pendientes de cualquier mes", () => {
    expect(
      countPending([
        order("a", "pendiente", 100, "2025-01-01T10:00:00Z"),
        order("b", "pendiente", 100, "2026-11-01T10:00:00Z"),
        order("c", "enviado", 100, "2026-11-01T10:00:00Z"),
        order("d", "cancelado", 100, "2026-11-01T10:00:00Z"),
      ]),
    ).toBe(2);
  });

  it("sin pedidos vale cero", () => {
    expect(countPending([])).toBe(0);
  });
});

describe("latestOrders", () => {
  const orders = [
    order("1", "enviado", 100, "2026-11-01T10:00:00Z"),
    order("2", "pendiente", 100, "2026-11-24T08:00:00Z"),
    order("3", "cancelado", 100, "2026-11-10T10:00:00Z"),
    order("4", "pendiente", 100, "2026-11-23T23:30:00Z"),
    order("5", "enviado", 100, "2026-10-05T10:00:00Z"),
    order("6", "enviado", 100, "2026-11-20T10:00:00+01:00"),
  ];

  it("devuelve los más recientes primero, con los cancelados incluidos", () => {
    expect(latestOrders(orders, 5).map((o) => o.id)).toEqual(["2", "4", "6", "3", "1"]);
  });

  it("si hay menos pedidos que el límite, los devuelve todos", () => {
    expect(latestOrders(orders.slice(0, 2), 5).map((o) => o.id)).toEqual(["2", "1"]);
  });

  it("sin pedidos o con límite cero devuelve una lista vacía", () => {
    expect(latestOrders([], 5)).toEqual([]);
    expect(latestOrders(orders, 0)).toEqual([]);
  });

  it("no cambia la lista original", () => {
    const copy = [...orders];
    latestOrders(orders, 3);
    expect(orders).toEqual(copy);
  });

  it("rechaza un límite negativo o con decimales", () => {
    expect(() => latestOrders(orders, -1)).toThrow(RangeError);
    expect(() => latestOrders(orders, 1.5)).toThrow(RangeError);
  });
});

describe("buildDashboard", () => {
  const products = [product("Café", 40, 10), product("Taza", 3, 6)];
  const orders = [
    order("a", "enviado", 2450, "2026-11-02T09:00:00Z"),
    order("b", "pendiente", 1000, "2026-11-20T18:00:00Z"),
    order("c", "cancelado", 9999, "2026-11-21T10:00:00Z"),
    order("d", "pendiente", 500, "2026-10-31T22:30:00Z"),
  ];

  it("reúne las cifras del mes de Madrid en que cae `now` y las del mes anterior", () => {
    const dashboard = buildDashboard(products, orders, new Date("2026-11-24T12:00:00Z"));
    expect(dashboard.inventory.products).toBe(2);
    expect(dashboard.inventory.units).toBe(43);
    expect(dashboard.inventory.lowStock.map((p) => p.nombre)).toEqual(["Taza"]);
    expect(dashboard.month).toEqual({ key: "2026-11", orders: 2, cancelled: 1, revenueCents: 3450 });
    expect(dashboard.previousMonth).toEqual({ key: "2026-10", orders: 1, cancelled: 0, revenueCents: 500 });
    expect(dashboard.pending).toBe(2);
    expect(dashboard.latest.map((o) => o.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("a las 23:30 UTC del 31 de octubre ya es noviembre en Madrid", () => {
    const dashboard = buildDashboard(products, orders, new Date("2026-10-31T23:30:00Z"));
    expect(dashboard.month.key).toBe("2026-11");
    expect(dashboard.previousMonth.key).toBe("2026-10");
  });

  it("en enero compara con diciembre del año anterior", () => {
    const dashboard = buildDashboard([], [order("x", "enviado", 800, "2026-12-15T10:00:00Z")], new Date("2027-01-10T10:00:00Z"));
    expect(dashboard.month).toEqual({ key: "2027-01", orders: 0, cancelled: 0, revenueCents: 0 });
    expect(dashboard.previousMonth).toEqual({ key: "2026-12", orders: 1, cancelled: 0, revenueCents: 800 });
  });

  it("sin productos ni pedidos todo vale cero", () => {
    const dashboard = buildDashboard([], [], new Date("2026-11-24T12:00:00Z"));
    expect(dashboard).toEqual({
      inventory: { products: 0, units: 0, lowStock: [] },
      month: { key: "2026-11", orders: 0, cancelled: 0, revenueCents: 0 },
      previousMonth: { key: "2026-10", orders: 0, cancelled: 0, revenueCents: 0 },
      pending: 0,
      latest: [],
    });
  });

  it("rechaza una fecha `now` que no es válida", () => {
    expect(() => buildDashboard([], [], new Date(Number.NaN))).toThrow(RangeError);
  });
});
