import { expect, type Page, type Request, type Route } from "@playwright/test";
import {
  login,
  missingDemoData,
  openNewOrderWithFirstCustomer,
  readLatestOrder,
  readOrdersSince,
  readProductStock,
  readProductsFromTable,
  test,
  type ProductRowInfo,
} from "./helpers";

const ORDER_DETAIL_URL = /\/pedidos\/[0-9a-f-]{36}$/;
const NEW_ORDER_PATH = "/pedidos/nuevo";

function isCreateOrderPost(request: Request): boolean {
  return (
    request.method() === "POST" &&
    request.headers()["next-action"] !== undefined &&
    new URL(request.url()).pathname === NEW_ORDER_PATH
  );
}

/** Un producto con stock de la primera página de /productos. */
async function productWithStock(page: Page): Promise<ProductRowInfo> {
  const products = await readProductsFromTable(page);
  const product = products.find((candidate) => candidate.stock >= 1);
  if (!product) {
    throw missingDemoData("hace falta al menos un producto con stock >= 1");
  }
  return product;
}

/** Abre el formulario con el primer cliente y una línea de 1 unidad del producto. Devuelve el cliente. */
async function prepareOrder(page: Page, product: ProductRowInfo): Promise<string> {
  const customer = await openNewOrderWithFirstCustomer(page);
  const line1 = page.getByRole("group", { name: "Línea 1" });
  await line1.getByLabel("Producto").selectOption(product.id);
  await expect(line1).toContainText(product.priceText);
  await line1.getByLabel("Cantidad").fill("1");
  return customer.name;
}

