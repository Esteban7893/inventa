import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkTestFileSource,
  extractTapLines,
  listTestFiles,
  validateTapOutput,
} from "./run-db-tests.mjs";

const VALID_SOURCE = `-- comentario
begin;
create function pg_temp.run_tests() returns setof text language plpgsql as $$
begin
  return next extensions.plan(1);
  return next extensions.ok(true, 'uno');
  return query select * from extensions.finish();
end;
$$;
select * from pg_temp.run_tests();
rollback;
`;

/** @param {string[]} lines */
const cliJson = (lines) =>
  JSON.stringify({
    boundary: "x",
    rows: lines.map((line) => ({ run_tests: line })),
    warning: "untrusted",
  });

describe("checkTestFileSource", () => {
  it("acepta un archivo begin … plan … finish … rollback", () => {
    expect(checkTestFileSource(VALID_SOURCE)).toEqual([]);
  });

  it("rechaza un archivo que no empieza por begin", () => {
    expect(checkTestFileSource(VALID_SOURCE.replace("begin;\ncreate", "create"))).toContain(
      "El archivo tiene que empezar por `begin;`.",
    );
  });

  it("rechaza un archivo que no termina en rollback", () => {
    expect(checkTestFileSource(VALID_SOURCE.replace("rollback;", ""))).toContain(
      "El archivo tiene que terminar en `rollback;` para no dejar datos.",
    );
  });

  it("rechaza un archivo con commit", () => {
    expect(checkTestFileSource(VALID_SOURCE.replace("rollback;", "commit;\nrollback;"))).toContain(
      "El archivo no puede contener `commit`.",
    );
  });

  it("rechaza un archivo sin finish()", () => {
    expect(
      checkTestFileSource(VALID_SOURCE.replace("return query select * from extensions.finish();", "")),
    ).toContain("El archivo tiene que llamar a `finish()`.");
  });

  it("rechaza un archivo sin plan(N)", () => {
    expect(checkTestFileSource(VALID_SOURCE.replace("extensions.plan(1)", "extensions.no_plan()"))).toContain(
      "El archivo tiene que declarar el número de pruebas con `plan(N)`.",
    );
  });

  it("ignora las palabras clave que solo aparecen en comentarios", () => {
    const source = `-- aquí no hay commit\n${VALID_SOURCE}-- ni finish()\n`;
    expect(checkTestFileSource(source)).toEqual([]);
  });

  it("rechaza un archivo vacío", () => {
    expect(checkTestFileSource("")).toHaveLength(4);
  });
});

describe("extractTapLines", () => {
  it("lee las filas del JSON de supabase db query y separa los diagnósticos", () => {
    expect(extractTapLines(cliJson(["1..1", "not ok 1 - uno\n# Failed test 1"]))).toEqual([
      "1..1",
      "not ok 1 - uno",
      "# Failed test 1",
    ]);
  });

  it("devuelve una lista vacía si la salida está vacía", () => {
    expect(extractTapLines("")).toEqual([]);
    expect(extractTapLines(cliJson([]))).toEqual([]);
  });
});

describe("validateTapOutput", () => {
  it("aprueba un plan completo sin fallos", () => {
    expect(validateTapOutput(["1..2", "ok 1 - a", "ok 2 - b"])).toEqual({
      ok: true,
      planned: 2,
      passed: 2,
      errors: [],
    });
  });

  it("falla si no hay salida (por ejemplo, el último select no devolvió filas)", () => {
    expect(validateTapOutput([]).ok).toBe(false);
  });

  it("falla con una línea not ok", () => {
    expect(validateTapOutput(["1..2", "ok 1 - a", "not ok 2 - b"]).ok).toBe(false);
  });

  it("falla si se ejecutaron menos pruebas de las planeadas", () => {
    expect(validateTapOutput(["1..3", "ok 1 - a", "ok 2 - b"]).ok).toBe(false);
  });

  it("falla con el diagnóstico de finish() aunque las líneas ok cuadren", () => {
    expect(validateTapOutput(["1..1", "ok 1 - a", "# Looks like you planned 2 tests but ran 1"]).ok).toBe(
      false,
    );
  });

  it("falla con un plan de 0 pruebas o con dos planes", () => {
    expect(validateTapOutput(["1..0"]).ok).toBe(false);
    expect(validateTapOutput(["1..1", "ok 1 - a", "1..1"]).ok).toBe(false);
  });

  it("falla si la numeración no es 1..N", () => {
    expect(validateTapOutput(["1..2", "ok 1 - a", "ok 1 - b"]).ok).toBe(false);
  });

  it("falla con pruebas saltadas (# SKIP)", () => {
    expect(validateTapOutput(["1..2", "ok 1 - a", "ok 2 - # SKIP sin datos"]).ok).toBe(false);
  });

  it("falla con Bail out!", () => {
    expect(validateTapOutput(["1..1", "Bail out! sin conexión"]).ok).toBe(false);
  });
});

describe("listTestFiles", () => {
  /** @type {string | undefined} */
  let dir;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("ordena los .sql, ignora los ocultos y marca como error cualquier otra entrada", () => {
    dir = mkdtempSync(join(tmpdir(), "inventa-db-tests-"));
    writeFileSync(join(dir, "02_b.sql"), "");
    writeFileSync(join(dir, "01_a.sql"), "");
    writeFileSync(join(dir, "notas.txt"), "");
    writeFileSync(join(dir, ".DS_Store"), "");
    writeFileSync(join(dir, "._01_a.sql"), "");
    mkdirSync(join(dir, "sub"));

    const { files, errors } = listTestFiles(dir);
    expect(files).toEqual([join(dir, "01_a.sql"), join(dir, "02_b.sql")]);
    expect(errors).toHaveLength(2);
  });

  it("devuelve una lista vacía si la carpeta no existe", () => {
    expect(listTestFiles(join(tmpdir(), "inventa-no-existe-xyz"))).toEqual({ files: [], errors: [] });
  });
});
