-- Inventa — T11: consultas que escalan.
-- - Orden de nombres en español (ñ después de n, "Item 2" antes que "Item 10") en SQL.
-- - Índices compuestos para los listados paginados, los filtros y el panel.
-- - public.panel_resumen(): las cifras del panel calculadas en SQL.
-- - public.productos_bajo_minimo(): la lista de stock bajo, con límite.
-- - public.pedidos_pagina(): listado de pedidos por cursor (created_at, id), con límite.
--
-- Añade una colación, índices y tres funciones. Lo único que altera es la colación de
-- productos.nombre y clientes.nombre (ver abajo): no cambia ninguna firma ni ningún
-- comportamiento de lo que usa el código de main.
-- Las tres funciones son security invoker: el aislamiento entre usuarios lo da RLS.

-- ---------------------------------------------------------------------------
-- Orden alfabético en español
-- ---------------------------------------------------------------------------

-- La app ordena con Intl.Collator("es", { numeric: true }). La base de datos usa en-US, que
-- pone "Ñu" antes que "Nube" e "Item 10" antes que "Item 2". Al paginar, el orden lo da SQL,
-- así que nombre pasa a ordenarse como en la app. La colación es determinista: la igualdad
-- sigue siendo byte a byte y ilike sigue funcionando. Ninguna consulta de main ordena por
-- nombre en SQL (lo hace en JavaScript), así que su comportamiento no cambia.
create collation public.es_natural (provider = icu, locale = 'es-u-kn');

alter table public.productos alter column nombre type text collate public.es_natural;
alter table public.clientes alter column nombre type text collate public.es_natural;

-- ---------------------------------------------------------------------------
-- Índices (cada uno sirve a una consulta concreta)
-- ---------------------------------------------------------------------------

-- Listado de pedidos del más nuevo al más antiguo, paginado por cursor (created_at, id),
-- los últimos pedidos del panel y el rango de dos meses de panel_resumen().
create index pedidos_owner_created_idx
  on public.pedidos (owner_id, created_at desc, id desc);

-- Listado filtrado por estado (/pedidos?estado=pendiente) y recuento de pendientes del panel.
create index pedidos_owner_estado_created_idx
  on public.pedidos (owner_id, estado, created_at desc, id desc);

-- Listados de productos y clientes por nombre, con desempate por id para paginar.
create index productos_owner_nombre_idx
  on public.productos (owner_id, nombre, id);
create index clientes_owner_nombre_idx
  on public.clientes (owner_id, nombre, id);

-- productos_bajo_minimo(): solo los productos bajo mínimo, en el orden de la lista.
create index productos_bajo_minimo_idx
  on public.productos (owner_id, (stock - stock_minimo), nombre, id)
  where stock <= stock_minimo;

-- ---------------------------------------------------------------------------
-- panel_resumen: las cifras del panel para el mes natural de Madrid en que cae p_ahora
-- (por defecto, ahora). Mismo criterio que src/lib/domain/dashboard.ts:
-- - el mes va de las 00:00 del día 1 (hora de Madrid, con su horario de verano) a las
--   00:00 del día 1 siguiente, sin incluirlo;
-- - pedidos_mes e ingresos_mes_cents cuentan los pedidos enviados y pendientes; los
--   cancelados no suman y se cuentan aparte en cancelados_mes;
-- - pendientes: pedidos pendientes de enviar, sean del mes que sean;
-- - un producto está bajo mínimo si stock <= stock_minimo.
-- mes_actual y mes_anterior ("AAAA-MM") son los meses que se han usado: la página los
-- muestra para que el título y las cifras no puedan referirse a meses distintos.
-- ---------------------------------------------------------------------------

