import { expect, test } from "@playwright/test";
import { assertNoHorizontalOverflow, gotoHydrated, login } from "./helpers";

test.describe("Formularios con estado de cliente", () => {
  test("un formulario cancelado tras error de validación sale limpio al volver", async ({ page }) => {
    await login(page);

    await gotoHydrated(page, "/productos");
    await expect(page.getByRole("heading", { level: 1, name: "Productos" })).toBeVisible();

    await page.getByRole("link", { name: "Nuevo producto" }).click();
    await expect(page).toHaveURL(/\/productos\/nuevo$/);
    await expect(page.getByRole("heading", { level: 1, name: "Nuevo producto" })).toBeVisible();

    await page.getByRole("textbox", { name: "Nombre" }).fill("Borrador temporal E2E");
    await page.getByRole("textbox", { name: "SKU" }).fill("TMP-E2E-999");
    await page.getByRole("textbox", { name: "Precio (€)" }).fill("no-es-precio");
    await page.getByRole("button", { name: "Guardar producto" }).click();

    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Nombre" })).toHaveValue("Borrador temporal E2E");
    await expect(page.getByRole("textbox", { name: "Precio (€)" })).toHaveValue("no-es-precio");

    await page.getByRole("link", { name: "Cancelar" }).click();
    await expect(page).toHaveURL(/\/productos$/);
    await expect(page.getByRole("heading", { level: 1, name: "Productos" })).toBeVisible();

    await page.getByRole("link", { name: "Nuevo producto" }).click();
    await expect(page).toHaveURL(/\/productos\/nuevo$/);
    await expect(page.getByRole("heading", { level: 1, name: "Nuevo producto" })).toBeVisible();

    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Nombre" })).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "SKU" })).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "Precio (€)" })).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "Stock", exact: true })).toHaveValue("0");
    await expect(page.getByRole("textbox", { name: "Stock mínimo" })).toHaveValue("0");
  });
});

test.describe("Sin scroll horizontal a 375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("la página de acceso no tiene scroll horizontal a 375 px", async ({ page }) => {
    await gotoHydrated(page, "/login");
    await expect(page.getByRole("heading", { level: 1, name: "Inventa" })).toBeVisible();
    await assertNoHorizontalOverflow(page, "/login");
  });

  test("las rutas privadas y el albarán no tienen scroll horizontal a 375 px", async ({ page }) => {
    await login(page);

    const staticRoutes: ReadonlyArray<{ path: string; heading: string | RegExp }> = [
      { path: "/panel", heading: "Panel" },
      { path: "/productos", heading: "Productos" },
      { path: "/productos/nuevo", heading: "Nuevo producto" },
      { path: "/clientes", heading: "Clientes" },
      { path: "/pedidos", heading: "Pedidos" },
      { path: "/pedidos/nuevo", heading: "Nuevo pedido" },
    ];

    for (const route of staticRoutes) {
      await gotoHydrated(page, route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await assertNoHorizontalOverflow(page, route.path);
    }

    await gotoHydrated(page, "/pedidos");
    await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();

    const firstOrderLink = page.locator("table tbody tr a").first();
    await expect(firstOrderLink).toBeVisible();
    const orderHref = await firstOrderLink.getAttribute("href");
    expect(orderHref, "Hace falta al menos un pedido para comprobar el albarán a 375 px").toBeTruthy();

    await gotoHydrated(page, orderHref ?? "/pedidos");
    await expect(page.getByRole("heading", { level: 1, name: /Albarán Nº/ })).toBeVisible();
    await assertNoHorizontalOverflow(page, orderHref ?? "/pedidos/[id]");
  });
});
