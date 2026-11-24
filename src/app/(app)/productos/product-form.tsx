"use client";

import { useActionState } from "react";
import type { ProductFormState } from "@/app/(app)/productos/actions";
import { ResetWhenHidden } from "@/components/reset-when-hidden";
import { ButtonLink, Button } from "@/components/ui/button";
import { Field, RequiredLegend } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { ProductInputField } from "@/lib/domain/product-input";

export type ProductFormValues = Record<ProductInputField, string>;

type ProductFormProps = {
  action: (prev: ProductFormState | null, formData: FormData) => Promise<ProductFormState>;
  /** Valores iniciales de los campos (vacíos al dar de alta). */
  defaults: ProductFormValues;
  submitLabel: string;
  pendingLabel: string;
};

/**
 * Al salir de la página (Next la conserva oculta) se vuelve a montar limpio: al volver no
 * reaparecen errores ni valores de un envío fallido o cancelado.
 */
export function ProductForm(props: ProductFormProps) {
  return (
    <ResetWhenHidden>
      <ProductFormBody {...props} />
    </ResetWhenHidden>
  );
}

function ProductFormBody({ action, defaults, submitLabel, pendingLabel }: ProductFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const failed = state?.ok === false ? state : null;
  const values: ProductFormValues = { ...defaults, ...failed?.values };
  const errors = failed?.fieldErrors ?? {};

  return (
    <form action={formAction} noValidate className="flex max-w-2xl flex-col gap-6">
      {failed && <Notice>{failed.error}</Notice>}

      <div key={failed ? JSON.stringify(failed.values) : "inicial"} className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field
          label="Nombre"
          name="nombre"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={values.nombre}
          error={errors.nombre}
          className="sm:col-span-2"
        />
        <Field
          label="SKU"
          name="sku"
          mono
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          defaultValue={values.sku}
          error={errors.sku}
          hint="Opcional. Tu referencia interna, p. ej. CAF-COL-1K."
        />
        <Field
          label="Precio (€)"
          name="precio"
          required
          numeric
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          defaultValue={values.precio}
          error={errors.precio}
          hint="En euros, con coma para los céntimos: 12,50."
        />
        <Field
          label="Stock"
          name="stock"
          required
          numeric
          inputMode="numeric"
          autoComplete="off"
          defaultValue={values.stock}
          error={errors.stock}
          hint="Unidades en el almacén."
        />
        <Field
          label="Stock mínimo"
          name="stock_minimo"
          required
          numeric
          inputMode="numeric"
          autoComplete="off"
          defaultValue={values.stock_minimo}
          error={errors.stock_minimo}
          hint="Con esta cifra o menos, se marca como stock bajo."
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-dashed border-rule pt-6">
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
          <ButtonLink href="/productos" variant="secondary">
            Cancelar
          </ButtonLink>
        </div>
        <RequiredLegend />
      </div>
    </form>
  );
}
