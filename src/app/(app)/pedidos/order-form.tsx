"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { createOrder, type CreateOrderResult } from "@/app/(app)/pedidos/actions";
import { ResetWhenHidden } from "@/components/reset-when-hidden";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, RequiredLegend, SelectField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatCents } from "@/lib/domain/money";
import { lineSubtotal, orderTotal, parseQuantity, type LineErrors, type PricedLine } from "@/lib/domain/order";
import { orderInputErrors, orderInputSchema, type OrderInput, type OrderInputErrors } from "@/lib/domain/order-input";
import type { Customer, Product } from "@/lib/types";

export type OrderFormCustomer = Pick<Customer, "id" | "nombre">;
export type OrderFormProduct = Pick<Product, "id" | "nombre" | "sku" | "precio_cents" | "stock">;

type OrderFormProps = {
  customers: OrderFormCustomer[];
  /** Catálogo con precio y stock: solo para el total orientativo y el aviso de stock. */
  products: OrderFormProduct[];
};

/** Línea del formulario. `key` es estable: los errores siguen a su línea aunque se quiten otras. */
type DraftRow = {
  key: number;
  producto_id: string;
  cantidad: string;
};

type Feedback = {
  error: string;
  clienteError?: string;
  lineErrors: Record<number, LineErrors>;
};

/**
 * Formulario de nuevo pedido. Al salir de la página (Next la conserva oculta) se vuelve a
 * montar limpio: al volver no reaparecen líneas ni errores de un pedido que no se guardó.
 */
export function OrderForm(props: OrderFormProps) {
  return (
    <ResetWhenHidden>
      <OrderFormBody {...props} />
    </ResetWhenHidden>
  );
}

function emptyRow(key: number): DraftRow {
  return { key, producto_id: "", cantidad: "1" };
}

/** Pasa los errores por posición (los de `orderInputSchema`) a errores por línea. */
function toFeedback(errors: OrderInputErrors, keys: readonly number[]): Feedback {
  const lineErrors: Record<number, LineErrors> = {};
  errors.lineErrors.forEach((line, index) => {
    const key = keys[index];
    if (key !== undefined && (line.producto_id || line.cantidad)) {
      lineErrors[key] = line;
    }
  });
  return { error: errors.error, clienteError: errors.clienteError, lineErrors };
}

/** Línea con precio si tiene producto y una cantidad válida; si no, no cuenta para el total. */
function pricedLine(row: DraftRow, product: OrderFormProduct | undefined): PricedLine | null {
  const cantidad = parseQuantity(row.cantidad);
  if (!product || !Number.isSafeInteger(cantidad) || cantidad <= 0) {
    return null;
  }
  return { cantidad, precio_unit_cents: product.precio_cents };
}

function safeAmount(compute: () => number): number | null {
  try {
    return compute();
  } catch {
    return null;
  }
}

function productLabel(product: OrderFormProduct): string {
  const sku = product.sku ? ` · ${product.sku}` : "";
  const soldOut = product.stock === 0 ? " (agotado)" : "";
  return `${product.nombre}${sku}${soldOut}`;
}

function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </>
  );
}

