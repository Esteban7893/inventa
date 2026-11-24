-- Inventa — tests pgTAP de T11 (consultas que escalan, D28): panel_resumen(),
-- productos_bajo_minimo() y pedidos_pagina() con datos de varios usuarios (aislamiento por
-- RLS, límites del mes de Madrid con y sin horario de verano, cancelados fuera de los
-- ingresos, límites de filas y cursor), permisos (anon y PUBLIC no ejecutan, authenticated
-- sí), índices compuestos y orden alfabético en español.
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

-- Recorre pedidos_pagina página a página, como lo hará la app: cada página empieza con el
-- cursor (created_at, id) del último pedido de la anterior. Devuelve los ids en orden y el
-- número de páginas pedidas (la última, más corta que p_tam o vacía).
create function pg_temp.recorrer(p_claims jsonb, p_estado text, p_tam integer)
returns text
language plpgsql
as $$
declare
  v_ids text[] := '{}';
  v_created_at timestamptz;
  v_id uuid;
  v_filas integer;
  v_paginas integer := 0;
  r record;
begin
  perform pg_temp.como(p_claims);
  loop
    v_filas := 0;
    for r in select * from public.pedidos_pagina(p_estado, v_created_at, v_id, p_tam) loop
      v_ids := v_ids || r.id::text;
      v_created_at := r.created_at;
      v_id := r.id;
      v_filas := v_filas + 1;
    end loop;
    v_paginas := v_paginas + 1;
    exit when v_filas < p_tam or v_paginas > 50;
  end loop;
  reset role;
  return array_to_string(v_ids, ',') || '|paginas=' || v_paginas;
end;
$$;

create function pg_temp.run_tests()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_d uuid := gen_random_uuid();
  v_anon constant jsonb := '{"role":"anon"}';
  v_sin_sub constant jsonb := '{"role":"authenticated"}';
  v_ja jsonb;
  v_jb jsonb;
  v_jc jsonb;
  v_jd jsonb;
  -- Fila de panel_resumen como texto: "(mes,mes_anterior,…)". Un null saldría como ",,".
  v_panel constant text := 'select string_agg(r::text, %L) from public.panel_resumen(%s) r';
  v_mes_ahora text;
  v_item10 uuid;
  v_item2 uuid;
  v_ca uuid;
  v_pb uuid;
  v_cb uuid;
  v_ob uuid;
  v_pc uuid;
  v_cc uuid;
  v_o1 uuid;
  v_o2 uuid;
  v_o3 uuid;
  v_o4 uuid;
  v_o5 uuid;
  v_o6 uuid;
  v_o7 uuid;
  v_o8 uuid;
  v_o9 uuid;
  v_todos text;
  v_pendientes text;
  i integer;
