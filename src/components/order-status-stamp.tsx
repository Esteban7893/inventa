import { Stamp, type StampTone } from "@/components/ui/stamp";
import type { OrderStatus } from "@/lib/types";

const STATUS: Record<OrderStatus, { label: string; tone: StampTone }> = {
  pendiente: { label: "Pendiente", tone: "ink" },
  enviado: { label: "Enviado", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "alert" },
};

/** Nombre del estado para frases y filtros ("Pendiente", "Enviado", "Cancelado"). */
export function orderStatusLabel(status: OrderStatus): string {
  return STATUS[status].label;
}

/** Sello del estado de un pedido: tinta si está pendiente, verde si se envió y rojo si se canceló. */
export function OrderStatusStamp({ status, className }: { status: OrderStatus; className?: string }) {
  const { label, tone } = STATUS[status];
  return (
    <Stamp tone={tone} tilt={status === "pendiente" ? 2 : 3} className={className}>
      {label}
    </Stamp>
  );
}
