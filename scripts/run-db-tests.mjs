#!/usr/bin/env node

/**
 * Ejecuta los tests pgTAP de `supabase/tests/*.sql`.
 *
 * - Si Docker está disponible y no se pasa `--no-docker`, delega en
 *   `supabase test db --linked`.
 * - En caso contrario, ejecuta cada archivo con
 *   `supabase db query --linked --output-format json -f <archivo>` y valida
 *   estrictamente la salida TAP (plan 1..N con N > 0, ok 1..N completos,
 *   cero `not ok` y cero diagnósticos de fallo).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TESTS_DIR = resolve(process.cwd(), "supabase/tests");
const PLAN_PATTERN = /^1\.\.(\d+)$/;
const OK_PATTERN = /^ok\s+(\d+)(?:\s+-.*|\s*$)/;
const NOT_OK_PATTERN = /^not ok\b/;
const FAILURE_DIAG_PATTERNS = [
  /^#\s*Failed test\b/i,
  /^#\s*Looks like you failed\b/i,
  /^#\s*Looks like you planned\b/i,
  /^Bail out!/i,
];

/**
 * Lista los archivos `.sql` de `dir` ordenados alfabéticamente.
 * @param {string} dir
 * @returns {string[]}
 */
export function listTestFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((name) => join(dir, name));
}

/**
 * Comprueba si el demonio de Docker responde correctamente.
 * @returns {boolean}
 */
export function isDockerAvailable() {
  const result = spawnSync("docker", ["info"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

/**
 * Extrae las líneas TAP a partir de la salida estándar de `supabase db query`.
 * Admite salida JSON de la CLI (array de filas o `{ rows: [...] }`) y texto plano.
 * @param {string} rawOutput
 * @returns {string[]}
 */
export function extractTapLines(rawOutput) {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray(parsed.rows)
        ? parsed.rows
        : null;

    if (rows !== null) {
      /** @type {string[]} */
      const lines = [];
      for (const row of rows) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const values = Object.values(row);
        const firstValue = values.find((value) => value !== null && value !== undefined);
        if (firstValue === undefined) {
          continue;
        }
        for (const line of String(firstValue).split(/\r?\n/)) {
          const clean = line.trimEnd();
          if (clean.length > 0) {
            lines.push(clean);
          }
        }
      }
      return lines;
    }
  } catch {
    // Fallback a texto plano si la CLI no devolvió JSON.
  }

  /** @type {string[]} */
  const textLines = [];
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^[┌├└─┬┼┴┐┤┘]+$/.test(line)) {
      continue;
    }
    if (line.startsWith("│") && line.endsWith("│")) {
      const cell = line.slice(1, -1).trim();
      if (cell.length > 0) {
        textLines.push(cell);
      }
      continue;
    }
    textLines.push(line);
  }
  return textLines;
}

/**
 * Valida estrictamente una salida TAP.
 * @param {string[]} lines
 * @returns {{ ok: boolean, planned: number, passed: number, errors: string[] }}
 */
