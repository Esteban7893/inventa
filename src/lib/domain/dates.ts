/** Las fechas se muestran siempre en la hora de Madrid, sea cual sea la zona del servidor. */
const TIME_ZONE = "Europe/Madrid";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

function toDate(iso: string): Date {
  const date = new Date(iso);
  if (iso.trim() === "" || Number.isNaN(date.getTime())) {
    throw new RangeError("La fecha no es válida.");
  }
  return date;
}

/** Fecha de un texto ISO 8601, p. ej. "2026-11-24T10:30:00Z" → "24/11/2026". */
export function formatDate(iso: string): string {
  return dateFormatter.format(toDate(iso));
}

/** Fecha y hora de un texto ISO 8601, p. ej. "2026-11-24T10:30:00Z" → "24/11/2026, 11:30". */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(toDate(iso));
}
