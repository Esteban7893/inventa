import { test as base, expect, type Page } from "@playwright/test";

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

export type CustomerOption = {
  id: string;
  name: string;
};

export type OrderRowInfo = {
  id: string;
  href: string;
  customer: string;
};

const ORDER_HREF = /^\/pedidos\/([0-9a-f-]{36})$/;

/** Error claro (en vez de un timeout) cuando el usuario E2E no tiene los datos que necesitan los tests. */
export function missingDemoData(what: string): Error {
  return new Error(
    `Faltan datos de demostración del usuario E2E: ${what}. ` +
      "Carga los datos de demostración (supabase/seed_demo.sql, ver README) antes de ejecutar npm run test:e2e.",
  );
}

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

  const panelHeading = page.getByRole("heading", { level: 1, name: "Panel" });
  const loginError = page.locator("main").getByRole("alert");
  await expect(panelHeading.or(loginError).first()).toBeVisible({ timeout: 15_000 });
  if (await loginError.isVisible()) {
    throw new Error(
      `No se ha podido iniciar sesión con E2E_EMAIL y E2E_PASSWORD (la app responde: "${(await loginError.innerText()).trim()}"). ` +
        "Revisa las variables y que el usuario exista en Supabase.",
    );
  }

  await expect(page).toHaveURL(/\/panel$/);
  await page.waitForLoadState("networkidle");
}

/** Productos de la primera página del listado (la que se ve al entrar en /productos). */
export async function readProductsFromTable(page: Page): Promise<ProductRowInfo[]> {
  await gotoHydrated(page, "/productos");
  await expect(page.getByRole("heading", { level: 1, name: "Productos" })).toBeVisible();

  const rows = page.locator("table tbody tr");
  const count = await rows.count();
  if (count === 0) {
    throw missingDemoData("no hay ningún producto");
  }

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

/** Stock leído de la ficha del producto: no depende de en qué página del listado salga. */
export async function readProductStock(page: Page, productId: string): Promise<number> {
  await gotoHydrated(page, `/productos/${productId}`);
  const stockField = page.getByRole("textbox", { name: "Stock", exact: true });
  await expect(stockField).toBeVisible();

  const stock = Number.parseInt(await stockField.inputValue(), 10);
  expect(Number.isInteger(stock), `El stock de /productos/${productId} no es un número entero`).toBe(true);
  return stock;
}

/** Abre /pedidos/nuevo y elige el primer cliente. Falla con un mensaje claro si no hay clientes o productos. */
export async function openNewOrderWithFirstCustomer(page: Page): Promise<CustomerOption> {
  await gotoHydrated(page, "/pedidos/nuevo");
  await expect(page.getByRole("heading", { level: 1, name: "Nuevo pedido" })).toBeVisible();

  const customerSelect = page.getByLabel("Cliente");
  if ((await customerSelect.count()) === 0) {
    throw missingDemoData("el formulario de pedido no se puede usar sin clientes y productos");
  }

  const firstOption = customerSelect.locator('option:not([value=""])').first();
  if ((await firstOption.count()) === 0) {
    throw missingDemoData("no hay ningún cliente");
  }

  const id = (await firstOption.getAttribute("value")) ?? "";
  const name = (await firstOption.innerText()).trim();
  await customerSelect.selectOption(id);
  return { id, name };
}

/**
 * El pedido más reciente, o `null` si no hay ninguno. `/pedidos` se ordena por fecha de
 * creación descendente, así que un pedido nuevo sale siempre el primero, también cuando el
 * listado se pagine.
 */
export async function readLatestOrder(page: Page): Promise<OrderRowInfo | null> {
  await gotoHydrated(page, "/pedidos");
  await expect(page.getByRole("heading", { level: 1, name: "Pedidos" })).toBeVisible();

  const firstRow = page.locator("table tbody tr").first();
  if ((await firstRow.count()) === 0) {
    return null;
  }

  const href = (await firstRow.locator("a").first().getAttribute("href")) ?? "";
  const match = ORDER_HREF.exec(href);
  if (!match) {
    throw new Error(`El primer pedido de /pedidos no enlaza a su albarán (href: "${href}")`);
  }

  const customer = (await firstRow.locator("td").nth(2).innerText()).trim();
  return { id: match[1], href, customer };
}

/** Cancela el pedido si sigue pendiente. Devuelve `true` si lo ha cancelado. */
export async function cancelOrderIfPending(page: Page, orderHref: string): Promise<boolean> {
  await gotoHydrated(page, orderHref);
  await expect(page.getByRole("heading", { level: 1, name: /Albarán Nº/ })).toBeVisible();

  const cancelButton = page.getByRole("button", { name: "Cancelar pedido" });
  if ((await cancelButton.count()) === 0) {
    return false;
  }

  await cancelButton.click();
  await page.getByRole("button", { name: "Sí, cancelar pedido" }).click();
  await expect(page.locator("header").getByText(/^Cancelado$/i)).toBeVisible();
  return true;
}

/**
 * Lleva la cuenta de los pedidos que puede haber creado un test y, al terminar, cancela los
 * que sigan pendientes. Se ejecuta como teardown del fixture, que Playwright corre con su
 * propio tiempo también cuando el test falla a medias o se pasa de tiempo.
 */
export class OrderCleanup {
  private readonly hrefs = new Set<string>();
  private watched: { latestBeforeId: string | null; customer: string } | null = null;
  private submission: Promise<void> = Promise.resolve();

  /**
   * Llamar justo antes de enviar el formulario, con el pedido más reciente antes del envío.
   * Espera también a que termine la Server Action del envío, para no buscar el pedido antes
   * de que exista.
   */
  watchNewOrder(page: Page, latestBefore: OrderRowInfo | null, customer: string): void {
    this.watched = { latestBeforeId: latestBefore?.id ?? null, customer };
    this.submission = page
      .waitForRequest(
        (request) =>
          request.method() === "POST" &&
          request.headers()["next-action"] !== undefined &&
          new URL(request.url()).pathname === "/pedidos/nuevo",
        { timeout: 15_000 },
      )
      .then((request) => request.response())
      .then(
        () => undefined,
        () => undefined,
      );
  }

  track(orderHref: string): void {
    this.hrefs.add(new URL(orderHref, "http://e2e.invalid").pathname);
  }

  async run(page: Page): Promise<void> {
    if (this.watched) {
      await this.submission;
      // Por si el pedido llegó a crearse pero el test falló antes de leer su URL.
      const latest = await readLatestOrder(page);
      if (latest && latest.id !== this.watched.latestBeforeId && latest.customer === this.watched.customer) {
        this.hrefs.add(latest.href);
      }
    }

    const failed: string[] = [];
    for (const href of this.hrefs) {
      try {
        await cancelOrderIfPending(page, href);
      } catch {
        failed.push(href);
      }
    }

    if (failed.length > 0) {
      throw new Error(
        `No se han podido cancelar pedidos creados por los tests E2E: ${failed.join(", ")}. Cancélalos a mano desde la app.`,
      );
    }
  }
}

export const test = base.extend<{ orderCleanup: OrderCleanup }>({
  orderCleanup: async ({ page }, provide) => {
    const cleanup = new OrderCleanup();
    await provide(cleanup);
    await cleanup.run(page);
  },
});

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
