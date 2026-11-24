import { expect, test } from "@playwright/test";
import { gotoHydrated, login, readOrderCount, readProductStock, readProductsFromTable } from "./helpers";

const ORDER_DETAIL_URL = /\/pedidos\/[0-9a-f-]{36}$/;

test.describe("Pedidos y control de stock", () => {
  test("crea un pedido, descuenta el stock, lo cancela y restaura el stock original", async ({ page }) => {
    await login(page);

    const products = await readProductsFromTable(page);
    const chosen = products.find((product) => product.stock >= 2);
    expect(chosen, "Hace falta al menos un producto con stock >= 2 en los datos de prueba").toBeDefined();
    if (!chosen) {
      return;
    }

    const initialStock = chosen.stock;
    let orderUrl: string | null = null;
    let cancelled = false;

    try {
      await gotoHydrated(page, "/pedidos/nuevo");
      await expect(page.getByRole("heading", { level: 1, name: "Nuevo pedido" })).toBeVisible();

      const customerSelect = page.getByLabel("Cliente");
      const firstCustomerValue = await customerSelect
        .locator('option:not([value=""])')
        .first()
        .getAttribute("value");
      expect(firstCustomerValue, "Hace falta al menos un cliente en los datos de prueba").toBeTruthy();
      await customerSelect.selectOption(firstCustomerValue ?? "");

      const line1 = page.getByRole("group", { name: "Línea 1" });
      await line1.getByLabel("Producto").selectOption(chosen.id);
      await expect(line1).toContainText(chosen.priceText);
      await line1.getByLabel("Cantidad").fill("1");

      await page.getByRole("button", { name: "Crear pedido" }).click();

      await expect(page).toHaveURL(ORDER_DETAIL_URL);
      orderUrl = page.url();

      await expect(page.getByRole("heading", { level: 1, name: /Albarán Nº/ })).toBeVisible();
      await expect(page.locator("header").getByText(/^Pendiente$/i)).toBeVisible();
      await expect(page.locator("table tbody")).toContainText(chosen.name);
      await expect(page.locator("table tfoot")).toContainText(chosen.priceText);

      const stockAfterCreate = await readProductStock(page, chosen.id);
      expect(stockAfterCreate).toBe(initialStock - 1);

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
      cancelled = true;

      const stockAfterCancel = await readProductStock(page, chosen.id);
      expect(stockAfterCancel).toBe(initialStock);
    } finally {
      if (orderUrl && !cancelled) {
        await gotoHydrated(page, orderUrl);
        const cancelButton = page.getByRole("button", { name: "Cancelar pedido" });
        if ((await cancelButton.count()) > 0) {
          await cancelButton.click();
          await page.getByRole("button", { name: "Sí, cancelar pedido" }).click();
          await expect(page.locator("header").getByText(/^Cancelado$/i)).toBeVisible();
        }
      }
    }
  });

  test("rechaza un pedido sin stock suficiente sin guardar nada ni alterar el stock", async ({ page }) => {
    await login(page);

    const initialOrderCount = await readOrderCount(page);
    const products = await readProductsFromTable(page);
    const validProduct = products.find((product) => product.stock >= 1);
    const overStockProduct = products.find((product) => product.id !== validProduct?.id) ?? products[0];

    expect(validProduct, "Hace falta al menos un producto con stock >= 1").toBeDefined();
    expect(overStockProduct, "Hace falta al menos un producto en los datos de prueba").toBeDefined();
    if (!validProduct || !overStockProduct) {
      return;
    }

    await gotoHydrated(page, "/pedidos/nuevo");
    await expect(page.getByRole("heading", { level: 1, name: "Nuevo pedido" })).toBeVisible();

    const customerSelect = page.getByLabel("Cliente");
    const firstCustomerValue = await customerSelect
      .locator('option:not([value=""])')
      .first()
      .getAttribute("value");
    expect(firstCustomerValue, "Hace falta al menos un cliente en los datos de prueba").toBeTruthy();
    await customerSelect.selectOption(firstCustomerValue ?? "");

    if (validProduct.id !== overStockProduct.id) {
      const line1 = page.getByRole("group", { name: "Línea 1" });
      await line1.getByLabel("Producto").selectOption(validProduct.id);
      await expect(line1).toContainText(validProduct.priceText);
      await line1.getByLabel("Cantidad").fill("1");

      await page.getByRole("button", { name: "Añadir línea" }).click();

      const line2 = page.getByRole("group", { name: "Línea 2" });
      await line2.getByLabel("Producto").selectOption(overStockProduct.id);
      await expect(line2).toContainText(overStockProduct.priceText);
      await line2.getByLabel("Cantidad").fill(String(overStockProduct.stock + 1));
    } else {
      const line1 = page.getByRole("group", { name: "Línea 1" });
      await line1.getByLabel("Producto").selectOption(overStockProduct.id);
      await expect(line1).toContainText(overStockProduct.priceText);
      await line1.getByLabel("Cantidad").fill(String(overStockProduct.stock + 1));
    }

    await page.getByRole("button", { name: "Crear pedido" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText("No hay stock suficiente");
    await expect(page).toHaveURL(/\/pedidos\/nuevo$/);

    expect(await readProductStock(page, validProduct.id)).toBe(validProduct.stock);
    expect(await readProductStock(page, overStockProduct.id)).toBe(overStockProduct.stock);
    expect(await readOrderCount(page)).toBe(initialOrderCount);
  });
});
