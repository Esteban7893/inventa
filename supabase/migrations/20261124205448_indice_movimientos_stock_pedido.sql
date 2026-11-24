-- Inventa — T14: índice de la clave ajena movimientos_stock_pedido_fkey (pedido_id, owner_id).
-- El advisor unindexed_foreign_keys pide un índice que empiece exactamente por las columnas de
-- cada clave ajena, como el resto del esquema (0001). El único índice que empezaba por
-- pedido_id era el de la restricción unique (pedido_id, producto_id, motivo). Solo añade.

create index movimientos_stock_pedido_id_idx
  on public.movimientos_stock (pedido_id, owner_id);
