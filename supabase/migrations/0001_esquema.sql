-- Inventa — esquema inicial: productos, clientes, pedidos y líneas de pedido.
-- Cada fila pertenece a un usuario (owner_id) y RLS limita todo a sus propias filas.
-- El stock solo se mueve dentro de las funciones crear_pedido y cancelar_pedido.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  sku text check (sku is null or btrim(sku) <> ''),
  precio_cents integer not null check (precio_cents >= 0),
  stock integer not null default 0 check (stock >= 0),
  stock_minimo integer not null default 0 check (stock_minimo >= 0),
  created_at timestamptz not null default now(),
  -- Permite que las líneas de pedido exijan un producto del mismo dueño.
  unique (id, owner_id)
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  email text,
  telefono text,
  created_at timestamptz not null default now(),
  -- Permite que los pedidos exijan un cliente del mismo dueño.
  unique (id, owner_id)
);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cliente_id uuid not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'cancelado')),
  total_cents integer not null check (total_cents >= 0),
  created_at timestamptz not null default now(),
  enviado_at timestamptz,
  cancelado_at timestamptz,
  unique (id, owner_id),
  -- No se puede borrar un cliente que tiene pedidos.
  foreign key (cliente_id, owner_id)
    references public.clientes (id, owner_id) on delete restrict,
  check (enviado_at is null or estado = 'enviado'),
  check (cancelado_at is null or estado = 'cancelado')
);

