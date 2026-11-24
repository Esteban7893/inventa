import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export type LedgerColumn<Row> = {
  /** Identificador de la columna (también se usa en `footer`). */
  key: string;
  /** Texto de la cabecera (se muestra como membrete). */
  header: string;
  /**
   * Columna de cifras, importes, cantidades, SKU, fechas o referencias (Nº 0042):
   * Plex Mono con números tabulares, alineada a la derecha y sin partir la línea.
   */
  numeric?: boolean;
  /** Contenido de la celda para una fila. */
  cell: (row: Row) => ReactNode;
  /** Clases extra para las celdas de esta columna (p. ej. un ancho). */
  className?: string;
};

type LedgerTableProps<Row> = {
  /** Título accesible de la tabla (lo leen los lectores de pantalla). */
  caption: string;
  columns: ReadonlyArray<LedgerColumn<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row) => string;
  /** Lo que se muestra si no hay filas (usa `EmptyState`). */
  empty: ReactNode;
  /** Fila de totales, por clave de columna. */
  footer?: Partial<Record<string, ReactNode>>;
  /** Regla doble de tinta sobre la fila de totales (el total de un albarán). */
  doubleRuleFooter?: boolean;
  /** Ancho mínimo en px antes de que la tabla tenga su propio scroll horizontal. */
  minWidth?: LedgerMinWidth;
};

/**
 * Anchos mínimos con su clase de Tailwind escrita entera (así la genera el compilador).
 * Una clase y no `style={{ minWidth }}`: la CSP no permite atributos `style` en el HTML.
 */
const MIN_WIDTH_CLASS = {
  340: "min-w-[340px]",
  560: "min-w-[560px]",
  600: "min-w-[600px]",
  680: "min-w-[680px]",
  760: "min-w-[760px]",
} as const;

export type LedgerMinWidth = keyof typeof MIN_WIDTH_CLASS;

function alignment<Row>(column: LedgerColumn<Row>): string {
  return column.numeric ? "figures text-right whitespace-nowrap" : "";
}

/** Tabla como un libro de registro: cabecera en membrete, filas con regla discontinua y cifras a la derecha. */
export function LedgerTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  footer,
  doubleRuleFooter = false,
  minWidth = 560,
}: LedgerTableProps<Row>) {
  if (rows.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div role="region" aria-label={caption} tabIndex={0} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className={cx("w-full border-collapse text-left text-[15px]", MIN_WIDTH_CLASS[minWidth])}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="rule-thick">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx(
                  "letterhead px-3 pt-1 pb-2 align-bottom font-medium whitespace-nowrap text-ink-soft first:pl-0 last:pr-0",
                  column.numeric && "text-right",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="rule-dashed transition-colors hover:bg-paper-raised">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx(
                    "px-3 py-3 align-baseline first:pl-0 last:pr-0",
                    alignment(column),
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className={doubleRuleFooter ? "border-t-4 border-double border-ink" : "border-t-[1.5px] border-ink"}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cx(
                    "px-3 pt-3 pb-1 font-medium first:pl-0 last:pr-0",
                    alignment(column),
                    column.className,
                  )}
                >
                  {footer[column.key]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
