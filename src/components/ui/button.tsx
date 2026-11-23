import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "@/components/ui/cx";

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "md" | "sm";

type StyleProps = {
  /** `primary`: tinta sólida (uno por pantalla). `secondary`: borde de tinta. `danger`: rojo sello. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa todo el ancho disponible. */
  block?: boolean;
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-none border-[1.5px] font-sans font-medium whitespace-nowrap transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-ink bg-ink text-paper hover:bg-ink/85 hover:border-ink/85",
  secondary: "border-ink bg-transparent text-ink hover:bg-paper-raised",
  danger:
    "border-stamp-red bg-transparent text-stamp-red hover:bg-stamp-red hover:text-paper focus-visible:outline-stamp-red",
};

const SIZES: Record<ButtonSize, string> = {
  md: "h-11 px-5 text-[15px]",
  sm: "h-9 px-3.5 text-sm",
};

export function buttonClasses({ variant = "primary", size = "md", block = false }: StyleProps = {}) {
  return cx(BASE, VARIANTS[variant], SIZES[size], block && "w-full");
}

type ButtonProps = StyleProps & ComponentProps<"button">;

/** Botón rectangular. Por defecto `type="button"`: pon `type="submit"` en formularios. */
export function Button({ variant, size, block, className, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClasses({ variant, size, block }), className)} {...props} />
  );
}

type ButtonLinkProps = StyleProps & ComponentProps<typeof Link>;

/** Enlace con aspecto de botón (navega, no envía nada). */
export function ButtonLink({ variant, size, block, className, ...props }: ButtonLinkProps) {
  return <Link className={cx(buttonClasses({ variant, size, block }), className)} {...props} />;
}
