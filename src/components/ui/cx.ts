/** Une clases de Tailwind ignorando los valores vacíos. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