begin
  return next extensions.plan(38);

  -- -------------------------------------------------------------------------
  -- Catálogo: firmas, security invoker, search_path, permisos e índices.
  -- -------------------------------------------------------------------------

  return next extensions.set_eq(
    $sql$
      select p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'
      from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('panel_resumen', 'productos_bajo_minimo', 'pedidos_pagina')
        and not p.prosecdef
        and p.proconfig @> array['search_path=""']
    $sql$,
    array[
      'panel_resumen(timestamp with time zone)',
      'productos_bajo_minimo(integer)',
      'pedidos_pagina(text, timestamp with time zone, uuid, integer)'
    ],
    '01 - panel_resumen, productos_bajo_minimo y pedidos_pagina existen (una sola firma), security invoker y con search_path vacio'
  );
  return next extensions.is_empty(
    $sql$
      select p.proname from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname in ('panel_resumen', 'productos_bajo_minimo', 'pedidos_pagina')
        and (pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
          or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'))
    $sql$,
    '02 - ni PUBLIC ni anon tienen EXECUTE sobre las tres funciones nuevas'
  );
  return next extensions.is(
    (select count(*)::integer from pg_catalog.pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('panel_resumen', 'productos_bajo_minimo', 'pedidos_pagina')
       and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')),
    3,
    '03 - authenticated puede ejecutar las tres funciones nuevas'
  );

  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'select * from public.panel_resumen()'),
    '42501',
    '04 - anon no puede ejecutar panel_resumen (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'select * from public.productos_bajo_minimo()'),
    '42501',
    '05 - anon no puede ejecutar productos_bajo_minimo (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'select * from public.pedidos_pagina()'),
    '42501',
    '06 - anon no puede ejecutar pedidos_pagina (42501)'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_sin_sub, 'select * from public.panel_resumen()'),
    'NO_AUTENTICADO',
    '07 - panel_resumen sin sesion (sin sub) rechaza con NO_AUTENTICADO'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_sin_sub, 'select * from public.productos_bajo_minimo()'),
    'NO_AUTENTICADO',
    '08 - productos_bajo_minimo sin sesion (sin sub) rechaza con NO_AUTENTICADO'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_sin_sub, 'select * from public.pedidos_pagina()'),
    'NO_AUTENTICADO',
    '09 - pedidos_pagina sin sesion (sin sub) rechaza con NO_AUTENTICADO'
  );

  return next extensions.is(
    (select indexdef from pg_catalog.pg_indexes
     where schemaname = 'public' and indexname = 'pedidos_owner_created_idx'),
    'CREATE INDEX pedidos_owner_created_idx ON public.pedidos USING btree (owner_id, created_at DESC, id DESC)',
    '10 - indice pedidos (owner_id, created_at desc, id desc)'
  );
  return next extensions.is(
    (select indexdef from pg_catalog.pg_indexes
     where schemaname = 'public' and indexname = 'pedidos_owner_estado_created_idx'),
    'CREATE INDEX pedidos_owner_estado_created_idx ON public.pedidos USING btree (owner_id, estado, created_at DESC, id DESC)',
    '11 - indice pedidos (owner_id, estado, created_at desc, id desc)'
  );
  return next extensions.is(
    (select indexdef from pg_catalog.pg_indexes
     where schemaname = 'public' and indexname = 'productos_owner_nombre_idx'),
    'CREATE INDEX productos_owner_nombre_idx ON public.productos USING btree (owner_id, nombre, id)',
    '12 - indice productos (owner_id, nombre, id)'
  );
  return next extensions.is(
    (select indexdef from pg_catalog.pg_indexes
     where schemaname = 'public' and indexname = 'clientes_owner_nombre_idx'),
    'CREATE INDEX clientes_owner_nombre_idx ON public.clientes USING btree (owner_id, nombre, id)',
    '13 - indice clientes (owner_id, nombre, id)'
  );
  return next extensions.is(
    (select indexdef from pg_catalog.pg_indexes
     where schemaname = 'public' and indexname = 'productos_bajo_minimo_idx'),
    'CREATE INDEX productos_bajo_minimo_idx ON public.productos USING btree (owner_id, ((stock - stock_minimo)), nombre, id) WHERE (stock <= stock_minimo)',
    '14 - indice parcial de productos bajo minimo (owner_id, stock - stock_minimo, nombre, id)'
  );
  return next extensions.set_eq(
    $sql$
      select c.relname::text || '.' || a.attname::text || '=' || co.collname::text
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_collation co on co.oid = a.attcollation
      where c.relnamespace = 'public'::regnamespace
        and c.relname in ('productos', 'clientes')
        and a.attname = 'nombre'
        and co.collnamespace = 'public'::regnamespace
        and co.collprovider = 'i'
        and co.colllocale = 'es-u-kn'
        and co.collisdeterministic
    $sql$,
    array['productos.nombre=es_natural', 'clientes.nombre=es_natural'],
    '15 - productos.nombre y clientes.nombre usan la colacion ICU determinista es_natural (es-u-kn)'
  );

  -- -------------------------------------------------------------------------
  -- Datos: A (el caso completo), B (otro usuario), C (muchas filas), D (sin datos).
  -- Usuarios ficticios de prueba (se deshacen con rollback al terminar).
  -- -------------------------------------------------------------------------

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-t11-a-' || v_a::text || '@inventa.test', now(), now()),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-t11-b-' || v_b::text || '@inventa.test', now(), now()),
    (v_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-t11-c-' || v_c::text || '@inventa.test', now(), now()),
    (v_d, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-t11-d-' || v_d::text || '@inventa.test', now(), now());
  v_ja := jsonb_build_object('sub', v_a, 'role', 'authenticated');
  v_jb := jsonb_build_object('sub', v_b, 'role', 'authenticated');
  v_jc := jsonb_build_object('sub', v_c, 'role', 'authenticated');
  v_jd := jsonb_build_object('sub', v_d, 'role', 'authenticated');

  -- A: productos (los nombres prueban el orden en español) y un cliente.
  v_item10 := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock, stock_minimo) values ('Item 10', 100, 1000, 5) returning id$sql$)::uuid;
  v_item2 := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock, stock_minimo) values ('Item 2', 1000, 10, 4) returning id$sql$)::uuid;
  perform pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock, stock_minimo) values ('Ábaco', 1, 1, 4), ('Ñu', 1, 2, 2), ('Nube', 1, 0, 0) returning id$sql$);
  v_ca := pg_temp.valor_de(v_ja, $sql$insert into public.clientes (nombre) values ('Cliente A') returning id$sql$)::uuid;

  -- A: pedidos con crear_pedido (total = cantidad x precio copiado del producto).
  v_o1 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 2), jsonb_build_object(%L, %L, %L, 1)))',
    v_ca, 'producto_id', v_item10, 'cantidad', 'producto_id', v_item2, 'cantidad'))::uuid;
  v_o2 := pg_temp.valor_de(v_ja, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 3)))', v_ca, 'producto_id', v_item10, 'cantidad'))::uuid;
  v_o3 := pg_temp.valor_de(v_ja, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 50)))', v_ca, 'producto_id', v_item10, 'cantidad'))::uuid;
  v_o9 := pg_temp.valor_de(v_ja, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 4)))', v_ca, 'producto_id', v_item10, 'cantidad'))::uuid;
  v_o4 := pg_temp.valor_de(v_ja, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 5)))', v_ca, 'producto_id', v_item10, 'cantidad'))::uuid;
  v_o5 := pg_temp.valor_de(v_ja, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 6)))', v_ca, 'producto_id', v_item10, 'cantidad'))::uuid;
  v_o7 := pg_temp.valor_de(v_ja, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 70)))', v_ca, 'producto_id', v_item10, 'cantidad'))::uuid;
  v_o6 := pg_temp.valor_de(v_ja, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 8)))', v_ca, 'producto_id', v_item10, 'cantidad'))::uuid;
  v_o8 := pg_temp.valor_de(v_ja, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 9)))', v_ca, 'producto_id', v_item10, 'cantidad'))::uuid;
  perform pg_temp.valor_de(v_ja, format('select public.enviar_pedido(%L)', v_o1));
  perform pg_temp.valor_de(v_ja, format('select public.enviar_pedido(%L)', v_o6));
  perform pg_temp.valor_de(v_ja, format('select public.enviar_pedido(%L)', v_o8));
  perform pg_temp.valor_de(v_ja, format('select public.cancelar_pedido(%L)', v_o3));
  perform pg_temp.valor_de(v_ja, format('select public.cancelar_pedido(%L)', v_o7));

  -- Stock final de A: 5 productos, 56 unidades, 4 bajo minimo (stock <= stock_minimo):
  -- Ábaco 1/4 (-3), Item 2 3/4 (-1), Nube 0/0 (0), Ñu 2/2 (0); Item 10 50/5 no lo está.
  perform pg_temp.valor_de(v_ja, format('update public.productos set stock = 50 where id = %L returning id', v_item10));
  perform pg_temp.valor_de(v_ja, format('update public.productos set stock = 3 where id = %L returning id', v_item2));

  -- Fechas de los pedidos de A (UTC). Madrid es UTC+2 hasta el 25/10/2026 y UTC+1 después.
  --   o8 2026-09-30 21:59:59Z = 30/09 23:59:59 Madrid -> septiembre, enviado, 900
  --   o6 2026-09-30 22:00:00Z = 01/10 00:00:00 Madrid -> octubre, enviado, 800
  --   o7 2026-10-15 12:00:00Z                          -> octubre, cancelado, 7000
  --   o2 2026-10-31 22:59:59Z = 31/10 23:59:59 Madrid -> octubre, pendiente, 300
  --   o1 2026-10-31 23:00:00Z = 01/11 00:00:00 Madrid -> noviembre, enviado, 1200 (2 lineas, 3 uds)
  --   o3 2026-11-10 12:00:00Z                          -> noviembre, cancelado, 5000
  --   o9 2026-11-10 12:00:00Z (misma hora que o3)      -> noviembre, pendiente, 400
  --   o4 2026-11-30 22:59:59Z = 30/11 23:59:59 Madrid -> noviembre, pendiente, 500
  --   o5 2026-11-30 23:00:00Z = 01/12 00:00:00 Madrid -> diciembre, pendiente, 600
  update public.pedidos set created_at = '2026-09-30 21:59:59+00' where id = v_o8;
  update public.pedidos set created_at = '2026-09-30 22:00:00+00' where id = v_o6;
  update public.pedidos set created_at = '2026-10-15 12:00:00+00' where id = v_o7;
  update public.pedidos set created_at = '2026-10-31 22:59:59+00' where id = v_o2;
  update public.pedidos set created_at = '2026-10-31 23:00:00+00' where id = v_o1;
  update public.pedidos set created_at = '2026-11-10 12:00:00+00' where id in (v_o3, v_o9);
  update public.pedidos set created_at = '2026-11-30 22:59:59+00' where id = v_o4;
  update public.pedidos set created_at = '2026-11-30 23:00:00+00' where id = v_o5;

  -- B: un producto, un cliente y un pedido pendiente de noviembre (9900).
  v_pb := pg_temp.valor_de(v_jb, $sql$insert into public.productos (nombre, precio_cents, stock, stock_minimo) values ('Producto B', 9900, 20, 2) returning id$sql$)::uuid;
  v_cb := pg_temp.valor_de(v_jb, $sql$insert into public.clientes (nombre) values ('Cliente B') returning id$sql$)::uuid;
  v_ob := pg_temp.valor_de(v_jb, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 1)))', v_cb, 'producto_id', v_pb, 'cantidad'))::uuid;
  update public.pedidos set created_at = '2026-11-05 10:00:00+00' where id = v_ob;

  -- C: 101 productos bajo minimo y 101 pedidos, para los topes de filas.
  perform pg_temp.valor_de(v_jc, $sql$
    insert into public.productos (nombre, precio_cents, stock, stock_minimo)
    select 'C ' || i, 1, 0, 1 from generate_series(1, 101) as g (i) returning id
  $sql$);
  v_pc := pg_temp.valor_de(v_jc, $sql$insert into public.productos (nombre, precio_cents, stock, stock_minimo) values ('C venta', 1, 1000, 0) returning id$sql$)::uuid;
  v_cc := pg_temp.valor_de(v_jc, $sql$insert into public.clientes (nombre) values ('Cliente C') returning id$sql$)::uuid;
  for i in 1..101 loop
    perform pg_temp.valor_de(v_jc, format('select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 1)))', v_cc, 'producto_id', v_pc, 'cantidad'));
  end loop;

  -- -------------------------------------------------------------------------
  -- Orden alfabético en español.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    pg_temp.valor_de(v_ja, $sql$select string_agg(nombre, '|' order by nombre) from public.productos$sql$),
    'Ábaco|Item 2|Item 10|Nube|Ñu',
    '16 - productos de A ordenados por nombre en español (Item 2 antes que Item 10, Ñ despues de N)'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, $sql$select string_agg(nombre, '|' order by nombre) from public.productos where nombre ilike '%ñu%' or nombre ilike '%ITEM 1%'$sql$),
    'Item 10|Ñu',
    '17 - la busqueda con ilike sigue funcionando con la colacion nueva (sin distinguir mayusculas)'
  );

  -- -------------------------------------------------------------------------
  -- panel_resumen: (mes, mes anterior, pedidos, cancelados, ingresos, pedidos ant.,
  -- cancelados ant., ingresos ant., pendientes, productos, unidades, bajo minimo).
  -- -------------------------------------------------------------------------

  return next extensions.is(
    pg_temp.valor_de(v_ja, format(v_panel, ';', quote_literal('2026-11-15 12:00:00+00'))),
    '(2026-11,2026-10,3,1,2100,2,1,1100,4,5,56,4)',
    '18 - panel de A en noviembre: 01/11 00:00 y 30/11 23:59:59 cuentan, cancelados fuera de pedidos e ingresos, octubre con su horario de verano'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jb, format(v_panel, ';', quote_literal('2026-11-15 12:00:00+00'))),
    '(2026-11,2026-10,1,0,9900,0,0,0,1,1,19,0)',
    '19 - panel de B: solo sus cifras (RLS), nada de A'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(v_panel, ';', quote_literal('2026-11-30 23:30:00+00'))),
    '(2026-12,2026-11,1,0,600,3,1,2100,4,5,56,4)',
    '20 - a las 23:30Z del 30/11 ya es diciembre en Madrid: el pedido de 01/12 00:00 cuenta en diciembre'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(v_panel, ';', quote_literal('2027-01-10 12:00:00+00'))),
    '(2027-01,2026-12,0,0,0,1,0,600,4,5,56,4)',
    '21 - en enero el mes anterior es diciembre del año anterior'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, $sql$select (select mes_actual from public.panel_resumen('2026-06-30 21:59:59+00')) || '|' || (select mes_actual from public.panel_resumen('2026-06-30 22:00:00+00'))$sql$),
    '2026-06|2026-07',
    '22 - en verano el mes cambia a las 22:00Z (00:00 en Madrid, UTC+2)'
  );
  v_mes_ahora := to_char(date_trunc('month', now() at time zone 'Europe/Madrid'), 'YYYY-MM');
  return next extensions.is(
    pg_temp.valor_de(v_ja, $sql$select (select mes_actual from public.panel_resumen()) || '|' || (select mes_actual from public.panel_resumen(null))$sql$),
    v_mes_ahora || '|' || v_mes_ahora,
    '23 - sin argumento o con null, panel_resumen usa el mes actual de Madrid'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jd, format(v_panel, ';', quote_literal('2026-11-15 12:00:00+00'))),
    '(2026-11,2026-10,0,0,0,0,0,0,0,0,0,0)',
    '24 - panel de un usuario sin datos: una fila con ceros, ningun null'
  );

  -- -------------------------------------------------------------------------
  -- productos_bajo_minimo.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    pg_temp.valor_de(v_ja, $sql$select string_agg(nombre, '|') from public.productos_bajo_minimo()$sql$),
    'Ábaco|Item 2|Nube|Ñu',
    '25 - bajo minimo de A: stock <= minimo, primero el que mas se aleja y luego por nombre'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, $sql$select string_agg(nombre, '|') from public.productos_bajo_minimo(2)$sql$),
    'Ábaco|Item 2',
    '26 - productos_bajo_minimo(2) devuelve solo los dos primeros'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, $sql$select (select count(*) from public.productos_bajo_minimo(0)) || '|' || (select count(*) from public.productos_bajo_minimo(-5))$sql$),
    '1|1',
    '27 - un limite de 0 o negativo se sube a 1'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jb, 'select count(*) from public.productos_bajo_minimo()'),
    '0',
    '28 - B no ve los productos bajo minimo de A ni de C (RLS)'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jc, $sql$select (select count(*) from public.productos_bajo_minimo(1000)) || '|' || (select count(*) from public.productos_bajo_minimo())$sql$),
    '100|10',
    '29 - con 101 bajo minimo devuelve como mucho 100, y 10 por defecto'
  );

  -- -------------------------------------------------------------------------
  -- pedidos_pagina.
  -- -------------------------------------------------------------------------

  -- Orden esperado: created_at desc y, a igual fecha (o3 y o9), id desc.
  v_todos := concat_ws(',', v_o5, v_o4, greatest(v_o3, v_o9), least(v_o3, v_o9), v_o1, v_o2, v_o7, v_o6, v_o8);
  v_pendientes := concat_ws(',', v_o5, v_o4, v_o9, v_o2);

  return next extensions.is(
    pg_temp.valor_de(v_ja, $sql$select string_agg(id::text, ',') from public.pedidos_pagina(p_limite => 100)$sql$),
    v_todos,
    '30 - pedidos_pagina de A: sus 9 pedidos del mas nuevo al mas antiguo, desempate por id'
  );
  return next extensions.is(
    pg_temp.recorrer(v_ja, null, 3),
    v_todos || '|paginas=4',
    '31 - paginas de 3 con cursor (created_at, id): los 9 pedidos sin repetir ni saltar, aunque dos compartan fecha en el borde de pagina'
  );
  return next extensions.is(
    pg_temp.recorrer(v_ja, 'pendiente', 1)
      || '#' || pg_temp.valor_de(v_ja, $sql$select string_agg(id::text, ',') from public.pedidos_pagina('pendiente')$sql$),
    v_pendientes || '|paginas=5#' || v_pendientes,
    '32 - filtro pendiente: solo los pendientes, en orden, tambien pagina a pagina'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select concat_ws(%L, estado, total_cents, cliente_nombre, lineas, unidades) from public.pedidos_pagina(%L) where id = %L',
      '|', 'enviado', v_o1)),
    'enviado|1200|Cliente A|2|3',
    '33 - cada pedido lleva estado, total, nombre del cliente, nº de lineas y unidades'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jb, $sql$select count(*) || '|' || string_agg(id::text, ',') from public.pedidos_pagina(p_limite => 100)$sql$),
    '1|' || v_ob::text,
    '34 - B solo ve su pedido (RLS)'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_ja, $sql$select * from public.pedidos_pagina('otro')$sql$),
    'FILTRO_INVALIDO',
    '35 - un estado que no existe rechaza con FILTRO_INVALIDO'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_ja, $sql$select * from public.pedidos_pagina(null, now(), null)$sql$)
      || '|' || pg_temp.mensaje_de(v_ja, $sql$select * from public.pedidos_pagina(null, null, gen_random_uuid())$sql$),
    'CURSOR_INVALIDO|CURSOR_INVALIDO',
    '36 - un cursor con solo la fecha o solo el id rechaza con CURSOR_INVALIDO'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jc, $sql$select (select count(*) from public.pedidos_pagina(p_limite => 1000)) || '|' || (select count(*) from public.pedidos_pagina())$sql$),
    '100|25',
    '37 - con 101 pedidos devuelve como mucho 100, y 25 por defecto'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jc, $sql$select (select count(*) from public.pedidos_pagina(p_limite => 0)) || '|' || (select count(*) from public.pedidos_pagina(p_limite => -1))$sql$),
    '1|1',
    '38 - un limite de 0 o negativo se sube a 1'
  );

  return query select * from extensions.finish();
end;
$$;

select * from pg_temp.run_tests();

rollback;
