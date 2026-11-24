"use client";

import { useActionState } from "react";
import type { CustomerFormState } from "@/app/(app)/clientes/actions";
import { ResetWhenHidden } from "@/components/reset-when-hidden";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, RequiredLegend } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { CustomerInputField } from "@/lib/domain/customer-input";

export type CustomerFormValues = Record<CustomerInputField, string>;

type CustomerFormProps = {
  action: (prev: CustomerFormState | null, formData: FormData) => Promise<CustomerFormState>;
  /** Valores iniciales de los campos (vacíos al dar de alta). */
  defaults: CustomerFormValues;
  submitLabel: string;
  pendingLabel: string;
};

/**
 * Al salir de la página (Next la conserva oculta) se vuelve a montar limpio: al volver no
 * reaparecen errores ni valores de un envío fallido o cancelado.
 */
export function CustomerForm(props: CustomerFormProps) {
  return (
    <ResetWhenHidden>
      <CustomerFormBody {...props} />
    </ResetWhenHidden>
  );
}

function CustomerFormBody({ action, defaults, submitLabel, pendingLabel }: CustomerFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const failed = state?.ok === false ? state : null;
  const values: CustomerFormValues = { ...defaults, ...failed?.values };
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
          hint="Persona o empresa."
          className="sm:col-span-2"
        />
        <Field
          label="Email"
          name="email"
          type="email"
          maxLength={254}
          autoComplete="off"
          spellCheck={false}
          defaultValue={values.email}
          error={errors.email}
          hint="Opcional."
        />
        <Field
          label="Teléfono"
          name="telefono"
          type="tel"
          mono
          maxLength={30}
          autoComplete="off"
          defaultValue={values.telefono}
          error={errors.telefono}
          hint="Opcional. P. ej. +34 600 111 222."
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-dashed border-rule pt-6">
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
          <ButtonLink href="/clientes" variant="secondary">
            Cancelar
          </ButtonLink>
        </div>
        <RequiredLegend />
      </div>
    </form>
  );
}
