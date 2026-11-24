import { expect, test } from "@playwright/test";
import { gotoHydrated, login } from "./helpers";

test.describe("Acceso y protección de rutas", () => {
  test("redirige a /login al visitar rutas privadas sin sesión", async ({ page }) => {
    const privateRoutes = ["/panel", "/productos", "/clientes", "/pedidos"];

    for (const route of privateRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { level: 1, name: "Inventa" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Iniciar sesión" })).toBeVisible();
    }
  });

  test("muestra un error en español al intentar entrar con credenciales inválidas", async ({ page }) => {
    await gotoHydrated(page, "/login");
    await page.getByLabel("Email").fill("no-existe@ejemplo.test");
    await page.getByLabel("Contraseña").fill("clave-incorrecta-e2e");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "El email o la contraseña no son correctos.",
    );
  });

  test("inicia sesión con el usuario de pruebas y muestra los datos del panel", async ({ page }) => {
    await login(page);

    await expect(page.getByText(/Ingresos de /i)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Stock bajo mínimo" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Últimos pedidos" })).toBeVisible();
  });
});
