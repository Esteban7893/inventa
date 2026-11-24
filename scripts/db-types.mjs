#!/usr/bin/env node

/**
 * Regenera `src/lib/database.types.ts` con `supabase gen types typescript`.
 *
 * - Por defecto lee el esquema del proyecto de producción (`inventa`). Para otro proyecto:
 *   `SUPABASE_PROJECT_REF=<ref> npm run db:types`.
 * - Solo escribe el archivo si la CLI termina bien y devuelve tipos: si falla (sin sesión,
 *   ref equivocado, sin red), el archivo actual se queda como estaba.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_PROJECT_REF = "uqupgywhmmdpjjenxywb";
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const OUTPUT = resolve(process.cwd(), "src/lib/database.types.ts");

function main() {
  const ref = process.env.SUPABASE_PROJECT_REF || DEFAULT_PROJECT_REF;
  if (!PROJECT_REF_PATTERN.test(ref)) {
    process.stderr.write(`SUPABASE_PROJECT_REF no parece un ref de Supabase (20 letras o cifras): ${ref}\n`);
    return 1;
  }

  const result = spawnSync("supabase", ["gen", "types", "typescript", "--project-id", ref], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.error) {
    process.stderr.write(`Error al lanzar supabase CLI: ${result.error.message}\n`);
    return 1;
  }
  if (result.status !== 0) {
    process.stderr.write(`supabase gen types ha fallado (código ${result.status}); no se ha tocado ${OUTPUT}.\n`);
    return 1;
  }
  if (!result.stdout.includes("export type Database")) {
    process.stderr.write(`La salida de supabase gen types no contiene tipos; no se ha tocado ${OUTPUT}.\n`);
    return 1;
  }

  writeFileSync(OUTPUT, result.stdout);
  process.stdout.write(`Tipos del proyecto ${ref} escritos en ${OUTPUT}.\n`);
  return 0;
}

process.exitCode = main();
