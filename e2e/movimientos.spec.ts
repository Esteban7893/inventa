import { expect, type Locator, type Page } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  gotoHydrated,
  login,
  missingDemoData,
  openNewOrderWithFirstCustomer,
  readLatestOrder,
  readProductStock,
  readProductsFromTable,
  test,
} from "./helpers";

const ORDER_DETAIL_URL = /\/pedidos\/([0-9a-f-]{36})$/;
const MOVEMENT_REASONS = /^(Pedido|Cancelación|Ajuste)$/;
const MOVEMENT_DELTA = /^[+\u2212]\d+$/;
/** Tope de páginas que se recorren: muy por encima de lo que tiene un producto de demostración. */
const MAX_MOVEMENT_PAGES = 50;

/** Sección «Movimientos» de la ficha de un producto (`productPath` puede llevar `?pagina=`). */
async function openMovements(page: Page, productPath: string): Promise<Locator> {
  await gotoHydrated(page, `/productos/${productPath}`);
  const section = page.getByRole("region", { name: "Movimientos", exact: true });
  await expect(section.getByRole("heading", { level: 2, name: "Movimientos" })).toBeVisible();
  return section;
}

/** Motivo, albarán enlazado (o "" si no hay pedido) y unidades del movimiento más reciente. */
async function latestMovement(section: Locator): Promise<{ reason: string; order: string; delta: string }> {
  const cells = section.locator("table tbody tr").first().locator("td");
  await expect(cells).toHaveCount(3);
  const orderLink = cells.nth(1).getByRole("link");
  return {
    reason: (await cells.nth(1).locator("span > span").first().innerText()).trim(),
    order: (await orderLink.count()) === 0 ? "" : (await orderLink.innerText()).trim(),
    delta: (await cells.nth(2).innerText()).trim(),
  };
}

test.describe("Movimientos de stock en la ficha de producto", () => {
  test("la ficha de un producto de demostración muestra sus movimientos (solo lectura)", async ({ page }) => {
    await login(page);

    const products = await readProductsFromTable(page);
    const product = products[0];
    if (!product) {
      throw missingDemoData("no hay ningún producto");
    }

    const stock = await readProductStock(page, product.id);
    let section = await openMovements(page, product.id);
    const counter = section.getByText(/^\d+ movimientos?$/i);
    await expect(counter, "La ficha de un producto de demostración tiene al menos un movimiento").toBeVisible();
    const total = Number.parseInt(await counter.innerText(), 10);

    // Todas las páginas: cada fila tiene fecha, motivo y signo, y son las de este producto
    // (la suma de sus deltas es su stock, y su número es el del recuento).
    let rowsSeen = 0;
    let deltaSum = 0;
    let lastPage = 1;
    for (; lastPage <= MAX_MOVEMENT_PAGES; lastPage += 1) {
      if (lastPage > 1) {
        section = await openMovements(page, `${product.id}?pagina=${lastPage}`);
      }
      const rows = section.locator("table tbody tr");
      const count = await rows.count();
      expect(count, `La página ${lastPage} de movimientos tiene filas`).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const cells = rows.nth(index).locator("td");
        await expect(cells.nth(0).locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
        await expect(cells.nth(1).locator("span > span").first()).toHaveText(MOVEMENT_REASONS);
        await expect(cells.nth(2)).toHaveText(MOVEMENT_DELTA);
        deltaSum += Number((await cells.nth(2).innerText()).trim().replace("\u2212", "-"));
      }
      rowsSeen += count;
      const older = section.getByRole("navigation", { name: "Páginas de movimientos" }).getByRole("link", {
        name: "Más antiguos →",
      });
      if ((await older.count()) === 0) {
        break;
      }
    }
    expect(lastPage, `El producto tiene más de ${MAX_MOVEMENT_PAGES} páginas de movimientos`).toBeLessThanOrEqual(
      MAX_MOVEMENT_PAGES,
    );
    expect(rowsSeen, "Las filas de todas las páginas son las del recuento").toBe(total);
    expect(deltaSum, "La suma de los movimientos del producto es su stock").toBe(stock);

    // La página siguiente a la última no existe, aunque el total sea múltiplo del tamaño de página.
    section = await openMovements(page, `${product.id}?pagina=${lastPage + 1}`);
    await expect(section.getByText("Esta página de movimientos no existe.")).toBeVisible();
    await expect(section.getByRole("link", { name: "Ver los más recientes" })).toBeVisible();
    await expect(section.getByText("Aún no hay movimientos.")).toHaveCount(0);
    await expect(section.getByRole("navigation", { name: "Páginas de movimientos" })).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    await gotoHydrated(page, `/productos/${product.id}`);
    await expect(page.getByRole("heading", { level: 2, name: "Movimientos" })).toBeVisible();
    await assertNoHorizontalOverflow(page, `/productos/${product.id}`);
  });

  test("un pedido deja su movimiento «Pedido» y, al cancelarlo, el de «Cancelación»", async ({ page, orderCleanup }) => {
    await login(page);

    const products = await readProductsFromTable(page);
    const chosen = products.find((product) => product.stock >= 1);
    if (!chosen) {
      throw missingDemoData("hace falta al menos un producto con stock >= 1");
    }

    const latestBefore = await readLatestOrder(page);
    const customer = await openNewOrderWithFirstCustomer(page);
    const line1 = page.getByRole("group", { name: "Línea 1" });
    await line1.getByLabel("Producto").selectOption(chosen.id);
    await expect(line1).toContainText(chosen.priceText);
    await line1.getByLabel("Cantidad").fill("1");

    orderCleanup.watchNewOrder(page, latestBefore, customer.name);
    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page).toHaveURL(ORDER_DETAIL_URL);
    const orderUrl = page.url();
    orderCleanup.track(orderUrl);
    const orderId = ORDER_DETAIL_URL.exec(new URL(orderUrl).pathname)?.[1] ?? "";
    const reference = `Nº ${orderId.slice(0, 8).toUpperCase()}`;

    let section = await openMovements(page, chosen.id);
    expect(await latestMovement(section)).toEqual({ reason: "Pedido", order: reference, delta: "\u22121" });
    await expect(section.getByRole("link", { name: `Albarán ${reference}` })).toHaveAttribute(
      "href",
      new URL(orderUrl).pathname,
    );

    await gotoHydrated(page, orderUrl);
    await page.getByRole("button", { name: "Cancelar pedido" }).click();
    await page.getByRole("button", { name: "Sí, cancelar pedido" }).click();
    await expect(page.locator("header").getByText(/^Cancelado$/i)).toBeVisible();

    section = await openMovements(page, chosen.id);
    expect(await latestMovement(section)).toEqual({ reason: "Cancelación", order: reference, delta: "+1" });
    await expect(section.getByRole("link", { name: `Albarán ${reference}` })).toHaveCount(2);
  });
});
