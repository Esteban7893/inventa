-- Inventa — tests pgTAP de T13 (pedidos idempotentes, D30): crear_pedido con
-- p_idempotency_key. Misma clave y mismo contenido -> el mismo pedido, sin descontar stock ni
-- crear líneas otra vez (también si el stock se agotó, cambió el precio o el pedido se
-- canceló); claves distintas o sin clave -> pedidos nuevos; la llamada antigua de dos
-- argumentos sigue funcionando; misma clave con otro contenido -> CLAVE_REUTILIZADA; una
-- llamada que falla no gasta la clave; aislamiento entre usuarios (la clave es por usuario);
-- bloqueo consultivo por (usuario, clave); una sola función crear_pedido con sus permisos,
-- la columna y la restricción unique.
-- La concurrencia real (dos sesiones a la vez) no se puede probar desde un único archivo: el
-- test comprueba que cada llamada con clave toma el bloqueo por (usuario, clave) en el que
-- se apoya.
-- Compatible con `supabase test db --linked` (pg_prove) y con `supabase db query --linked -f`:
-- toda la salida TAP sale de un único select. Termina en rollback: no deja datos.

begin;

-- Ayudantes (como en 03_aislamiento_y_reglas.sql): ejecutan p_sql con el rol y los claims de
-- p_claims y vuelven al rol de la sesión. pg_temp.como cambia de rol fuera de cualquier bloque
-- que capture errores: si el cambio falla, el archivo entero falla (no pasa en vacío).
create function pg_temp.como(p_claims jsonb)
returns void
language plpgsql
as $$
begin
  execute format('set local role %I', p_claims ->> 'role');
  if current_user::text <> p_claims ->> 'role' then
    raise exception 'CAMBIO_DE_ROL_FALLIDO: %', p_claims ->> 'role';
  end if;
  perform set_config('request.jwt.claims', p_claims::text, true);
end;
$$;

