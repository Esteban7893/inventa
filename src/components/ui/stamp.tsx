import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export type StampTone = "alert" | "ok" | "ink";

const TONES: Record<StampTone, string> = {
  alert: "text-stamp-red",
  ok: "text-stamp-green",
  ink: "text-ink",
};

type StampProps = {
  /** `alert`: rojo sello (stock bajo, cancelado). `ok`: verde sello (solo "enviado"). `ink`: tinta (pendiente). */
  tone?: StampTone;
  /** Inclinación del sello en grados (hacia la izquierda). */
  tilt?: 2 | 3;
  children: ReactNode;
  className?: string;
};

/** Sello de estado: Mono en mayúsculas, borde de 1,5 px del color del sello y ligeramente girado. */
export function Stamp({ tone = "ink", tilt = 2, children, className }: StampProps) {
  return (
    <span
      className={cx(
        "letterhead inline-block self-center rounded-none border-[1.5px] border-current bg-transparent px-2 py-[3px] leading-none whitespace-nowrap",
        tilt === 3 ? "-rotate-3" : "-rotate-2",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
