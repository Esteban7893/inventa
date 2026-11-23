import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

type NoticeProps = {
  /** `alert` para errores del formulario; `ink` para avisos neutros. */
  tone?: "alert" | "ink";
  children: ReactNode;
  className?: string;
};

/** Aviso de formulario o de página: regla a la izquierda del color del sello, sin fondo. */
export function Notice({ tone = "alert", children, className }: NoticeProps) {
  return (
    <p
      role={tone === "alert" ? "alert" : "status"}
      className={cx(
        "border-l-[3px] py-1 pl-3 text-[15px] leading-snug",
        tone === "alert" ? "border-stamp-red text-stamp-red" : "border-ink text-ink",
        className,
      )}
    >
      {children}
    </p>
  );
}