export function validateTapOutput(lines) {
  /** @type {string[]} */
  const errors = [];
  /** @type {number[]} */
  const plans = [];
  /** @type {number[]} */
  const okNumbers = [];
  let notOkCount = 0;
  let failureDiagCount = 0;

  for (const line of lines) {
    const planMatch = PLAN_PATTERN.exec(line);
    if (planMatch) {
      plans.push(Number.parseInt(planMatch[1], 10));
      continue;
    }

    if (NOT_OK_PATTERN.test(line)) {
      notOkCount += 1;
      continue;
    }

    if (FAILURE_DIAG_PATTERNS.some((pattern) => pattern.test(line))) {
      failureDiagCount += 1;
      continue;
    }

    const okMatch = OK_PATTERN.exec(line);
    if (okMatch) {
      okNumbers.push(Number.parseInt(okMatch[1], 10));
    }
  }

  let planned = 0;
  if (plans.length === 0) {
    errors.push("Falta la cabecera de plan TAP (1..N).");
  } else if (plans.length > 1) {
    errors.push(`Se encontraron ${plans.length} cabeceras de plan TAP; se esperaba exactamente 1.`);
  } else {
    planned = plans[0];
    if (planned <= 0) {
      errors.push(`El plan TAP debe declarar al menos 1 prueba (recibido: 1..${planned}).`);
    }
  }

  if (notOkCount > 0) {
    errors.push(`Se encontraron ${notOkCount} líneas "not ok".`);
  }

  if (failureDiagCount > 0) {
    errors.push(`Se encontraron ${failureDiagCount} líneas de diagnóstico de fallo en la salida TAP.`);
  }

  if (planned > 0) {
    if (okNumbers.length !== planned) {
      errors.push(`Número de líneas "ok" (${okNumbers.length}) distinto del plan (${planned}).`);
    } else {
      for (let i = 0; i < planned; i += 1) {
        if (okNumbers[i] !== i + 1) {
          errors.push(
            `Numeración TAP incoherente en la posición ${i + 1}: esperado "ok ${i + 1}", recibido "ok ${okNumbers[i]}".`,
          );
          break;
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    planned,
    passed: okNumbers.length,
    errors,
  };
}

/**
 * Ejecuta la suite completa con `supabase test db --linked` (requiere Docker).
 * @returns {number}
 */
function runWithDocker() {
  process.stdout.write("Docker disponible: ejecutando `supabase test db --linked`...\n");
  const result = spawnSync("supabase", ["test", "db", "--linked"], {
    stdio: "inherit",
  });
  if (result.error) {
    process.stderr.write(`Error al lanzar supabase CLI: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

/**
 * Ejecuta cada archivo SQL con `supabase db query --linked -f` y valida TAP.
 * @param {string[]} testFiles
 * @returns {number}
 */
function runWithoutDocker(testFiles) {
  process.stdout.write(
    `Docker no disponible (o --no-docker): ejecutando ${testFiles.length} archivo(s) con \`supabase db query --linked -f\`...\n`,
  );

  let totalPassed = 0;
  /** @type {string[]} */
  const failedFiles = [];

  for (const filePath of testFiles) {
    const relPath = relative(process.cwd(), filePath);
    process.stdout.write(`\n==> ${relPath}\n`);

    const result = spawnSync(
      "supabase",
      ["db", "query", "--linked", "--output-format", "json", "-f", filePath],
      { encoding: "utf8" },
    );

    if (result.error) {
      process.stderr.write(`Error al ejecutar supabase CLI: ${result.error.message}\n`);
      failedFiles.push(relPath);
      continue;
    }

    if (result.status !== 0) {
      if (result.stderr) {
        process.stderr.write(`${result.stderr.trimEnd()}\n`);
      }
      if (result.stdout) {
        process.stderr.write(`${result.stdout.trimEnd()}\n`);
      }
      process.stderr.write(`Fallo al ejecutar ${relPath} (código ${result.status}).\n`);
      failedFiles.push(relPath);
      continue;
    }

    const tapLines = extractTapLines(result.stdout ?? "");
    for (const line of tapLines) {
      process.stdout.write(`${line}\n`);
    }

    const validation = validateTapOutput(tapLines);
    if (!validation.ok) {
      for (const err of validation.errors) {
        process.stderr.write(`ERROR TAP (${relPath}): ${err}\n`);
      }
      failedFiles.push(relPath);
      continue;
    }

    totalPassed += validation.passed;
  }

  if (failedFiles.length > 0) {
    process.stderr.write(
      `\nFallaron ${failedFiles.length} archivo(s) de tests pgTAP: ${failedFiles.join(", ")}\n`,
    );
    return 1;
  }

  process.stdout.write(
    `\nOK: ${totalPassed} pruebas pgTAP superadas en ${testFiles.length} archivo(s).\n`,
  );
  return 0;
}

/**
 * Punto de entrada CLI.
 * @param {string[]} argv
 * @returns {number}
 */
function main(argv) {
  const unknownArgs = argv.filter((arg) => arg !== "--no-docker");
  if (unknownArgs.length > 0) {
    process.stderr.write(
      `Argumentos no reconocidos: ${unknownArgs.join(" ")}\nUso: node scripts/run-db-tests.mjs [--no-docker]\n`,
    );
    return 1;
  }

  const noDocker = argv.includes("--no-docker");
  const testFiles = listTestFiles(TESTS_DIR);
  if (testFiles.length === 0) {
    process.stderr.write(`No se encontraron archivos *.sql en ${TESTS_DIR}.\n`);
    return 1;
  }

  if (!noDocker && isDockerAvailable()) {
    return runWithDocker();
  }

  return runWithoutDocker(testFiles);
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntrypoint) {
  process.exitCode = main(process.argv.slice(2));
}
