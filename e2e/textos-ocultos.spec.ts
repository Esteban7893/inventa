import { test as base, expect, type Page } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  gotoHydrated,
  login,
  missingDemoData,
  retryCleanup,
  withCleanupPage,
} from "./helpers";

type TemporaryKind = "cliente" | "producto";

const LISTS: Record<TemporaryKind, { path: string; deleteLabel: string }> = {
  cliente: { path: "/clientes", deleteLabel: "Borrar cliente" },
  producto: { path: "/productos", deleteLabel: "Borrar producto" },
};

/** Enlaces de las fichas cuyo nombre es exactamente `name` (buscando por nombre, no por id). */
async function findRecordHrefs(page: Page, kind: TemporaryKind, name: string): Promise<string[]> {
  const { path } = LISTS[kind];
  await gotoHydrated(page, `${path}?q=${encodeURIComponent(name)}`);
  const links = page.locator("table tbody tr td:first-child a");
  const hrefs: string[] = [];
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    const href = await link.getAttribute("href");
    if (href && (await link.innerText()).trim() === name) {
      hrefs.push(href);
    }
  }
  return hrefs;
}

/** Borra las fichas con ese nombre exacto y comprueba que no queda ninguna. Se puede repetir. */
async function deleteRecords(page: Page, kind: TemporaryKind, name: string): Promise<void> {
  const { path, deleteLabel } = LISTS[kind];
  for (const href of await findRecordHrefs(page, kind, name)) {
    await gotoHydrated(page, href);
    await page.getByRole("button", { name: deleteLabel }).click();
    await page.getByRole("button", { name: "Sí, borrar" }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  if ((await findRecordHrefs(page, kind, name)).length > 0) {
    throw new Error(`Sigue habiendo ${kind} «${name}»`);
  }
}

/**
 * Borra al terminar los clientes y productos temporales que haya creado el test, también si
 * falla a medias o se pasa de tiempo: en una página propia (el cuerpo abandonado de un test
 * cortado por tiempo sigue navegando en la suya) y con reintentos. Los busca por nombre: el
 * alta redirige al listado y el test puede fallar antes de leer el id.
 */
class RecordCleanup {
  private readonly records: Array<{ kind: TemporaryKind; name: string }> = [];

  track(kind: TemporaryKind, name: string): void {
    this.records.push({ kind, name });
  }

  async run(page: Page): Promise<void> {
    const left = await withCleanupPage(page, async (cleanupPage) => {
      const notDeleted: string[] = [];
      for (const { kind, name } of this.records) {
        if (!(await retryCleanup(() => deleteRecords(cleanupPage, kind, name)))) {
          notDeleted.push(`${kind} «${name}»`);
        }
      }
      return notDeleted;
    });

    if (left.length > 0) {
      throw new Error(`No se han podido borrar datos creados por los tests E2E: ${left.join(", ")}. Bórralos a mano desde la app.`);
    }
  }
}

// La limpieza tiene su propio tiempo (no el que le quede al test): un test que acaba justo
// antes de su límite también tiene que poder borrar lo que ha creado.
const test = base.extend<{ recordCleanup: RecordCleanup }>({
  recordCleanup: [
    async ({ page }, provide) => {
      const cleanup = new RecordCleanup();
      await provide(cleanup);
      await cleanup.run(page);
    },
    { timeout: 60_000 },
  ],
});

test.describe("Sin scroll horizontal a 375 px con celdas vacías", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  // Los datos de demostración tienen teléfono y SKU en todas las filas: el test crea un cliente
  // sin teléfono y un producto sin SKU (y bajo mínimo, para que salga en el panel). Sus nombres
  // empiezan por «ZZ» para quedar al final de los listados y no cambiar lo que leen otros tests.
  test("los textos ocultos de las celdas vacías no ensanchan la página", async ({ page, recordCleanup }) => {
    await login(page);

    const suffix = Date.now().toString(36);
    const customerName = `ZZ-E2E sin telefono ${suffix}`;
    // Una palabra larga que no se parte empuja la columna SKU fuera de los 375 px, como haría
    // un nombre real largo; con un nombre corto, el texto oculto de esa celda cae dentro.
    const productName = `ZZ-E2E ProductoSinSKUConUnNombreMuyLargoQueNoSePuedePartir ${suffix}`;

    await gotoHydrated(page, "/clientes/nuevo");
    await page.getByRole("textbox", { name: "Nombre" }).fill(customerName);
    recordCleanup.track("cliente", customerName);
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    await expect(page).toHaveURL(/\/clientes$/);

    await gotoHydrated(page, "/productos/nuevo");
    await page.getByRole("textbox", { name: "Nombre" }).fill(productName);
    await page.getByRole("textbox", { name: "Precio (€)" }).fill("1");
    await page.getByRole("textbox", { name: "Stock", exact: true }).fill("0");
    await page.getByRole("textbox", { name: "Stock mínimo" }).fill("1000000000");
    recordCleanup.track("producto", productName);
    await page.getByRole("button", { name: "Guardar producto" }).click();
    await expect(page).toHaveURL(/\/productos$/);

    const checks: ReadonlyArray<{ path: string; heading: string; row: string; hidden: string }> = [
      // Se busca por el sufijo (corto y único) para medir solo los textos ocultos: la palabra larga
      // repetida fuera de la tabla la mide el test de palabras largas de abajo.
      { path: `/clientes?q=${suffix}`, heading: "Clientes", row: customerName, hidden: "Sin teléfono" },
      { path: `/productos?q=${suffix}`, heading: "Productos", row: productName, hidden: "Sin SKU" },
      { path: "/panel", heading: "Panel", row: productName, hidden: "Sin SKU" },
    ];

    for (const check of checks) {
      await gotoHydrated(page, check.path);
      await expect(page.getByRole("heading", { level: 1, name: check.heading })).toBeVisible();
      const row = page.locator("table tbody tr", { hasText: check.row });
      await expect(row, `${check.path} no muestra la fila «${check.row}»`).toHaveCount(1);
      await expect(row.getByText(check.hidden, { exact: true })).toHaveCount(1);
      await assertNoHorizontalOverflow(page, check.path, { soft: true });
    }
  });
});

test.describe("Sin scroll horizontal a 375 px con palabras largas", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  // Un nombre, un email o una búsqueda sin espacios (64 caracteres seguidos) que la página repite
  // fuera de las tablas: títulos, estados vacíos, líneas de estado, confirmaciones y el albarán.
  // Los nombres caben en la búsqueda (100 caracteres), que es como la limpieza los encuentra.
  test("las palabras largas se parten en vez de ensanchar la página", async ({ page, recordCleanup }) => {
    // Recorre once páginas: el triple del tiempo normal, para no quedarse corto con la base remota.
    test.slow();
    await login(page);

    const suffix = Date.now().toString(36);
    const customerWord = "ClienteConUnNombreMuyLargoSinEspaciosParaProbarElAnchoDeLaPagina";
    const productWord = "ProductoConUnNombreMuyLargoSinEspaciosParaProbarElAnchoDeLaFicha";
    const customerName = `ZZ-E2E ${customerWord} ${suffix}`;
    const productName = `ZZ-E2E ${productWord} ${suffix}`;
    const email = `zz.e2e.correo.electronico.muy.largo.sin.espacios.${suffix}@ejemplo-largo.test`;
    const missingWord = `BusquedaSinResultadosConUnaPalabraMuyLargaSinNingunEspacio${suffix}`;

    await gotoHydrated(page, "/clientes/nuevo");
    await page.getByRole("textbox", { name: "Nombre" }).fill(customerName);
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    recordCleanup.track("cliente", customerName);
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    await expect(page).toHaveURL(/\/clientes$/);

    // Sin stock: ningún otro test lo elegiría para un pedido si la limpieza fallara.
    await gotoHydrated(page, "/productos/nuevo");
    await page.getByRole("textbox", { name: "Nombre" }).fill(productName);
    await page.getByRole("textbox", { name: "Precio (€)" }).fill("1");
    await page.getByRole("textbox", { name: "Stock", exact: true }).fill("0");
    await page.getByRole("textbox", { name: "Stock mínimo" }).fill("0");
    recordCleanup.track("producto", productName);
    await page.getByRole("button", { name: "Guardar producto" }).click();
    await expect(page).toHaveURL(/\/productos$/);

    const searches: ReadonlyArray<{ path: string; echo: string }> = [
      { path: `/clientes?q=${missingWord}`, echo: `Ningún cliente coincide con «${missingWord}».` },
      { path: `/productos?q=${missingWord}`, echo: `Ningún producto coincide con «${missingWord}».` },
      { path: `/clientes?q=${customerWord}`, echo: `1 cliente con «${customerWord}»` },
      { path: `/clientes?q=${encodeURIComponent(email)}`, echo: `1 cliente con «${email}»` },
      { path: `/productos?q=${productWord}`, echo: `1 producto con «${productWord}»` },
    ];
    for (const search of searches) {
      await gotoHydrated(page, search.path);
      await expect(page.getByText(search.echo, { exact: true })).toBeVisible();
      await assertNoHorizontalOverflow(page, search.path, { soft: true });
    }

    const records: ReadonlyArray<{ kind: TemporaryKind; name: string; word: string }> = [
      { kind: "cliente", name: customerName, word: customerWord },
      { kind: "producto", name: productName, word: productWord },
    ];
    for (const { kind, name, word } of records) {
      const { path, deleteLabel } = LISTS[kind];
      await gotoHydrated(page, `${path}?q=${word}`);
      await page.getByRole("link", { name, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page, `ficha de ${kind}`, { soft: true });
      // La confirmación repite el nombre; se abre y se cierra sin borrar.
      await page.getByRole("button", { name: deleteLabel }).click();
      await expect(page.getByRole("alert").filter({ hasText: "¿Seguro que quieres borrar" })).toContainText(name);
      await assertNoHorizontalOverflow(page, `confirmación de borrado de ${kind}`, { soft: true });
      await page.getByRole("button", { name: "No, conservarlo" }).click();
    }

    await gotoHydrated(page, "/pedidos/nuevo");
    await page.getByRole("combobox", { name: "Cliente" }).selectOption({ label: customerName });
    await page.getByRole("combobox", { name: "Producto" }).selectOption({ label: `${productName} (agotado)` });
    await assertNoHorizontalOverflow(page, "/pedidos/nuevo", { soft: true });

    // Albarán: un pedido con el cliente temporal no se podría borrar (ni el cliente con él), así
    // que se usa un pedido de los datos de demostración y se escribe el nombre y el email largos
    // en el bloque del destinatario, solo en esta página del navegador.
    await gotoHydrated(page, "/pedidos");
    const orderHref = await page.locator("table tbody tr td:first-child a").first().getAttribute("href");
    if (!orderHref) {
      throw missingDemoData("no hay ningún pedido");
    }
    await gotoHydrated(page, orderHref);
    const recipient = page.getByRole("region", { name: "Destinatario" }).locator("p");
    await recipient.nth(0).evaluate((element, text) => {
      element.textContent = text;
    }, customerName);
    await recipient.nth(1).evaluate((element, text) => {
      element.textContent = text;
    }, email);
    await expect(recipient.nth(0)).toHaveText(customerName);
    await assertNoHorizontalOverflow(page, "albarán con un destinatario largo", { soft: true });
  });
});
