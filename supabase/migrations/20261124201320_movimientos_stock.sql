-- Inventa — T14: registro de movimientos de stock.
-- Cada cambio de productos.stock deja exactamente un movimiento con su delta:
-- - motivo 'pedido': una línea de pedido nueva (crear_pedido), delta = -cantidad, con su pedido;
-- - motivo 'cancelacion': un pedido pendiente que pasa a cancelado (cancelar_pedido),
--   delta = +cantidad de cada línea, con su pedido;
-- - motivo 'ajuste': el alta de un producto con stock y cualquier cambio de stock fuera de
--   esas dos funciones (el formulario de edición hace un update directo de productos por RLS).
--
-- La tabla es de solo lectura para authenticated (como pedidos y pedido_lineas, D7): se
-- rellena solo con triggers. crear_pedido, cancelar_pedido y enviar_pedido no cambian.
-- Solo añade (tabla, índices, funciones de trigger, triggers y el saldo inicial de los
-- productos que ya existen): el código de main sigue funcionando igual.
--
-- Cómo se decide el motivo sin que se pueda falsificar desde la API:
-- - 'pedido' y 'cancelacion' salen de triggers en pedido_lineas (insert) y pedidos (update de
--   estado). authenticated no puede escribir esas tablas: solo lo hacen crear_pedido y
--   cancelar_pedido (security definer). Nadie puede crear un movimiento de pedido sin un
--   pedido de verdad.
-- - El cambio de stock que hacen esas dos funciones ya queda registrado por esos triggers, así
--   que el trigger de productos no debe registrarlo otra vez. Para saberlo mira quién ejecuta
--   el update: dentro de una función security definer, current_user es el dueño de la función
--   (postgres); en un update directo por la API, es authenticated. current_user no se puede
--   cambiar desde la API.
-- - Ese dato solo lo ve una función security invoker, y la que escribe en movimientos_stock
--   tiene que ser security definer (authenticated no tiene insert). Por eso hay dos triggers
--   seguidos en productos para cada fila: el primero (invoker) apunta el origen en
--   inventa.origen_stock con set_config(..., true), y el segundo (definer) lo lee y lo borra.
--   Postgres dispara los triggers after de una misma fila uno detrás de otro, por orden de
--   nombre, así que el segundo siempre lee lo que acaba de escribir el primero: si la persona
--   pone antes inventa.origen_stock = 'funcion' en su sesión, el primero lo sobrescribe con
--   'directo' y su cambio queda como 'ajuste'. Cualquier valor que no sea 'funcion' se registra.
-- - Límite: un update de stock hecho a mano como postgres (el dueño) fuera de las funciones
--   tampoco se registra, porque es indistinguible del que hacen las funciones. El dueño de la
--   base de datos puede saltarse cualquier regla; en Inventa todo cambio pasa por la API o por
--   el seed, que escribe como authenticated.
--
-- Alta de un producto: registra un 'ajuste' con el stock inicial si no es 0. Así la suma de
-- los deltas de un producto es siempre su stock y el historial explica de dónde sale cada
-- unidad. Los productos que ya existen reciben al aplicar la migración un 'ajuste' con su
-- stock actual (saldo inicial), por la misma razón: su historial anterior no se conoce.
--
-- Borrado: un producto con pedidos ya no se puede borrar (pedido_lineas -> productos es
-- restrict, 0001). Uno sin pedidos solo tiene movimientos 'ajuste' (alta y ediciones), y se
-- borran con él (on delete cascade): si fuera restrict, el CRUD de productos de main dejaría
-- de poder borrar cualquier producto con stock. Los pedidos no se pueden borrar desde la API
-- (D7); si se borran como administrador (el seed de demostración, o al borrar un usuario), sus
-- movimientos se van con ellos, igual que sus líneas (pedido_lineas -> pedidos es cascade).

-- ---------------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------------

create table public.movimientos_stock (
  -- Identidad creciente: ordena los movimientos de una misma transacción (comparten
  -- created_at), p. ej. el alta de un producto y su primer pedido.
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  producto_id uuid not null,
  delta integer not null check (delta <> 0),
  motivo text not null check (motivo in ('pedido', 'cancelacion', 'ajuste')),
  pedido_id uuid,
  created_at timestamptz not null default now(),
  -- pedido_id obligatorio para pedido y cancelacion, nulo para ajuste.
  constraint movimientos_stock_pedido_segun_motivo
    check ((pedido_id is null) = (motivo = 'ajuste')),
  -- Un pedido solo resta stock y una cancelación solo lo devuelve.
  constraint movimientos_stock_signo_segun_motivo
    check (motivo = 'ajuste'
      or (motivo = 'pedido' and delta < 0)
      or (motivo = 'cancelacion' and delta > 0)),
  -- Un pedido descuenta y devuelve cada producto una sola vez (los ajustes, con pedido_id
  -- nulo, no chocan entre sí).
  constraint movimientos_stock_una_vez_por_pedido unique (pedido_id, producto_id, motivo),
  -- El producto y el pedido son del mismo dueño que el movimiento.
  constraint movimientos_stock_producto_fkey foreign key (producto_id, owner_id)
    references public.productos (id, owner_id) on delete cascade,
  constraint movimientos_stock_pedido_fkey foreign key (pedido_id, owner_id)
    references public.pedidos (id, owner_id) on delete cascade
);

-- Movimientos de un producto, del más reciente al más antiguo, con límite (la ficha de
-- producto). También sirve al borrado en cascada desde productos.
create index movimientos_stock_producto_fecha_idx
  on public.movimientos_stock (producto_id, owner_id, created_at desc, id desc);

