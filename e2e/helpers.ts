import { expect, type Page } from "@playwright/test";

export type E2ECredentials = {
  email: string;
  password: string;
};

export type ProductRowInfo = {
  id: string;
  name: string;
  priceText: string;
  stock: number;
};

export function getE2ECredentials(): E2ECredentials {
  const email = process.env.E2E_EMAIL?.trim();
  const password = process.env.E2E_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      "Faltan las variables de entorno E2E_EMAIL y E2E_PASSWORD. Defínelas en .env.local o en el entorno antes de ejecutar npm run test:e2e.",
    );
  }

  return { email, password };
}

export async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
}

export async function login(page: Page): Promise<void> {
  const { email, password } = getE2ECredentials();

  await gotoHydrated(page, "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

export async function readProductsFromTable(page: Page): Promise<ProductRowInfo[]> {
  await gotoHydrated(page, "/productos");
  await expect(page.getByRole("heading", { level: 1, name: "Productos" })).toBeVisible();

  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();

  const count = await rows.count();
  const products: ProductRowInfo[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const link = row.locator("td").nth(0).locator("a");
    const href = await link.getAttribute("href");
    const name = (await link.innerText()).trim();
    const priceText = (await row.locator("td").nth(2).innerText()).trim();
    const stockText = (await row.locator("td").nth(3).innerText()).trim();
    const id = href?.replace(/^\/productos\//, "") ?? "";
    const stock = Number.parseInt(stockText, 10);

    if (id && name && Number.isInteger(stock)) {
      products.push({ id, name, priceText, stock });
    }
  }

  return products;
}

export async function readProductStock(page: Page, productId: string): Promise<number> {
  await gotoHydrated(page, "/productos");
  await expect(page.getByRole("heading", { level: 1, name: "Productos" })).toBeVisible();

  const row = page.locator("table tbody tr", {
    has: page.locator(`a[href="/productos/${productId}"]`),
  });
  await expect(row).toHaveCount(1);

  const stockText = (await row.locator("td").nth(3).innerText()).trim();
  const stock = Number.parseInt(stockText, 10);
  expect(Number.isInteger(stock)).toBe(true);
  return stock;
}

export async function readOrderCount(page: Page): Promise<number> {
  await gotoHydrated(page, "/pedidos");
  await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();

  const table = page.locator("table");
  if ((await table.count()) === 0) {
    return 0;
  }

  return table.locator("tbody tr").count();
}

export async function assertNoHorizontalOverflow(page: Page, routeLabel: string): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    scrollWidth,
    `La ruta ${routeLabel} tiene scroll horizontal (${scrollWidth}px > ${clientWidth}px)`,
  ).toBeLessThanOrEqual(clientWidth);
}
