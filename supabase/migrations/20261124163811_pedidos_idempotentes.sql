-- Inventa — T13: pedidos idempotentes (D30).
-- Un doble clic o un reintento de red no puede crear dos pedidos ni descontar el stock dos
-- veces. El formulario manda una clave (uuid) por intento; crear_pedido guarda la clave en el
-- pedido y, si el mismo usuario vuelve a llamar con esa clave, devuelve el mismo pedido sin
-- descontar stock ni crear líneas.
--
-- - pedidos.idempotency_key: uuid, null en los pedidos que ya existen y en las llamadas sin
--   clave. unique (owner_id, idempotency_key): la clave es única por usuario; los null no
--   chocan entre sí (nulls distinct, el comportamiento por defecto de Postgres).
-- - crear_pedido pasa a tener un tercer parámetro, p_idempotency_key uuid default null.
--   Compatibilidad con main: main llama rpc("crear_pedido", { p_cliente_id, p_lineas }).
--   Un create or replace con un parámetro más crearía una segunda función con el mismo nombre
--   (sobrecarga), y PostgREST no sabría a cuál llamar. Por eso se borra la de dos argumentos y
--   se crea la de tres en esta misma migración (una sola transacción en supabase db push):
--   queda exactamente una crear_pedido, y la llamada de main (sin la clave) usa el default null
--   y se comporta como siempre.
-- - Al borrar la función se pierden sus permisos: se vuelven a aplicar con la firma nueva.

-- ---------------------------------------------------------------------------
-- Columna y restricción
-- ---------------------------------------------------------------------------

alter table public.pedidos add column idempotency_key uuid;

alter table public.pedidos
  add constraint pedidos_owner_id_idempotency_key_key unique (owner_id, idempotency_key);

-- ---------------------------------------------------------------------------
-- crear_pedido: valida, bloquea los productos, comprueba el stock de todas las
-- líneas, crea el pedido con sus líneas y descuenta el stock. Todo o nada.
--
-- p_lineas: [{ "producto_id": "<uuid>", "cantidad": <entero > 0> }, ...]
-- p_idempotency_key: clave del intento (opcional). Devuelve el id del pedido.
--
-- Con clave:
-- - Si ya hay un pedido de este usuario con esa clave y el mismo contenido (mismo cliente y
--   mismas líneas producto/cantidad, en cualquier orden), devuelve ese id y no hace nada más:
--   ni comprueba ni descuenta stock ni crea líneas. Da igual que ese pedido ya esté enviado o
--   cancelado, o que el stock o los precios hayan cambiado: es la respuesta a la misma petición.
-- - Si la clave ya se usó con otro contenido, lanza CLAVE_REUTILIZADA. Devolver el pedido
--   original haría creer a la persona que se ha guardado lo que acaba de enviar (otro cliente u
--   otras cantidades) cuando no es así; un error claro no oculta el fallo del cliente que
--   reutilizó la clave.
-- - Una llamada que falla (p. ej. STOCK_INSUFICIENTE) no deja nada, así que la clave sigue
--   libre para reintentar.
--
-- Concurrencia: antes de buscar la clave, la función toma pg_advisory_xact_lock sobre
-- (usuario, clave). Una segunda llamada simultánea con la misma clave espera en ese bloqueo
-- hasta que la primera termina (commit o rollback). En READ COMMITTED (el nivel de PostgREST)
-- cada sentencia ve lo confirmado al empezar, y la búsqueda es una sentencia posterior al
-- bloqueo: si la primera confirmó, la segunda encuentra su pedido y lo devuelve; si falló,
-- no encuentra nada y crea el pedido ella. Así nunca llegan dos inserciones con la misma clave
-- al unique (que queda como red de seguridad) ni se crean dos pedidos. La búsqueda va antes de
-- bloquear los productos y de comprobar el stock: si fuera después, la segunda llamada vería el
-- stock ya descontado por la primera y podría fallar con STOCK_INSUFICIENTE en vez de devolver
-- el pedido. Siempre se bloquea en el mismo orden (clave y después productos por id), así que
-- no hay interbloqueos. Sin clave no se toma ningún bloqueo nuevo.
--
-- security definer: es la única vía para escribir pedidos. Por eso exige sesión y
-- filtra cada lectura y escritura por owner_id = v_uid (nunca toca filas de otro).
-- ---------------------------------------------------------------------------