-- owner_id: RLS y borrado en cascada del usuario (como el resto de tablas).
create index movimientos_stock_owner_id_idx on public.movimientos_stock (owner_id);

-- El borrado en cascada desde pedidos usa el índice de movimientos_stock_una_vez_por_pedido,
-- que empieza por pedido_id.

-- ---------------------------------------------------------------------------
-- Permisos y RLS: solo lectura de las filas propias.
-- ---------------------------------------------------------------------------

revoke all on table public.movimientos_stock from public, anon, authenticated;
grant select on table public.movimientos_stock to authenticated;
revoke all on sequence public.movimientos_stock_id_seq from public, anon, authenticated;

alter table public.movimientos_stock enable row level security;

create policy "movimientos_stock_select_propios" on public.movimientos_stock
  for select to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Funciones de trigger. Ninguna se puede llamar desde la API: Postgres solo ejecuta una
-- función que devuelve trigger como trigger, y además nadie tiene execute.
-- ---------------------------------------------------------------------------

-- Primer trigger de productos (security invoker): apunta si el update lo hace crear_pedido o
-- cancelar_pedido ('funcion') o es un cambio directo ('directo').
create function public.movimientos_stock_marcar_origen()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'inventa.origen_stock',
    case
      when exists (
        select 1
        from pg_catalog.pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('crear_pedido', 'cancelar_pedido')
          and p.prosecdef
          and pg_catalog.pg_get_userbyid(p.proowner) = current_user
      ) then 'funcion'
      else 'directo'
    end,
    true
  );
  return null;
end;
$$;

-- Segundo trigger de productos y trigger de alta (security definer: authenticated no puede
-- escribir en movimientos_stock). Registra un 'ajuste' con el stock inicial o con el cambio,
-- salvo que el primer trigger haya apuntado 'funcion'. Escribe solo la fila del producto que
-- cambia y con su owner_id; la clave ajena compuesta impide que sea de otro usuario.
create function public.movimientos_stock_registrar_ajuste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origen text;
  v_delta integer;
begin
  if tg_op = 'INSERT' then
    v_delta := new.stock;
  else
    v_origen := pg_catalog.current_setting('inventa.origen_stock', true);
    perform pg_catalog.set_config('inventa.origen_stock', '', true);
    if v_origen = 'funcion' then
      return null;
    end if;
    v_delta := new.stock - old.stock;
  end if;

  -- delta nunca es 0: los triggers solo se disparan con stock inicial distinto de 0 o con un
  -- cambio de stock (when).
  insert into public.movimientos_stock (owner_id, producto_id, delta, motivo)
  values (new.owner_id, new.id, v_delta, 'ajuste');
  return null;
end;
$$;

-- Línea de pedido nueva (solo la crea crear_pedido): el stock baja en su cantidad.
create function public.movimientos_stock_registrar_pedido()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.movimientos_stock (owner_id, producto_id, delta, motivo, pedido_id)
  values (new.owner_id, new.producto_id, -new.cantidad, 'pedido', new.pedido_id);
  return null;
end;
$$;

-- Pedido pendiente que pasa a cancelado (solo lo hace cancelar_pedido, una vez): vuelve la
-- cantidad de cada línea.
create function public.movimientos_stock_registrar_cancelacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.movimientos_stock (owner_id, producto_id, delta, motivo, pedido_id)
  select pl.owner_id, pl.producto_id, pl.cantidad, 'cancelacion', pl.pedido_id
  from public.pedido_lineas pl
  where pl.pedido_id = new.id
    and pl.owner_id = new.owner_id
  order by pl.producto_id;
  return null;
end;
$$;

revoke execute on function public.movimientos_stock_marcar_origen() from public, anon, authenticated;
revoke execute on function public.movimientos_stock_registrar_ajuste() from public, anon, authenticated;
revoke execute on function public.movimientos_stock_registrar_pedido() from public, anon, authenticated;
revoke execute on function public.movimientos_stock_registrar_cancelacion() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Los dos triggers de update de productos tienen la misma condición, así que siempre se
-- disparan juntos, y por orden de nombre (1_origen antes que 2_ajuste). Un update que no
-- cambia el stock (p. ej. el formulario de edición con el mismo stock) no deja movimiento.
create trigger movimientos_stock_1_origen
  after update of stock on public.productos
  for each row
  when (old.stock is distinct from new.stock)
  execute function public.movimientos_stock_marcar_origen();

create trigger movimientos_stock_2_ajuste
  after update of stock on public.productos
  for each row
  when (old.stock is distinct from new.stock)
  execute function public.movimientos_stock_registrar_ajuste();

create trigger movimientos_stock_alta
  after insert on public.productos
  for each row
  when (new.stock <> 0)
  execute function public.movimientos_stock_registrar_ajuste();

create trigger movimientos_stock_pedido
  after insert on public.pedido_lineas
  for each row
  execute function public.movimientos_stock_registrar_pedido();

create trigger movimientos_stock_cancelacion
  after update of estado on public.pedidos
  for each row
  when (old.estado = 'pendiente' and new.estado = 'cancelado')
  execute function public.movimientos_stock_registrar_cancelacion();

-- ---------------------------------------------------------------------------
-- Saldo inicial de los productos que ya existen. Va después de crear los triggers de
-- productos: create trigger bloquea productos frente a escrituras hasta el final de la
-- migración, así que ningún cambio de stock queda entre este saldo y los triggers.
-- ---------------------------------------------------------------------------

insert into public.movimientos_stock (owner_id, producto_id, delta, motivo)
select p.owner_id, p.id, p.stock, 'ajuste'
from public.productos p
where p.stock <> 0
order by p.owner_id, p.id;
