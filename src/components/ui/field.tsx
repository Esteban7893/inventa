import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/components/ui/cx";

type FieldOwnProps = {
  /** Texto de la etiqueta (se muestra como membrete). */
  label: string;
  /** Nombre del campo en el formulario. También es el `id` si no se pasa otro. */
  name: string;
  /** Mensaje de error junto al campo. */
  error?: string;
  /** Ayuda breve bajo el campo. */
  hint?: ReactNode;
  /** Clases del contenedor (no del control). */
  className?: string;
};

type NumericProp = {
  /** Cifra, importe, cantidad o SKU: Plex Mono con números tabulares, alineado a la derecha. */
  numeric?: boolean;
};

const CONTROL =
  "w-full rounded-none border border-ink-soft bg-paper-raised px-3 text-base text-ink placeholder:text-ink-soft/70 transition-colors outline-none focus:border-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-stamp-red aria-invalid:focus-visible:outline-stamp-red";

type FrameProps = Pick<FieldOwnProps, "label" | "error" | "hint" | "className"> & {
  id: string;
  required?: boolean;
  children: ReactNode;
};

function FieldFrame({ id, label, error, hint, required, className, children }: FrameProps) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="letterhead text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-stamp-red">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type InputFieldProps = FieldOwnProps & NumericProp & Omit<ComponentProps<"input">, "name" | "className">;

/** Campo de texto con etiqueta en membrete, borde de tinta suave y error debajo. */
export function Field({ label, error, hint, className, numeric, ...input }: InputFieldProps) {
  const id = input.id ?? input.name;
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} required={input.required} className={className}>
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cx(CONTROL, "h-11", (numeric || input.type === "number") && "figures text-right")}
      />
    </FieldFrame>
  );
}

type SelectFieldProps = FieldOwnProps & Omit<ComponentProps<"select">, "name" | "className">;

/** Desplegable con el mismo aspecto que `Field`. Pasa las `<option>` como hijos. */
export function SelectField({ label, error, hint, className, children, ...select }: SelectFieldProps) {
  const id = select.id ?? select.name;
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} required={select.required} className={className}>
      <div className="relative">
        <select
          {...select}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={cx(CONTROL, "h-11 appearance-none pr-9")}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3.5 size-0 -translate-y-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-ink-soft"
        />
      </div>
    </FieldFrame>
  );
}

type TextareaFieldProps = FieldOwnProps & Omit<ComponentProps<"textarea">, "name" | "className">;

/** Área de texto con el mismo aspecto que `Field`. */
export function TextareaField({ label, error, hint, className, rows = 4, ...textarea }: TextareaFieldProps) {
  const id = textarea.id ?? textarea.name;
  return (
    <FieldFrame id={id} label={label} error={error} hint={hint} required={textarea.required} className={className}>
      <textarea
        {...textarea}
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cx(CONTROL, "py-2.5 leading-relaxed")}
      />
    </FieldFrame>
  );
}

/** Leyenda del asterisco de los campos obligatorios. */
export function RequiredLegend() {
  return (
    <p className="letterhead text-ink-soft">
      <span aria-hidden="true">*</span> Campo obligatorio
    </p>
  );
}