function OrderFormBody({ customers, products }: OrderFormProps) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const linesTitleId = useId();
  const nextKey = useRef(1);
  const [clienteId, setClienteId] = useState("");
  const [rows, setRows] = useState<DraftRow[]>(() => [emptyRow(0)]);
  /** Tras el primer intento de envío, los errores se recalculan con cada cambio. */
  const [attempted, setAttempted] = useState(false);
  /** Lo que respondió la Server Action (p. ej. falta de stock), hasta el siguiente envío. */
  const [serverFeedback, setServerFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();

  const keys = rows.map((row) => row.key);
  const input: OrderInput = {
    cliente_id: clienteId,
    lineas: rows.map(({ producto_id, cantidad }) => ({ producto_id, cantidad })),
  };
  // Las mismas reglas que aplica la Server Action (validateLines dentro de orderInputSchema).
  const check = orderInputSchema.safeParse(input);
  const clientFeedback = attempted && !check.success ? toFeedback(orderInputErrors(check.error), keys) : null;
  const feedback = clientFeedback ?? serverFeedback;

  function updateRow(key: number, change: Partial<Omit<DraftRow, "key">>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function addRow() {
    const key = nextKey.current;
    nextKey.current += 1;
    setRows((current) => [...current, emptyRow(key)]);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setServerFeedback(null);
    if (!check.success) {
      return;
    }

    const submittedKeys = keys;
    startTransition(async () => {
      const result: CreateOrderResult | undefined = await createOrder(input);
      if (result && !result.ok) {
        setServerFeedback(toFeedback(result, submittedKeys));
      }
    });
  }

  const pricedLines = rows.map((row) => pricedLine(row, productsById.get(row.producto_id)));
  const countedLines = pricedLines.filter((line): line is PricedLine => line !== null);
  const total = safeAmount(() => orderTotal(countedLines));

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-3xl flex-col gap-8">
      {feedback && <Notice>{feedback.error}</Notice>}

      <SelectField
        label="Cliente"
        name="cliente_id"
        required
        value={clienteId}
        onChange={(event) => setClienteId(event.target.value)}
        error={feedback?.clienteError}
        className="max-w-md"
      >
        <option value="">Elige un cliente</option>
        {customers.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {customer.nombre}
          </option>
        ))}
      </SelectField>

      <section aria-labelledby={linesTitleId}>
        <div className="rule-thick flex items-end justify-between gap-4 pb-2">
          <h2 id={linesTitleId} className="letterhead text-ink">
            Líneas del pedido
          </h2>
          <p className="letterhead text-ink-soft">
            {rows.length} {rows.length === 1 ? "línea" : "líneas"}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="rule-dashed py-6 text-[15px] text-ink-soft italic">
            El pedido no tiene líneas. Añade al menos una.
          </p>
        ) : (
          <ol>
            {rows.map((row, index) => (
              <OrderLineRow
                key={row.key}
                row={row}
                number={index + 1}
                products={products}
                product={productsById.get(row.producto_id)}
                priced={pricedLines[index]}
                errors={feedback?.lineErrors[row.key]}
                disabled={pending}
                onChange={(change) => updateRow(row.key, change)}
                onRemove={() => removeRow(row.key)}
              />
            ))}
          </ol>
        )}

        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={addRow} disabled={pending}>
            Añadir línea
          </Button>
        </div>

        <div className="mt-8 flex items-baseline justify-between gap-4 border-t-4 border-double border-ink pt-3">
          <span className="letterhead text-ink">Total orientativo</span>
          <output aria-live="polite" className="figures text-[22px] font-medium text-ink">
            {total === null ? <Dash label="Sin calcular" /> : formatCents(total)}
          </output>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          El total definitivo lo calcula el almacén al guardar el pedido, con el precio de cada producto en ese
          momento. El stock también se comprueba al guardar.
        </p>
      </section>

      <div className="flex flex-col gap-4 border-t border-dashed border-rule pt-6">
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Crear pedido"}
          </Button>
          <ButtonLink href="/pedidos" variant="secondary">
            Descartar
          </ButtonLink>
        </div>
        <RequiredLegend />
      </div>
    </form>
  );
}

type OrderLineRowProps = {
  row: DraftRow;
  number: number;
  products: OrderFormProduct[];
  product: OrderFormProduct | undefined;
  priced: PricedLine | null;
  errors: LineErrors | undefined;
  disabled: boolean;
  onChange: (change: Partial<Omit<DraftRow, "key">>) => void;
  onRemove: () => void;
};

function stockHint(product: OrderFormProduct | undefined, cantidad: number): ReactNode {
  if (!product) {
    return undefined;
  }
  if (Number.isSafeInteger(cantidad) && cantidad > product.stock) {
    return (
      <span className="text-stamp-red">
        Supera el stock: {product.stock === 0 ? "no queda ninguno" : `solo hay ${product.stock}`}.
      </span>
    );
  }
  return `Hay ${product.stock} en stock.`;
}

function OrderLineRow({ row, number, products, product, priced, errors, disabled, onChange, onRemove }: OrderLineRowProps) {
  const subtotal = priced ? safeAmount(() => lineSubtotal(priced)) : null;
  const folio = String(number).padStart(2, "0");

  return (
    <li className="rule-dashed py-4">
      <fieldset className="flex min-w-0 gap-3 sm:gap-4">
        <legend className="sr-only">Línea {number}</legend>
        <span aria-hidden="true" className="figures w-6 shrink-0 pt-7 text-sm text-ink-soft">
          {folio}
        </span>
        <div className="grid min-w-0 flex-1 gap-x-4 gap-y-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <SelectField
            label="Producto"
            name={`producto-${row.key}`}
            required
            value={row.producto_id}
            onChange={(event) => onChange({ producto_id: event.target.value })}
            error={errors?.producto_id}
            className="min-w-0"
          >
            <option value="">Elige un producto</option>
            {products.map((option) => (
              <option key={option.id} value={option.id}>
                {productLabel(option)}
              </option>
            ))}
          </SelectField>
          <Field
            label="Cantidad"
            name={`cantidad-${row.key}`}
            required
            numeric
            inputMode="numeric"
            autoComplete="off"
            value={row.cantidad}
            onChange={(event) => onChange({ cantidad: event.target.value })}
            error={errors?.cantidad}
            hint={stockHint(product, parseQuantity(row.cantidad))}
          />
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:col-span-2">
            <dl className="flex gap-x-8">
              <div>
                <dt className="letterhead text-ink-soft">Precio unit.</dt>
                <dd className="figures text-right text-[15px] text-ink">
                  {product ? formatCents(product.precio_cents) : <Dash label="Sin producto" />}
                </dd>
              </div>
              <div>
                <dt className="letterhead text-ink-soft">Subtotal</dt>
                <dd className="figures text-right text-[15px] font-medium text-ink">
                  {subtotal === null ? <Dash label="Sin calcular" /> : formatCents(subtotal)}
                </dd>
              </div>
            </dl>
            <Button variant="secondary" size="sm" onClick={onRemove} disabled={disabled} aria-label={`Quitar la línea ${number}`}>
              Quitar
            </Button>
          </div>
        </div>
      </fieldset>
    </li>
  );
}
