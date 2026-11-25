import { expect } from "@playwright/test";
import {
  gotoHydrated,
  login,
  missingDemoData,
  openNewOrderWithFirstCustomer,
  readLatestOrder,
  readProductStock,
  readProductsFromTable,
  test,
} from "./helpers";

const ORDER_DETAIL_URL = /\/pedidos\/[0-9a-f-]{36}$/;

test.describe("Pedidos y control de stock", () => {
  test("crea un pedido, descuenta el stock, lo cancela y restaura el stock original", async ({ page, orderCleanup }) => {
    await login(page);

    const products = await readProductsFromTable(page);
    const chosen = products.find((product) => product.stock >= 2);
    if (!chosen) {
      throw missingDemoData("hace falta al menos un producto con stock >= 2");
    }

    const initialStock = await readProductStock(page, chosen.id);
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

    await expect(page.getByRole("heading", { level: 1, name: /Albarán Nº/ })).toBeVisible();
    await expect(page.locator("header").getByText(/^Pendiente$/i)).toBeVisible();
    await expect(page.locator("table tbody")).toContainText(chosen.name);
    await expect(page.locator("table tfoot")).toContainText(chosen.priceText);

    const latestAfter = await readLatestOrder(page);
    expect(latestAfter?.href, "El pedido creado tiene que ser el más reciente de /pedidos").toBe(
      new URL(orderUrl).pathname,
    );
    expect(latestAfter?.customer).toBe(customer.name);

    expect(await readProductStock(page, chosen.id)).toBe(initialStock - 1);

    await gotoHydrated(page, orderUrl);
    await page.getByRole("button", { name: "Cancelar pedido" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "¿Seguro que quieres cancelar el pedido",
    );
    await page.getByRole("button", { name: "Sí, cancelar pedido" }).click();

    await expect(page.locator("header").getByText(/^Cancelado$/i)).toBeVisible();
    await expect(
      page.getByText("Pedido cancelado: sus unidades volvieron al stock al cancelarlo."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar pedido" })).toHaveCount(0);

    expect(await readProductStock(page, chosen.id)).toBe(initialStock);
  });

  test("rechaza un pedido sin stock suficiente sin guardar nada ni alterar el stock", async ({ page, orderCleanup }) => {
    await login(page);

    const products = await readProductsFromTable(page);
    const validProduct = products.find((product) => product.stock >= 1);
    const overStockProduct = products.find((product) => product.id !== validProduct?.id);
    if (!validProduct || !overStockProduct) {
      throw missingDemoData("hacen falta al menos dos productos, uno de ellos con stock >= 1");
    }

    const validStock = await readProductStock(page, validProduct.id);
    const overStock = await readProductStock(page, overStockProduct.id);
    const latestBefore = await readLatestOrder(page);

    const customer = await openNewOrderWithFirstCustomer(page);

    const line1 = page.getByRole("group", { name: "Línea 1" });
    await line1.getByLabel("Producto").selectOption(validProduct.id);
    await expect(line1).toContainText(validProduct.priceText);
    await line1.getByLabel("Cantidad").fill("1");

    await page.getByRole("button", { name: "Añadir línea" }).click();

    const line2 = page.getByRole("group", { name: "Línea 2" });
    await line2.getByLabel("Producto").selectOption(overStockProduct.id);
    await expect(line2).toContainText(overStockProduct.priceText);
    await line2.getByLabel("Cantidad").fill(String(overStock + 1));

    orderCleanup.watchNewOrder(page, latestBefore, customer.name);
    await page.getByRole("button", { name: "Crear pedido" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText("No hay stock suficiente");
    await expect(page).toHaveURL(/\/pedidos\/nuevo$/);

    expect(await readProductStock(page, validProduct.id)).toBe(validStock);
    expect(await readProductStock(page, overStockProduct.id)).toBe(overStock);
    const latestAfter = await readLatestOrder(page);
    expect(latestAfter?.id ?? null, "No se tiene que haber guardado ningún pedido").toBe(
      latestBefore?.id ?? null,
    );
  });
});