create function public.panel_resumen(p_ahora timestamptz default null)
returns table (
  mes_actual text,
  mes_anterior text,
  pedidos_mes integer,
  cancelados_mes integer,
  ingresos_mes_cents bigint,
  pedidos_mes_anterior integer,
  cancelados_mes_anterior integer,
  ingresos_mes_anterior_cents bigint,
  pendientes integer,
  productos integer,
  unidades bigint,
  productos_bajo_minimo integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  -- Inicio del mes en la hora local de Madrid (timestamp sin zona).
  v_mes timestamp;
  v_inicio_anterior timestamptz;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  v_mes := date_trunc('month', coalesce(p_ahora, now()) at time zone 'Europe/Madrid');
  v_inicio_anterior := (v_mes - interval '1 month') at time zone 'Europe/Madrid';
  v_inicio := v_mes at time zone 'Europe/Madrid';
  v_fin := (v_mes + interval '1 month') at time zone 'Europe/Madrid';

  return query
  with
    dos_meses as (
      select
        count(*) filter (where pe.created_at >= v_inicio and pe.estado <> 'cancelado')::integer as pedidos,
        count(*) filter (where pe.created_at >= v_inicio and pe.estado = 'cancelado')::integer as cancelados,
        coalesce(sum(pe.total_cents) filter (
          where pe.created_at >= v_inicio and pe.estado <> 'cancelado'), 0)::bigint as ingresos,
        count(*) filter (where pe.created_at < v_inicio and pe.estado <> 'cancelado')::integer as pedidos_ant,
        count(*) filter (where pe.created_at < v_inicio and pe.estado = 'cancelado')::integer as cancelados_ant,
        coalesce(sum(pe.total_cents) filter (
          where pe.created_at < v_inicio and pe.estado <> 'cancelado'), 0)::bigint as ingresos_ant
      from public.pedidos pe
      where pe.created_at >= v_inicio_anterior
        and pe.created_at < v_fin
    ),
    por_enviar as (
      select count(*)::integer as total
      from public.pedidos pe
      where pe.estado = 'pendiente'
    ),
    inventario as (
      select
        count(*)::integer as total,
        coalesce(sum(pr.stock), 0)::bigint as stock,
        count(*) filter (where pr.stock <= pr.stock_minimo)::integer as bajo_minimo
      from public.productos pr
    )
  select
    to_char(v_mes, 'YYYY-MM'),
    to_char(v_mes - interval '1 month', 'YYYY-MM'),
    dm.pedidos,
    dm.cancelados,
    dm.ingresos,
    dm.pedidos_ant,
    dm.cancelados_ant,
    dm.ingresos_ant,
    pv.total,
    inv.total,
    inv.stock,
    inv.bajo_minimo
  from dos_meses dm
  cross join por_enviar pv
  cross join inventario inv;
end;
$$;

-- ---------------------------------------------------------------------------
-- productos_bajo_minimo: productos con stock <= stock_minimo, primero los que más se
-- alejan del mínimo y luego por nombre (como summarizeInventory). Devuelve como mucho
-- p_limite filas (por defecto 10, entre 1 y 100). El total está en panel_resumen().
-- ---------------------------------------------------------------------------

create function public.productos_bajo_minimo(p_limite integer default null)
returns setof public.productos
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  return query
  select pr.*
  from public.productos pr
  where pr.stock <= pr.stock_minimo
  order by pr.stock - pr.stock_minimo, pr.nombre, pr.id
  limit least(greatest(coalesce(p_limite, 10), 1), 100);
end;
$$;

-- ---------------------------------------------------------------------------
-- pedidos_pagina: una página del listado de pedidos, del más nuevo al más antiguo, con
-- el nombre del cliente y el nº de líneas y unidades de cada pedido.
-- - p_estado: null (todos) o 'pendiente' | 'enviado' | 'cancelado'; otro valor lanza
--   FILTRO_INVALIDO.
-- - Cursor: (p_antes_created_at, p_antes_id) del último pedido de la página anterior; la
--   página siguiente empieza justo después. Los dos a null es la primera página; solo
--   uno de los dos lanza CURSOR_INVALIDO.
-- - p_limite: por defecto 25, entre 1 y 100. Para saber si hay más, pide uno de más.
-- ---------------------------------------------------------------------------

create function public.pedidos_pagina(
  p_estado text default null,
  p_antes_created_at timestamptz default null,
  p_antes_id uuid default null,
  p_limite integer default null
)
returns table (
  id uuid,
  estado text,
  total_cents integer,
  created_at timestamptz,
  cliente_nombre text,
  lineas integer,
  unidades bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limite constant integer := least(greatest(coalesce(p_limite, 25), 1), 100);
  -- Sin cursor, la comparación (created_at, id) < (infinity, máximo) deja pasar todo.
  v_antes_created_at constant timestamptz := coalesce(p_antes_created_at, 'infinity'::timestamptz);
  v_antes_id constant uuid := coalesce(p_antes_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);
begin
  if auth.uid() is null then
    raise exception 'NO_AUTENTICADO';
  end if;
  if p_estado is not null and p_estado not in ('pendiente', 'enviado', 'cancelado') then
    raise exception 'FILTRO_INVALIDO';
  end if;
  if (p_antes_created_at is null) <> (p_antes_id is null) then
    raise exception 'CURSOR_INVALIDO';
  end if;

  -- Dos consultas en vez de "p_estado is null or ...": así cada una usa su índice.
  if p_estado is null then
    return query
    select pe.id, pe.estado, pe.total_cents, pe.created_at, cl.nombre::text, li.lineas, li.unidades
    from (
      select x.id, x.estado, x.total_cents, x.created_at, x.cliente_id
      from public.pedidos x
      where (x.created_at, x.id) < (v_antes_created_at, v_antes_id)
      order by x.created_at desc, x.id desc
      limit v_limite
    ) pe
    join public.clientes cl on cl.id = pe.cliente_id
    cross join lateral (
      select count(*)::integer as lineas, coalesce(sum(l.cantidad), 0)::bigint as unidades
      from public.pedido_lineas l
      where l.pedido_id = pe.id
    ) li
    order by pe.created_at desc, pe.id desc;
  else
    return query
    select pe.id, pe.estado, pe.total_cents, pe.created_at, cl.nombre::text, li.lineas, li.unidades
    from (
      select x.id, x.estado, x.total_cents, x.created_at, x.cliente_id
      from public.pedidos x
      where x.estado = p_estado
        and (x.created_at, x.id) < (v_antes_created_at, v_antes_id)
      order by x.created_at desc, x.id desc
      limit v_limite
    ) pe
    join public.clientes cl on cl.id = pe.cliente_id
    cross join lateral (
      select count(*)::integer as lineas, coalesce(sum(l.cantidad), 0)::bigint as unidades
      from public.pedido_lineas l
      where l.pedido_id = pe.id
    ) li
    order by pe.created_at desc, pe.id desc;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: en Postgres una función nueva la puede ejecutar PUBLIC, y en Supabase los
-- privilegios por defecto la conceden además a anon y authenticated. Solo authenticated.
-- ---------------------------------------------------------------------------

revoke all on function public.panel_resumen(timestamptz) from public, anon, authenticated;
revoke all on function public.productos_bajo_minimo(integer) from public, anon, authenticated;
revoke all on function public.pedidos_pagina(text, timestamptz, uuid, integer) from public, anon, authenticated;

grant execute on function public.panel_resumen(timestamptz) to authenticated;
grant execute on function public.productos_bajo_minimo(integer) to authenticated;
grant execute on function public.pedidos_pagina(text, timestamptz, uuid, integer) to authenticated;
