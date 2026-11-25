import { expect, test } from "@playwright/test";
import { gotoHydrated, login, readProductsFromTable } from "./helpers";

// Solo lectura: no crea ni cambia datos.
test.describe("Listados paginados y búsqueda", () => {
  test("busca un producto por nombre y vuelve al listado completo", async ({ page }) => {
    await login(page);

    const products = await readProductsFromTable(page);
    const target = products[products.length - 1];

    await page.getByRole("searchbox", { name: "Buscar por nombre o SKU" }).fill(target.name);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/\/productos\?q=/);
    await expect(page.getByRole("status")).toContainText(`con «${target.name}»`);
    await expect(page.locator("table tbody tr").first()).toContainText(target.name);

    await page.getByRole("link", { name: "Quitar búsqueda" }).click();
    await expect(page).toHaveURL(/\/productos$/);
    await expect(page.getByRole("searchbox", { name: "Buscar por nombre o SKU" })).toHaveValue("");
    await expect(page.locator("table tbody tr")).toHaveCount(products.length);
  });

  test("un cursor de pedidos manipulado en la URL se explica sin página de error", async ({ page }) => {
    await login(page);

    const response = await page.goto("/pedidos?antes=basura&antes_id=x", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "El enlace de esta página de pedidos no es válido. Vuelve a la primera página.",
    );

    await page.getByRole("link", { name: "Ir a la primera página" }).click();
    await expect(page).toHaveURL(/\/pedidos$/);
    await gotoHydrated(page, "/pedidos");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });
});
