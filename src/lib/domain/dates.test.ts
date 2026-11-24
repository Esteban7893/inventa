import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, parseIsoDate } from "@/lib/domain/dates";

describe("formatDate", () => {
  it("muestra la fecha en formato español, en la hora de Madrid", () => {
    expect(formatDate("2026-11-24T10:30:00Z")).toBe("24/11/2026");
  });

  it("usa el día de Madrid aunque en UTC aún sea el anterior", () => {
    expect(formatDate("2026-11-23T23:30:00Z")).toBe("24/11/2026");
    expect(formatDate("2026-07-31T22:15:00Z")).toBe("01/08/2026");
  });

  it("rechaza un texto que no es una fecha", () => {
    expect(() => formatDate("")).toThrow(RangeError);
    expect(() => formatDate("ayer")).toThrow(RangeError);
  });
});

describe("formatDateTime", () => {
  it("añade la hora de Madrid en formato de 24 horas", () => {
    expect(formatDateTime("2026-11-24T10:30:00Z")).toBe("24/11/2026, 11:30");
    expect(formatDateTime("2026-07-01T16:05:00+00:00")).toBe("01/07/2026, 18:05");
  });

  it("rechaza un texto que no es una fecha", () => {
    expect(() => formatDateTime("2026-13-45")).toThrow(RangeError);
  });
});

describe("parseIsoDate", () => {
  it("lee un texto ISO 8601, con zona o desfase", () => {
    expect(parseIsoDate("2026-11-24T10:30:00Z").toISOString()).toBe("2026-11-24T10:30:00.000Z");
    expect(parseIsoDate("2026-11-24T10:30:00+01:00").toISOString()).toBe("2026-11-24T09:30:00.000Z");
  });

  it("rechaza un texto vacío, con solo espacios o que no es una fecha", () => {
    expect(() => parseIsoDate("")).toThrow(RangeError);
    expect(() => parseIsoDate("   ")).toThrow(RangeError);
    expect(() => parseIsoDate("mañana")).toThrow(RangeError);
  });
});
