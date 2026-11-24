import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local") && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Si .env.local no se puede leer, las variables pueden venir del entorno.
  }
}

const isCI = Boolean(process.env.CI);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const port = new URL(baseURL).port || "3000";
const customCommand = process.env.PLAYWRIGHT_WEB_SERVER_CMD;
const webServerCommand =
  customCommand ??
  (isCI
    ? `npm run start -- --hostname 127.0.0.1 --port ${port}`
    : `npm run dev -- --hostname 127.0.0.1 --port ${port}`);

const shouldStartWebServer = !process.env.PLAYWRIGHT_BASE_URL || Boolean(customCommand);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // En CI no hay informe HTML ni trazas: guardan el valor de cada `fill` (también la contraseña)
  // y las cookies de sesión, y el repositorio es público. Los logs de GitHub ocultan los secretos.
  reporter: isCI
    ? [["github"], ["list"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: isCI ? "off" : "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: shouldStartWebServer
    ? {
        command: webServerCommand,
        url: new URL("/login", baseURL).toString(),
        reuseExistingServer: !isCI && !customCommand,
        timeout: 120_000,
      }
    : undefined,
});