drop function public.crear_pedido(uuid, jsonb);

create function public.crear_pedido(
  p_cliente_id uuid,
  p_lineas jsonb,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
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
  v_existente_cliente uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;

  if p_cliente_id is null
    or not exists (
      select 1 from public.clientes c where c.id = p_cliente_id and c.owner_id = v_uid
    ) then
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

  -- Idempotencia: bloqueo por (usuario, clave) y, después, búsqueda del pedido con esa clave.
  -- Tienen que ser dos sentencias: la búsqueda ve lo que otra llamada confirmó mientras esta
  -- esperaba el bloqueo.
  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'crear_pedido:' || v_uid::text || ':' || p_idempotency_key::text, 0
      )
    );

    select pe.id, pe.cliente_id
    into v_pedido_id, v_existente_cliente
    from public.pedidos pe
    where pe.owner_id = v_uid
      and pe.idempotency_key = p_idempotency_key;

    if found then
      if v_existente_cliente <> p_cliente_id
        or exists (
          select pl.producto_id, pl.cantidad
          from public.pedido_lineas pl
          where pl.pedido_id = v_pedido_id
            and pl.owner_id = v_uid
          except
          select l.producto_id, l.cantidad
          from unnest(v_producto_ids, v_cantidades) as l (producto_id, cantidad)
        )
        or exists (
          select l.producto_id, l.cantidad
          from unnest(v_producto_ids, v_cantidades) as l (producto_id, cantidad)
          except
          select pl.producto_id, pl.cantidad
          from public.pedido_lineas pl
          where pl.pedido_id = v_pedido_id
            and pl.owner_id = v_uid
        ) then
        raise exception 'CLAVE_REUTILIZADA';
      end if;

      return v_pedido_id;
    end if;
  end if;

  -- Bloqueo en orden de id para que dos pedidos simultáneos no se interbloqueen.
  for v_producto in
    select p.id
    from public.productos p
    where p.id = any (v_producto_ids)
      and p.owner_id = v_uid
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
  join public.productos p on p.id = l.producto_id and p.owner_id = v_uid
  where p.stock < l.cantidad
  order by l.orden
  limit 1;

  if found then
    raise exception 'STOCK_INSUFICIENTE: %', v_sin_stock;
  end if;

  select coalesce(sum(p.precio_cents::bigint * l.cantidad), 0)
  into v_total
  from unnest(v_producto_ids, v_cantidades) as l (producto_id, cantidad)
  join public.productos p on p.id = l.producto_id and p.owner_id = v_uid;

  if v_total > 2147483647 then
    raise exception 'TOTAL_DEMASIADO_ALTO';
  end if;

  insert into public.pedidos (owner_id, cliente_id, estado, total_cents, idempotency_key)
  values (v_uid, p_cliente_id, 'pendiente', v_total::integer, p_idempotency_key)
  returning id into v_pedido_id;

  insert into public.pedido_lineas (owner_id, pedido_id, producto_id, cantidad, precio_unit_cents)
  select v_uid, v_pedido_id, p.id, l.cantidad, p.precio_cents
  from unnest(v_producto_ids, v_cantidades) as l (producto_id, cantidad)
  join public.productos p on p.id = l.producto_id and p.owner_id = v_uid;

  update public.productos p
  set stock = p.stock - l.cantidad
  from unnest(v_producto_ids, v_cantidades) as l (producto_id, cantidad)
  where p.id = l.producto_id
    and p.owner_id = v_uid;

  return v_pedido_id;
end;
$$;

revoke execute on function public.crear_pedido(uuid, jsonb, uuid) from public, anon;
grant execute on function public.crear_pedido(uuid, jsonb, uuid) to authenticated;
