import { describe, expect, it } from "vitest";
import {
  containsPattern,
  firstParam,
  listHref,
  MAX_PAGE,
  pageCount,
  pageRange,
  parsePage,
  parseSearch,
  searchFilter,
  SEARCH_MAX_LENGTH,
} from "@/lib/domain/listing";

describe("firstParam", () => {
  it("devuelve el valor o el primero de una lista", () => {
    expect(firstParam("a")).toBe("a");
    expect(firstParam(["b", "c"])).toBe("b");
    expect(firstParam([])).toBeUndefined();
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("parsePage", () => {
  it("lee un número de página válido", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage(" 7 ")).toBe(7);
    expect(parsePage(String(MAX_PAGE))).toBe(MAX_PAGE);
  });

  it("sin página o con una lista usa la primera (o el primer valor)", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
    expect(parsePage(["4", "9"])).toBe(4);
  });

  it("cualquier valor raro es la página 1, nunca un error", () => {
    for (const value of ["0", "-2", "1.5", "abc", "2e3", "0x10", "١", String(MAX_PAGE + 1), "99999999999999999999"]) {
      expect(parsePage(value)).toBe(1);
    }
  });
});

describe("parseSearch", () => {
  it("quita los espacios sobrantes", () => {
    expect(parseSearch("  café   molido ")).toBe("café molido");
  });

  it("vacío o solo espacios es sin búsqueda", () => {
    expect(parseSearch(undefined)).toBeNull();
    expect(parseSearch("")).toBeNull();
    expect(parseSearch("   ")).toBeNull();
    expect(parseSearch([])).toBeNull();
  });

  it("con varios valores usa el primero", () => {
    expect(parseSearch(["taza", "plato"])).toBe("taza");
  });

  it("recorta a la longitud máxima sin partir caracteres", () => {
    const long = "ñ".repeat(SEARCH_MAX_LENGTH + 20);
    expect(parseSearch(long)).toBe("ñ".repeat(SEARCH_MAX_LENGTH));
    const emoji = "😀".repeat(SEARCH_MAX_LENGTH + 1);
    expect(Array.from(parseSearch(emoji) ?? "")).toHaveLength(SEARCH_MAX_LENGTH);
  });
});

describe("pageRange y pageCount", () => {
  it("calcula las filas de cada página", () => {
    expect(pageRange(1, 50)).toEqual({ from: 0, to: 49 });
    expect(pageRange(3, 50)).toEqual({ from: 100, to: 149 });
    expect(pageRange(2, 1)).toEqual({ from: 1, to: 1 });
  });

  it("rechaza páginas o tamaños que no son enteros positivos", () => {
    expect(() => pageRange(0, 50)).toThrow(RangeError);
    expect(() => pageRange(1.5, 50)).toThrow(RangeError);
    expect(() => pageRange(1, 0)).toThrow(RangeError);
  });

  it("cuenta las páginas, con al menos una", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(1, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
    expect(pageCount(101, 50)).toBe(3);
  });

  it("rechaza totales negativos o con decimales", () => {
    expect(() => pageCount(-1, 50)).toThrow(RangeError);
    expect(() => pageCount(2.5, 50)).toThrow(RangeError);
    expect(() => pageCount(10, 0)).toThrow(RangeError);
  });
});

describe("containsPattern", () => {
  it("busca en cualquier parte del texto", () => {
    expect(containsPattern("caf")).toBe("%caf%");
  });

  it("escapa los comodines y la barra invertida del texto", () => {
    expect(containsPattern("50%")).toBe("%50\\%%");
    expect(containsPattern("a_b")).toBe("%a\\_b%");
    expect(containsPattern("c:\\x")).toBe("%c:\\\\x%");
  });
});

describe("searchFilter", () => {
  it("busca el texto en todas las columnas, entre comillas", () => {
    expect(searchFilter(["nombre", "sku"], "caf")).toBe('nombre.ilike."%caf%",sku.ilike."%caf%"');
  });

  it("las comas, puntos, dos puntos y paréntesis quedan dentro de las comillas", () => {
    expect(searchFilter(["nombre"], "a,b.c:(d)")).toBe('nombre.ilike."%a,b.c:(d)%"');
  });

  it("escapa las comillas dobles y las barras invertidas para PostgREST", () => {
    expect(searchFilter(["nombre"], 'di "hola"')).toBe('nombre.ilike."%di \\"hola\\"%"');
    // El texto «50%» se escapa para ilike (\%) y esa barra se escapa para PostgREST (\\%).
    expect(searchFilter(["nombre"], "50%")).toBe('nombre.ilike."%50\\\\%%"');
  });

  it("rechaza una lista de columnas vacía", () => {
    expect(() => searchFilter([], "x")).toThrow(RangeError);
  });
});

describe("listHref", () => {
  it("sin parámetros es la ruta sola", () => {
    expect(listHref("/productos", {})).toBe("/productos");
  });

  it("omite los vacíos y la página 1", () => {
    expect(listHref("/productos", { q: "", pagina: 1 })).toBe("/productos");
    expect(listHref("/productos", { q: null, pagina: undefined })).toBe("/productos");
  });

  it("codifica la búsqueda y la página", () => {
    expect(listHref("/productos", { q: "café & té", pagina: 2 })).toBe("/productos?q=caf%C3%A9+%26+t%C3%A9&pagina=2");
    expect(listHref("/clientes", { pagina: 3 })).toBe("/clientes?pagina=3");
  });
});