-- SQLSTATE del error, o '00000' si no falla.
create function pg_temp.sqlstate_de(p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
declare
  v_resultado text := '00000';
begin
  perform pg_temp.como(p_claims);
  begin
    execute p_sql;
  exception when others then
    v_resultado := sqlstate;
  end;
  reset role;
  return v_resultado;
end;
$$;

-- Mensaje del error, o 'SIN_ERROR' si no falla.
create function pg_temp.mensaje_de(p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
declare
  v_resultado text := 'SIN_ERROR';
begin
  perform pg_temp.como(p_claims);
  begin
    execute p_sql;
  exception when others then
    v_resultado := sqlerrm;
  end;
  reset role;
  return v_resultado;
end;
$$;

-- Primer valor de la primera fila de p_sql, como texto. Un error aborta el archivo (rojo).
create function pg_temp.valor_de(p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
declare
  v_valor text;
begin
  perform pg_temp.como(p_claims);
  execute p_sql into v_valor;
  reset role;
  return v_valor;
end;
$$;

-- Primer valor de la primera fila de p_sql o, si falla, 'ERROR: <mensaje>'. Para los casos
-- en que un mutante podría devolver un valor o lanzar un error: los dos se ven en el test.
create function pg_temp.resultado_de(p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
declare
  v_valor text;
begin
  perform pg_temp.como(p_claims);
  begin
    execute p_sql into v_valor;
  exception when others then
    v_valor := 'ERROR: ' || sqlerrm;
  end;
  reset role;
  return v_valor;
end;
$$;

-- Bloqueos consultivos que tiene esta sesión (los de transacción duran hasta el rollback).
create function pg_temp.bloqueos()
returns integer
language sql
as $$
  select count(*)::integer from pg_catalog.pg_locks l
  where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid() and l.granted
$$;

create function pg_temp.run_tests()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_k1 uuid := gen_random_uuid();
  v_k2 uuid := gen_random_uuid();
  v_k3 uuid := gen_random_uuid();
  v_k4 uuid := gen_random_uuid();
  v_anon constant jsonb := '{"role":"anon"}';
  v_sin_sub constant jsonb := '{"role":"authenticated"}';
  -- Llamada con clave en notación por nombre, como la hará PostgREST desde la app nueva.
  v_con_clave constant text :=
    'select public.crear_pedido(p_cliente_id => %L, p_lineas => %L::jsonb, p_idempotency_key => %L)';
  v_ja jsonb;
  v_jb jsonb;
  v_p1 uuid;
  v_p2 uuid;
  v_p3 uuid;
  v_pb uuid;
  v_ca uuid;
  v_ca2 uuid;
  v_cb uuid;
  v_l jsonb;
  v_l_reordenada jsonb;
  v_o1 uuid;
  v_o2 uuid;
  v_o3 uuid;
  v_ob uuid;
  v_n1 uuid;
  v_n2 uuid;
  v_v1 uuid;
  v_v2 uuid;
  v_bloqueos integer;
  v_estado text;
begin
  return next extensions.plan(41);

  -- -------------------------------------------------------------------------
  -- Catálogo: una sola crear_pedido, su firma, definer, search_path, permisos, columna y
  -- restricción unique.
  -- -------------------------------------------------------------------------

  return next extensions.set_eq(
    $sql$
      select p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'
      from pg_catalog.pg_proc p
      where p.proname = 'crear_pedido'
    $sql$,
    array['crear_pedido(uuid, jsonb, uuid)'],
    '01 - hay exactamente una funcion crear_pedido en toda la base de datos: crear_pedido(uuid, jsonb, uuid)'
  );
  return next extensions.is(
    (select pg_catalog.pg_get_function_arguments(p.oid) || ' -> ' || pg_catalog.pg_get_function_result(p.oid)
       || ' | defaults=' || p.pronargdefaults
     from pg_catalog.pg_proc p
     where p.oid = 'public.crear_pedido(uuid, jsonb, uuid)'::regprocedure),
    'p_cliente_id uuid, p_lineas jsonb, p_idempotency_key uuid DEFAULT NULL::uuid -> uuid | defaults=1',
    '02 - crear_pedido(p_cliente_id, p_lineas, p_idempotency_key default null) devuelve uuid'
  );
  return next extensions.is(
    (select p.prosecdef::text || '|' || array_to_string(p.proconfig, ',')
     from pg_catalog.pg_proc p
     where p.oid = 'public.crear_pedido(uuid, jsonb, uuid)'::regprocedure),
    'true|search_path=""',
    '03 - crear_pedido es security definer y tiene search_path vacio'
  );
  return next extensions.is(
    (select pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')::text
       || '|' || pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')::text
       || '|' || pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
     from pg_catalog.pg_proc p
     where p.oid = 'public.crear_pedido(uuid, jsonb, uuid)'::regprocedure),
    'false|false|true',
    '04 - EXECUTE sobre crear_pedido: PUBLIC no, anon no, authenticated si'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, $sql$select public.crear_pedido(p_cliente_id => gen_random_uuid(), p_lineas => '[]'::jsonb)$sql$)
      || '|' || pg_temp.sqlstate_de(v_anon, $sql$select public.crear_pedido(gen_random_uuid(), '[]'::jsonb, gen_random_uuid())$sql$),
    '42501|42501',
    '05 - anon no puede ejecutar crear_pedido ni con dos ni con tres argumentos (42501)'
  );
  return next extensions.is(
    (select pg_catalog.format_type(a.atttypid, a.atttypmod) || '|notnull=' || a.attnotnull || '|default=' || a.atthasdef
     from pg_catalog.pg_attribute a
     where a.attrelid = 'public.pedidos'::regclass
       and a.attname = 'idempotency_key'
       and not a.attisdropped),
    'uuid|notnull=false|default=false',
    '06 - pedidos.idempotency_key es uuid, admite null y no tiene default'
  );
  return next extensions.is(
    (select c.contype::text || '|' || pg_catalog.pg_get_constraintdef(c.oid)
     from pg_catalog.pg_constraint c
     where c.conrelid = 'public.pedidos'::regclass
       and c.conname = 'pedidos_owner_id_idempotency_key_key'),
    'u|UNIQUE (owner_id, idempotency_key)',
    '07 - restriccion unique (owner_id, idempotency_key) en pedidos (con nulls distinct)'
  );
  -- Lo que no se ve en una sola sesión: el bloqueo es de transacción (pg_advisory_xact_lock,
  -- no de sesión) y va antes de buscar la clave, y la búsqueda antes de bloquear los productos.
  return next extensions.is(
    (select strpos(p.prosrc, 'pg_advisory_xact_lock(') > 0
       and strpos(p.prosrc, 'pg_advisory_xact_lock(') < strpos(p.prosrc, 'pe.idempotency_key = p_idempotency_key')
       and strpos(p.prosrc, 'pe.idempotency_key = p_idempotency_key') < strpos(p.prosrc, 'for update')
       and strpos(p.prosrc, 'pg_advisory_lock(') = 0
     from pg_catalog.pg_proc p
     where p.oid = 'public.crear_pedido(uuid, jsonb, uuid)'::regprocedure),
    true,
    '08 - crear_pedido toma pg_advisory_xact_lock antes de buscar la clave, y busca la clave antes de bloquear los productos (for update)'
  );

  -- -------------------------------------------------------------------------
  -- Datos: A (el caso completo) y B (otro usuario). Usuarios ficticios de prueba (se
  -- deshacen con rollback al terminar).
  -- -------------------------------------------------------------------------

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-t13-a-' || v_a::text || '@inventa.test', now(), now()),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-t13-b-' || v_b::text || '@inventa.test', now(), now());
  v_ja := jsonb_build_object('sub', v_a, 'role', 'authenticated');
  v_jb := jsonb_build_object('sub', v_b, 'role', 'authenticated');

  v_p1 := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Cafe', 250, 100) returning id$sql$)::uuid;
  v_p2 := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Taza', 900, 50) returning id$sql$)::uuid;
  v_p3 := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Molinillo', 5000, 1) returning id$sql$)::uuid;
  v_ca := pg_temp.valor_de(v_ja, $sql$insert into public.clientes (nombre) values ('Cliente A') returning id$sql$)::uuid;
  v_ca2 := pg_temp.valor_de(v_ja, $sql$insert into public.clientes (nombre) values ('Otro cliente A') returning id$sql$)::uuid;
  v_pb := pg_temp.valor_de(v_jb, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Producto B', 300, 20) returning id$sql$)::uuid;
  v_cb := pg_temp.valor_de(v_jb, $sql$insert into public.clientes (nombre) values ('Cliente B') returning id$sql$)::uuid;

  v_l := jsonb_build_array(
    jsonb_build_object('producto_id', v_p1, 'cantidad', 2),
    jsonb_build_object('producto_id', v_p2, 'cantidad', 1)
  );
  v_l_reordenada := jsonb_build_array(
    jsonb_build_object('producto_id', v_p2, 'cantidad', 1),
    jsonb_build_object('producto_id', v_p1, 'cantidad', 2)
  );

  return next extensions.is(
    pg_temp.mensaje_de(v_sin_sub, format(v_con_clave, v_ca, v_l, v_k1)),
    'NO_AUTENTICADO',
    '09 - crear_pedido con clave y sin sesion (sin sub) rechaza con NO_AUTENTICADO'
  );

  -- -------------------------------------------------------------------------
  -- Misma clave y mismo contenido: un solo pedido.
  -- -------------------------------------------------------------------------

  v_bloqueos := pg_temp.bloqueos();
  v_o1 := pg_temp.valor_de(v_ja, format(v_con_clave, v_ca, v_l, v_k1))::uuid;

  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select concat_ws(%L, idempotency_key, estado, total_cents) from public.pedidos where id = %L', '|', v_o1)),
    v_k1::text || '|pendiente|1400',
    '10 - la primera llamada con la clave crea el pedido pendiente (2*250 + 900 = 1400) y guarda la clave'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, v_l, v_k1)),
    v_o1::text,
    '11 - la segunda llamada con la misma clave y el mismo contenido devuelve el mismo id'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format('select public.crear_pedido(%L, %L::jsonb, %L)', v_ca, v_l_reordenada, v_k1)),
    v_o1::text,
    '12 - con las mismas lineas en otro orden (y notacion posicional) tambien devuelve el mismo id'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, 'select count(*) from public.pedidos'),
    '1',
    '13 - tras tres llamadas con la misma clave, A tiene un solo pedido'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      $sql$select string_agg(pr.nombre || 'x' || pl.cantidad, ',' order by pr.nombre)
           from public.pedido_lineas pl join public.productos pr on pr.id = pl.producto_id
           where pl.pedido_id = %L$sql$, v_o1))
      || '|' || pg_temp.valor_de(v_ja, 'select count(*) from public.pedido_lineas'),
    'Cafex2,Tazax1|2',
    '14 - el pedido tiene sus dos lineas una sola vez (no se crean lineas al repetir)'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select string_agg(stock::text, %L order by nombre) from public.productos where id in (%L, %L)', ',', v_p1, v_p2)),
    '98,49',
    '15 - el stock se descuenta una sola vez (Cafe 100 -> 98, Taza 50 -> 49)'
  );
  return next extensions.is(
    pg_temp.bloqueos(),
    v_bloqueos + 1,
    '16 - las llamadas con la clave toman un bloqueo consultivo (uno por usuario y clave) que dura hasta el final de la transaccion'
  );

  -- -------------------------------------------------------------------------
  -- Sin clave y llamada antigua de dos argumentos: como siempre.
  -- -------------------------------------------------------------------------

  v_bloqueos := pg_temp.bloqueos();
  v_n1 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(p_cliente_id => %L, p_lineas => %L::jsonb, p_idempotency_key => null)', v_ca, v_l))::uuid;
  v_n2 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(p_cliente_id => %L, p_lineas => %L::jsonb, p_idempotency_key => null)', v_ca, v_l))::uuid;
  return next extensions.is(
    (v_n1 <> v_n2 and v_n1 <> v_o1 and v_n2 <> v_o1)::text
      || '|' || pg_temp.valor_de(v_ja, format(
        'select count(*) from public.pedidos where id in (%L, %L) and idempotency_key is null', v_n1, v_n2)),
    'true|2',
    '17 - dos llamadas con clave null crean dos pedidos distintos, sin clave'
  );

  -- La llamada de main: rpc("crear_pedido", { p_cliente_id, p_lineas }) -> notación por nombre.
  v_v1 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(p_cliente_id => %L, p_lineas => %L::jsonb)', v_ca, v_l))::uuid;
  v_v2 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(%L, %L::jsonb)', v_ca, v_l))::uuid;
  return next extensions.is(
    (v_v1 <> v_v2 and v_v1 not in (v_o1, v_n1, v_n2) and v_v2 not in (v_o1, v_n1, v_n2))::text
      || '|' || pg_temp.valor_de(v_ja, format(
        'select count(*) || %L || sum(total_cents) from public.pedidos where id in (%L, %L) and idempotency_key is null and estado = %L',
        '|', v_v1, v_v2, 'pendiente')),
    'true|2|2800',
    '18 - la llamada antigua de dos argumentos (por nombre, como PostgREST, y posicional) crea un pedido nuevo cada vez, sin clave'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select string_agg(stock::text, %L order by nombre) from public.productos where id in (%L, %L)', ',', v_p1, v_p2))
      || '|' || pg_temp.valor_de(v_ja, 'select count(*) from public.pedidos'),
    '90,45|5',
    '19 - sin clave cada llamada descuenta stock (98 - 4*2 = 90, 49 - 4 = 45): 5 pedidos de A'
  );
  return next extensions.is(
    pg_temp.bloqueos(),
    v_bloqueos,
    '20 - las llamadas sin clave no toman ningun bloqueo consultivo'
  );

  -- -------------------------------------------------------------------------
  -- Otra clave con el mismo contenido: otro pedido.
  -- -------------------------------------------------------------------------

  v_bloqueos := pg_temp.bloqueos();
  v_o2 := pg_temp.valor_de(v_ja, format(v_con_clave, v_ca, v_l, v_k2))::uuid;
  return next extensions.is(
    (v_o2 not in (v_o1, v_n1, v_n2, v_v1, v_v2))::text
      || '|' || pg_temp.valor_de(v_ja, format('select idempotency_key from public.pedidos where id = %L', v_o2))
      || '|' || pg_temp.valor_de(v_ja, format(
        'select string_agg(stock::text, %L order by nombre) from public.productos where id in (%L, %L)', ',', v_p1, v_p2)),
    'true|' || v_k2::text || '|88,44',
    '21 - otra clave con el mismo contenido crea otro pedido con su clave y vuelve a descontar stock'
  );
  return next extensions.is(
    pg_temp.bloqueos(),
    v_bloqueos + 1,
    '22 - la clave nueva toma su propio bloqueo consultivo'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, v_l, v_k1))
      || '|' || pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, v_l, v_k2)),
    v_o1::text || '|' || v_o2::text,
    '23 - cada clave sigue devolviendo su propio pedido'
  );

  -- -------------------------------------------------------------------------
  -- Misma clave con otro contenido: CLAVE_REUTILIZADA, sin tocar nada.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca2, v_l, v_k1)),
    'ERROR: CLAVE_REUTILIZADA',
    '24 - la misma clave con otro cliente rechaza con CLAVE_REUTILIZADA'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'cantidad', 3),
      jsonb_build_object('producto_id', v_p2, 'cantidad', 1)), v_k1)),
    'ERROR: CLAVE_REUTILIZADA',
    '25 - la misma clave con otra cantidad rechaza con CLAVE_REUTILIZADA'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'cantidad', 2)), v_k1)),
    'ERROR: CLAVE_REUTILIZADA',
    '26 - la misma clave con menos lineas rechaza con CLAVE_REUTILIZADA'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, v_l || jsonb_build_array(
      jsonb_build_object('producto_id', v_p3, 'cantidad', 1)), v_k1)),
    'ERROR: CLAVE_REUTILIZADA',
    '27 - la misma clave con una linea de mas rechaza con CLAVE_REUTILIZADA'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'cantidad', 2),
      jsonb_build_object('producto_id', v_p3, 'cantidad', 1)), v_k1)),
    'ERROR: CLAVE_REUTILIZADA',
    '28 - la misma clave con otro producto (mismo numero de lineas) rechaza con CLAVE_REUTILIZADA'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select string_agg(stock::text, %L order by nombre) from public.productos', ','))
      || '|' || pg_temp.valor_de(v_ja, 'select count(*) from public.pedidos')
      || '|' || pg_temp.valor_de(v_ja, 'select count(*) from public.pedido_lineas'),
    '88,1,44|6|12',
    '29 - los intentos rechazados no crean pedidos ni lineas ni tocan el stock (Cafe, Molinillo, Taza)'
  );

  -- -------------------------------------------------------------------------
  -- La repetición devuelve el pedido aunque el stock o el precio hayan cambiado o el pedido
  -- ya esté cancelado: no vuelve a comprobar ni a descontar stock.
  -- -------------------------------------------------------------------------

  perform pg_temp.valor_de(v_ja, format(
    'update public.productos set stock = 0, precio_cents = 999 where id = %L returning id', v_p1));
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, v_l, v_k1))
      || '|' || pg_temp.valor_de(v_ja, format('select stock from public.productos where id = %L', v_p1))
      || '|' || pg_temp.valor_de(v_ja, format('select total_cents from public.pedidos where id = %L', v_o1)),
    v_o1::text || '|0|1400',
    '30 - con Cafe agotado y su precio cambiado, repetir la clave devuelve el mismo pedido (sin STOCK_INSUFICIENTE ni cambiar el total)'
  );
  perform pg_temp.valor_de(v_ja, format(
    'update public.productos set stock = 88, precio_cents = 250 where id = %L returning id', v_p1));

  perform pg_temp.valor_de(v_ja, format('select public.cancelar_pedido(%L)', v_o1));
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, v_l, v_k1))
      || '|' || pg_temp.valor_de(v_ja, format('select estado from public.pedidos where id = %L', v_o1))
      || '|' || pg_temp.valor_de(v_ja, format(
        'select string_agg(stock::text, %L order by nombre) from public.productos where id in (%L, %L)', ',', v_p1, v_p2))
      || '|' || pg_temp.valor_de(v_ja, 'select count(*) from public.pedidos'),
    v_o1::text || '|cancelado|90,45|6',
    '31 - tras cancelar el pedido, repetir la clave devuelve ese pedido cancelado y no descuenta (90,45 = 88,44 + lo devuelto)'
  );

  -- -------------------------------------------------------------------------
  -- Una llamada que falla no gasta la clave; las validaciones siguen igual con clave.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, jsonb_build_array(
      jsonb_build_object('producto_id', v_p3, 'cantidad', 5)), v_k3)),
    'ERROR: STOCK_INSUFICIENTE: Molinillo',
    '32 - con clave, una linea sin stock rechaza con STOCK_INSUFICIENTE'
  );
  v_o3 := pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, jsonb_build_array(
    jsonb_build_object('producto_id', v_p3, 'cantidad', 1)), v_k3))::uuid;
  return next extensions.is(
    (v_o3 not in (v_o1, v_o2, v_n1, v_n2, v_v1, v_v2))::text
      || '|' || pg_temp.valor_de(v_ja, format(
        'select idempotency_key || %L || total_cents from public.pedidos where id = %L', '|', v_o3))
      || '|' || pg_temp.valor_de(v_ja, format('select stock from public.productos where id = %L', v_p3)),
    'true|' || v_k3::text || '|5000|0',
    '33 - la misma clave, tras el fallo y con una cantidad posible, crea el pedido (el intento fallido no la gasto)'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_ja, format(v_con_clave, v_ca, '[]', v_k4))
      || '|' || pg_temp.mensaje_de(v_ja, format(v_con_clave, v_cb, v_l, v_k4))
      || '|' || pg_temp.mensaje_de(v_ja, format(v_con_clave, v_ca, jsonb_build_array(
        jsonb_build_object('producto_id', v_pb, 'cantidad', 1)), v_k4)),
    'PEDIDO_VACIO|CLIENTE_NO_ENCONTRADO|PRODUCTO_NO_ENCONTRADO',
    '34 - con clave siguen las validaciones: lineas vacias, cliente ajeno y producto ajeno'
  );

  -- -------------------------------------------------------------------------
  -- Aislamiento: la clave es por usuario.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    pg_temp.resultado_de(v_jb, format(v_con_clave, v_ca, v_l, v_k1)),
    'ERROR: CLIENTE_NO_ENCONTRADO',
    '35 - B con la clave y el contenido de A no recibe el pedido de A (CLIENTE_NO_ENCONTRADO)'
  );
  v_bloqueos := pg_temp.bloqueos();
  v_ob := pg_temp.resultado_de(v_jb, format(v_con_clave, v_cb, jsonb_build_array(
    jsonb_build_object('producto_id', v_pb, 'cantidad', 3)), v_k1))::uuid;
  return next extensions.is(
    (v_ob <> v_o1)::text
      || '|' || (select p.owner_id = v_b and p.idempotency_key = v_k1 from public.pedidos p where p.id = v_ob)::text
      || '|' || pg_temp.valor_de(v_jb, 'select count(*) from public.pedidos')
      || '|' || pg_temp.valor_de(v_jb, format('select count(*) from public.pedidos where id = %L', v_o1))
      || '|' || pg_temp.valor_de(v_jb, format('select stock from public.productos where id = %L', v_pb)),
    'true|true|1|0|17',
    '36 - B con la misma clave que A crea su propio pedido (suyo, con esa clave); B solo ve ese y no el de A; su stock baja una vez (20 -> 17)'
  );
  return next extensions.is(
    pg_temp.bloqueos(),
    v_bloqueos + 1,
    '37 - el bloqueo es por usuario y clave: B con la clave de A toma otro bloqueo'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(v_con_clave, v_ca, v_l, v_k1))
      || '|' || pg_temp.resultado_de(v_jb, format(v_con_clave, v_cb, jsonb_build_array(
        jsonb_build_object('producto_id', v_pb, 'cantidad', 3)), v_k1)),
    v_o1::text || '|' || v_ob::text,
    '38 - con la misma clave, A sigue recibiendo su pedido y B el suyo'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select string_agg(stock::text, %L order by nombre) from public.productos', ','))
      || '|' || pg_temp.valor_de(v_ja, 'select count(*) from public.pedidos')
      || '|' || pg_temp.valor_de(v_jb, format('select stock from public.productos where id = %L', v_pb))
      || '|' || pg_temp.valor_de(v_jb, 'select count(*) from public.pedidos'),
    '90,0,45|7|17|1',
    '39 - lo que hace B no cambia el stock ni los pedidos de A, y repetir no descuenta a B otra vez'
  );

  -- -------------------------------------------------------------------------
  -- La restricción unique (red de seguridad por debajo de la función).
  -- -------------------------------------------------------------------------

  v_estado := '00000';
  begin
    insert into public.pedidos (owner_id, cliente_id, estado, total_cents, idempotency_key)
    values (v_a, v_ca, 'pendiente', 0, v_k1);
  exception when others then
    v_estado := sqlstate;
  end;
  return next extensions.is(
    v_estado,
    '23505',
    '40 - un segundo pedido de A con la misma clave viola la restriccion unique (23505)'
  );
  v_estado := '00000';
  begin
    insert into public.pedidos (owner_id, cliente_id, estado, total_cents, idempotency_key)
    values (v_b, v_cb, 'pendiente', 0, v_k2), (v_a, v_ca, 'pendiente', 0, null), (v_a, v_ca, 'pendiente', 0, null);
  exception when others then
    v_estado := sqlstate;
  end;
  return next extensions.is(
    v_estado,
    '00000',
    '41 - la misma clave en otro usuario y varias claves null en el mismo usuario no chocan'
  );

  return query select * from extensions.finish();
end;
$$;

select * from pg_temp.run_tests();

rollback;
