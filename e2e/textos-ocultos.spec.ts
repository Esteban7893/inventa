import { test as base, expect, type Page } from "@playwright/test";
import { assertNoHorizontalOverflow, gotoHydrated, login, retryCleanup, withCleanupPage } from "./helpers";

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

const test = base.extend<{ recordCleanup: RecordCleanup }>({
  recordCleanup: async ({ page }, provide) => {
    const cleanup = new RecordCleanup();
    await provide(cleanup);
    await cleanup.run(page);
  },
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
      // Se busca por el sufijo (corto y único): la página repite lo buscado fuera de la tabla, y
      // ahí la palabra larga del nombre la ensancharía por otro motivo que este test no mide.
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