create table public.pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pedido_id uuid not null,
  producto_id uuid not null,
  cantidad integer not null check (cantidad > 0),
  -- Precio copiado del producto al crear el pedido: no cambia si luego se edita el producto.
  precio_unit_cents integer not null check (precio_unit_cents >= 0),
  created_at timestamptz not null default now(),
  unique (pedido_id, producto_id),
  foreign key (pedido_id, owner_id)
    references public.pedidos (id, owner_id) on delete cascade,
  -- No se puede borrar un producto que aparece en algún pedido.
  foreign key (producto_id, owner_id)
    references public.productos (id, owner_id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- Índices: owner_id (RLS y borrado en cascada del usuario) y claves ajenas
-- ---------------------------------------------------------------------------

create unique index productos_owner_sku_key
  on public.productos (owner_id, sku) where sku is not null;

create index productos_owner_id_idx on public.productos (owner_id);
create index clientes_owner_id_idx on public.clientes (owner_id);
create index pedidos_owner_id_idx on public.pedidos (owner_id);
create index pedido_lineas_owner_id_idx on public.pedido_lineas (owner_id);

create index pedidos_cliente_id_idx on public.pedidos (cliente_id, owner_id);
create index pedido_lineas_pedido_id_idx on public.pedido_lineas (pedido_id, owner_id);
create index pedido_lineas_producto_id_idx on public.pedido_lineas (producto_id, owner_id);

-- ---------------------------------------------------------------------------
-- Permisos y RLS
-- ---------------------------------------------------------------------------

revoke all on table public.productos, public.clientes, public.pedidos, public.pedido_lineas
  from anon, public;
grant select, insert, update, delete
  on table public.productos, public.clientes, public.pedidos, public.pedido_lineas
  to authenticated;

alter table public.productos enable row level security;
alter table public.clientes enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_lineas enable row level security;

create policy "productos_select_propios" on public.productos
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "productos_insert_propios" on public.productos
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "productos_update_propios" on public.productos
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "productos_delete_propios" on public.productos
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "clientes_select_propios" on public.clientes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "clientes_insert_propios" on public.clientes
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "clientes_update_propios" on public.clientes
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "clientes_delete_propios" on public.clientes
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "pedidos_select_propios" on public.pedidos
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "pedidos_insert_propios" on public.pedidos
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "pedidos_update_propios" on public.pedidos
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "pedidos_delete_propios" on public.pedidos
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "pedido_lineas_select_propias" on public.pedido_lineas
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "pedido_lineas_insert_propias" on public.pedido_lineas
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "pedido_lineas_update_propias" on public.pedido_lineas
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "pedido_lineas_delete_propias" on public.pedido_lineas
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- crear_pedido: valida, bloquea los productos, comprueba el stock de todas las
-- líneas, crea el pedido con sus líneas y descuenta el stock. Todo o nada.
--
-- p_lineas: [{ "producto_id": "<uuid>", "cantidad": <entero > 0> }, ...]
-- Devuelve el id del pedido.
-- ---------------------------------------------------------------------------

create or replace function public.crear_pedido(p_cliente_id uuid, p_lineas jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_linea jsonb;
  v_producto_texto text;
  v_cantidad_num numeric;
  v_producto_ids uuid[] := '{}';
  v_cantidades integer[] := '{}';
  v_producto record;
  v_bloqueados integer := 0;
  v_sin_stock text;
  v_total bigint;
  v_pedido_id uuid;
begin
  if p_cliente_id is null
    or not exists (select 1 from public.clientes c where c.id = p_cliente_id) then
    raise exception 'CLIENTE_NO_ENCONTRADO';
  end if;

  -- Comprobaciones separadas: jsonb_array_length falla si p_lineas no es un array.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'PEDIDO_VACIO';
  end if;
  if jsonb_array_length(p_lineas) = 0 then
    raise exception 'PEDIDO_VACIO';
  end if;

  for v_linea in select e.value from jsonb_array_elements(p_lineas) as e (value) loop
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'PRODUCTO_NO_ENCONTRADO';
    end if;

    if jsonb_typeof(v_linea -> 'producto_id') is distinct from 'string'
      or not pg_input_is_valid(v_linea ->> 'producto_id', 'uuid') then
      raise exception 'PRODUCTO_NO_ENCONTRADO';
    end if;
    v_producto_texto := v_linea ->> 'producto_id';

    if jsonb_typeof(v_linea -> 'cantidad') is distinct from 'number' then
      raise exception 'CANTIDAD_INVALIDA';
    end if;
    v_cantidad_num := (v_linea ->> 'cantidad')::numeric;
    if v_cantidad_num <> trunc(v_cantidad_num)
      or v_cantidad_num <= 0
      or v_cantidad_num > 2147483647 then
      raise exception 'CANTIDAD_INVALIDA';
    end if;

    if v_producto_texto::uuid = any (v_producto_ids) then
      raise exception 'PRODUCTO_REPETIDO';
    end if;

    v_producto_ids := v_producto_ids || v_producto_texto::uuid;
    v_cantidades := v_cantidades || v_cantidad_num::integer;
  end loop;

  -- Bloqueo en orden de id para que dos pedidos simultáneos no se interbloqueen.
  for v_producto in
    select p.id
    from public.productos p
    where p.id = any (v_producto_ids)
    order by p.id
    for update
  loop
    v_bloqueados := v_bloqueados + 1;
  end loop;

  if v_bloqueados <> cardinality(v_producto_ids) then
    raise exception 'PRODUCTO_NO_ENCONTRADO';
  end if;

  -- Con los productos bloqueados, se comprueba el stock de todas las líneas antes de escribir.
  select p.nombre
  into v_sin_stock
  from unnest(v_producto_ids, v_cantidades) with ordinality as l (producto_id, cantidad, orden)
  join public.productos p on p.id = l.producto_id
  where p.stock < l.cantidad
  order by l.orden
  limit 1;

  if found then
    raise exception 'STOCK_INSUFICIENTE: %', v_sin_stock;
  end if;

  select coalesce(sum(p.precio_cents::bigint * l.cantidad), 0)
  into v_total
  from unnest(v_producto_ids, v_cantidades) as l (producto_id, cantidad)
  join public.productos p on p.id = l.producto_id;

  if v_total > 2147483647 then
    raise exception 'TOTAL_DEMASIADO_ALTO';
  end if;

  insert into public.pedidos (cliente_id, estado, total_cents)
  values (p_cliente_id, 'pendiente', v_total::integer)
  returning id into v_pedido_id;

  insert into public.pedido_lineas (pedido_id, producto_id, cantidad, precio_unit_cents)
  select v_pedido_id, p.id, l.cantidad, p.precio_cents
  from unnest(v_producto_ids, v_cantidades) as l (producto_id, cantidad)
  join public.productos p on p.id = l.producto_id;

  update public.productos p
  set stock = p.stock - l.cantidad
  from unnest(v_producto_ids, v_cantidades) as l (producto_id, cantidad)
  where p.id = l.producto_id;

  return v_pedido_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancelar_pedido: solo desde 'pendiente'. Devuelve el stock de cada línea una
-- sola vez (el pedido queda bloqueado y deja de estar pendiente).
-- ---------------------------------------------------------------------------

create or replace function public.cancelar_pedido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
  v_producto record;
begin
  select pe.estado
  into v_estado
  from public.pedidos pe
  where pe.id = p_pedido_id
  for update;

  if not found then
    raise exception 'PEDIDO_NO_ENCONTRADO';
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'ESTADO_INVALIDO';
  end if;

  -- Mismo orden de bloqueo que crear_pedido (por id) para evitar interbloqueos.
  for v_producto in
    select p.id
    from public.productos p
    where p.id in (
      select pl.producto_id from public.pedido_lineas pl where pl.pedido_id = p_pedido_id
    )
    order by p.id
    for update
  loop
    null;
  end loop;

  update public.productos p
  set stock = p.stock + pl.cantidad
  from public.pedido_lineas pl
  where pl.pedido_id = p_pedido_id
    and p.id = pl.producto_id;

  update public.pedidos pe
  set estado = 'cancelado',
      cancelado_at = now()
  where pe.id = p_pedido_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- enviar_pedido: solo desde 'pendiente'.
-- ---------------------------------------------------------------------------

create or replace function public.enviar_pedido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
begin
  select pe.estado
  into v_estado
  from public.pedidos pe
  where pe.id = p_pedido_id
  for update;

  if not found then
    raise exception 'PEDIDO_NO_ENCONTRADO';
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'ESTADO_INVALIDO';
  end if;

  update public.pedidos pe
  set estado = 'enviado',
      enviado_at = now()
  where pe.id = p_pedido_id;
end;
$$;

revoke execute on function public.crear_pedido(uuid, jsonb) from public, anon;
revoke execute on function public.cancelar_pedido(uuid) from public, anon;
revoke execute on function public.enviar_pedido(uuid) from public, anon;

grant execute on function public.crear_pedido(uuid, jsonb) to authenticated;
grant execute on function public.cancelar_pedido(uuid) to authenticated;
grant execute on function public.enviar_pedido(uuid) to authenticated;