test.describe("Pedidos idempotentes (D30)", () => {
  test("si se pierde la respuesta, volver a pulsar «Crear pedido» no crea otro pedido ni descuenta el stock otra vez", async ({
    page,
    orderCleanup,
  }) => {
    await login(page);
    const product = await productWithStock(page);
    const initialStock = await readProductStock(page, product.id);
    const latestBefore = await readLatestOrder(page);
    const customer = await prepareOrder(page, product);

    // El primer envío llega al servidor (el pedido se crea), pero el navegador no recibe la
    // respuesta: como un corte de red justo después de enviar.
    let posts = 0;
    await page.route(`**${NEW_ORDER_PATH}`, async (route: Route) => {
      if (!isCreateOrderPost(route.request())) {
        await route.fallback();
        return;
      }
      posts += 1;
      if (posts === 1) {
        await route.fetch({ maxRedirects: 0 });
        await route.abort("failed");
        return;
      }
      await route.fallback();
    });

    orderCleanup.watchNewOrder(page, latestBefore, customer);
    await page.getByRole("button", { name: "Crear pedido" }).click();

    await expect(page.locator("main").getByRole("alert")).toContainText(
      "No hemos recibido respuesta y no sabemos si el pedido se ha guardado.",
    );
    await expect(page).toHaveURL(/\/pedidos\/nuevo$/);
    const line1 = page.getByRole("group", { name: "Línea 1" });
    await expect(line1.getByLabel("Producto")).toHaveValue(product.id);
    await expect(line1.getByLabel("Cantidad")).toHaveValue("1");

    // En otra pestaña: el primer envío sí guardó el pedido.
    const other = await page.context().newPage();
    const afterLostResponse = await readOrdersSince(other, latestBefore);
    await other.close();
    expect(afterLostResponse, "El primer envío tenía que haber creado el pedido").toHaveLength(1);

    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page).toHaveURL(ORDER_DETAIL_URL);
    const orderPath = new URL(page.url()).pathname;
    orderCleanup.track(orderPath);
    await page.unroute(`**${NEW_ORDER_PATH}`);

    expect(posts, "Se tienen que haber enviado dos peticiones").toBe(2);
    expect(orderPath, "El reintento devuelve el pedido que creó el primer envío").toBe(afterLostResponse[0].href);

    const created = await readOrdersSince(page, latestBefore);
    expect(created.map((order) => order.href)).toEqual([orderPath]);
    expect(await readProductStock(page, product.id)).toBe(initialStock - 1);
  });

  test("un doble clic y la misma petición enviada otra vez dan un solo pedido y el stock baja una vez", async ({
    page,
    orderCleanup,
  }) => {
    await login(page);
    const product = await productWithStock(page);
    const initialStock = await readProductStock(page, product.id);
    const latestBefore = await readLatestOrder(page);
    const customer = await prepareOrder(page, product);

    const submissions: Request[] = [];
    page.on("request", (request) => {
      if (isCreateOrderPost(request)) {
        submissions.push(request);
      }
    });

    orderCleanup.watchNewOrder(page, latestBefore, customer);
    await page.getByRole("button", { name: "Crear pedido" }).dblclick();
    await expect(page).toHaveURL(ORDER_DETAIL_URL);
    const orderPath = new URL(page.url()).pathname;
    orderCleanup.track(orderPath);
    expect(submissions.length, "El formulario tiene que haber enviado al menos una petición").toBeGreaterThanOrEqual(1);

    // La misma petición (mismas cabeceras, cookies y cuerpo, con la misma clave) otra vez.
    const replay = await page.request.fetch(submissions[0], { maxRedirects: 0 });
    expect(replay.status(), "La Server Action responde a la petición repetida").toBeLessThan(400);
    expect(replay.headers()["x-action-redirect"] ?? "", "La petición repetida redirige al mismo pedido").toContain(
      orderPath,
    );

    const created = await readOrdersSince(page, latestBefore);
    expect(created.map((order) => order.href)).toEqual([orderPath]);
    expect(await readProductStock(page, product.id)).toBe(initialStock - 1);
  });

  test("si se pierde la respuesta y luego cambia el pedido, avisa de que ya se guardó y el siguiente envío crea otro", async ({
    page,
    orderCleanup,
  }) => {
    await login(page);
    const product = await productWithStock(page);
    if (product.stock < 3) {
      throw missingDemoData("hace falta un producto con stock >= 3");
    }
    const initialStock = await readProductStock(page, product.id);
    const latestBefore = await readLatestOrder(page);
    const customer = await prepareOrder(page, product);

    let posts = 0;
    await page.route(`**${NEW_ORDER_PATH}`, async (route: Route) => {
      if (!isCreateOrderPost(route.request())) {
        await route.fallback();
        return;
      }
      posts += 1;
      if (posts === 1) {
        await route.fetch({ maxRedirects: 0 });
        await route.abort("failed");
        return;
      }
      await route.fallback();
    });

    orderCleanup.watchNewOrder(page, latestBefore, customer);
    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("No hemos recibido respuesta");

    // Con la misma clave y otra cantidad, la base de datos no crea un segundo pedido sin avisar.
    const line1 = page.getByRole("group", { name: "Línea 1" });
    await line1.getByLabel("Cantidad").fill("2");
    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Con este envío ya se guardó un pedido con otros datos.",
    );
    await expect(page).toHaveURL(/\/pedidos\/nuevo$/);

    const other = await page.context().newPage();
    const afterReuse = await readOrdersSince(other, latestBefore);
    await other.close();
    expect(afterReuse, "Solo existe el pedido del primer envío").toHaveLength(1);
    orderCleanup.track(afterReuse[0].href);

    // Avisada, la persona vuelve a enviar: ahora es otro pedido, con una clave nueva.
    await page.getByRole("button", { name: "Crear pedido" }).click();
    await expect(page).toHaveURL(ORDER_DETAIL_URL);
    const secondPath = new URL(page.url()).pathname;
    orderCleanup.track(secondPath);
    await page.unroute(`**${NEW_ORDER_PATH}`);

    expect(posts).toBe(3);
    expect(secondPath).not.toBe(afterReuse[0].href);
    const created = await readOrdersSince(page, latestBefore);
    expect(created.map((order) => order.href)).toEqual([secondPath, afterReuse[0].href]);
    expect(await readProductStock(page, product.id)).toBe(initialStock - 3);
  });
});
