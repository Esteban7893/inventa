-- Inventa — tests pgTAP de T14 (movimientos de stock): cada cambio de productos.stock deja
-- exactamente un movimiento con su delta. crear_pedido -> 'pedido' por línea (delta negativo,
-- con su pedido); cancelar_pedido -> 'cancelacion' por línea (delta positivo), una sola vez;
-- enviar -> ninguno; un pedido rechazado o repetido con la misma clave (T13) -> ninguno; alta
-- con stock y update directo de stock -> 'ajuste'; update sin cambio de stock -> ninguno. El
-- motivo no se puede falsificar poniendo inventa.origen_stock en la sesión. La tabla es de
-- solo lectura (RLS por owner_id), las claves ajenas impiden apuntar a filas de otro usuario,
-- y la suma de los deltas de cada producto es su stock (también para los que ya existían, por
-- el saldo inicial de la migración).
-- Compatible con `supabase test db --linked` (pg_prove) y con `supabase db query --linked -f`:
-- toda la salida TAP sale de un único select. Termina en rollback: no deja datos.

begin;

-- Ayudantes (como en 06_pedidos_idempotentes.sql): ejecutan p_sql con el rol y los claims de
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

-- Primer valor de la primera fila de p_sql o, si falla, 'ERROR: <mensaje>'.
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

-- Como valor_de, pero la persona pone antes inventa.origen_stock = p_origen en su sesión (lo
-- que haría quien quisiera falsificar el motivo).
create function pg_temp.valor_con_origen(p_claims jsonb, p_origen text, p_sql text)
returns text
language plpgsql
as $$
declare
  v_valor text;
begin
  perform pg_temp.como(p_claims);
  perform set_config('inventa.origen_stock', p_origen, true);
  if current_setting('inventa.origen_stock') <> p_origen then
    raise exception 'ORIGEN_NO_PUESTO';
  end if;
  execute p_sql into v_valor;
  reset role;
  return v_valor;
end;
$$;

-- Movimientos de un producto que ve p_claims, en orden: motivo:delta:pedido ('-' sin pedido).
create function pg_temp.movs(p_claims jsonb, p_producto uuid)
returns text
language plpgsql
as $$
begin
  return pg_temp.valor_de(p_claims, format(
    $sql$select coalesce(string_agg(m.motivo || ':' || m.delta || ':' || coalesce(m.pedido_id::text, '-'), ',' order by m.id), 'ninguno')
         from public.movimientos_stock m where m.producto_id = %L$sql$, p_producto));
end;
$$;

-- Número de movimientos de un usuario (como postgres, sin RLS).
create function pg_temp.n_movs(p_uid uuid)
returns integer
language sql
as $$
  select count(*)::integer from public.movimientos_stock m where m.owner_id = p_uid
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
  v_anon constant jsonb := '{"role":"anon"}';
  v_ja jsonb;
  v_jb jsonb;
  v_cafe uuid;
  v_taza uuid;
  v_molinillo uuid;
  v_vacio uuid;
  v_borrable uuid;
  v_pb uuid;
  v_ca uuid;
  v_cb uuid;
  v_o1 uuid;
  v_o2 uuid;
  v_o3 uuid;
  v_ob uuid;
  v_n integer;
  v_estados text;
begin
  return next extensions.plan(43);

  -- -------------------------------------------------------------------------
  -- Catálogo: columnas, restricciones, índices, RLS, permisos, funciones y triggers.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    (select string_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod)
         || ':' || a.attnotnull || ':' || a.attidentity::text
         || ':' || coalesce(pg_catalog.pg_get_expr(d.adbin, d.adrelid), ''), ',' order by a.attnum)
     from pg_catalog.pg_attribute a
     left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'public.movimientos_stock'::regclass and a.attnum > 0 and not a.attisdropped),
    'id:bigint:true:a:,owner_id:uuid:true::auth.uid(),producto_id:uuid:true::,delta:integer:true::,'
      || 'motivo:text:true::,pedido_id:uuid:false::,created_at:timestamp with time zone:true::now()',
    '01 - movimientos_stock: id identidad, owner_id default auth.uid(), producto_id, delta, motivo, pedido_id (admite null) y created_at default now()'
  );
  return next extensions.set_eq(
    $sql$
      select c.conname::text || ' = ' || pg_catalog.pg_get_constraintdef(c.oid)
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.movimientos_stock'::regclass
    $sql$,
    array[
      'movimientos_stock_delta_check = CHECK ((delta <> 0))',
      'movimientos_stock_motivo_check = CHECK ((motivo = ANY (ARRAY[''pedido''::text, ''cancelacion''::text, ''ajuste''::text])))',
      'movimientos_stock_owner_id_fkey = FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE',
      'movimientos_stock_pedido_fkey = FOREIGN KEY (pedido_id, owner_id) REFERENCES pedidos(id, owner_id) ON DELETE CASCADE',
      'movimientos_stock_pedido_segun_motivo = CHECK (((pedido_id IS NULL) = (motivo = ''ajuste''::text)))',
      'movimientos_stock_pkey = PRIMARY KEY (id)',
      'movimientos_stock_producto_fkey = FOREIGN KEY (producto_id, owner_id) REFERENCES productos(id, owner_id) ON DELETE CASCADE',
      'movimientos_stock_signo_segun_motivo = CHECK (((motivo = ''ajuste''::text) OR ((motivo = ''pedido''::text) AND (delta < 0)) OR ((motivo = ''cancelacion''::text) AND (delta > 0))))',
      'movimientos_stock_una_vez_por_pedido = UNIQUE (pedido_id, producto_id, motivo)'
    ],
    '02 - restricciones: delta <> 0, motivos, pedido_id segun motivo, signo segun motivo, una vez por pedido y producto, claves ajenas compuestas con owner_id en cascada'
  );
  return next extensions.set_eq(
    $sql$
      select pg_catalog.pg_get_indexdef(i.indexrelid)
      from pg_catalog.pg_index i
      where i.indrelid = 'public.movimientos_stock'::regclass
    $sql$,
    array[
      'CREATE INDEX movimientos_stock_owner_id_idx ON public.movimientos_stock USING btree (owner_id)',
      'CREATE UNIQUE INDEX movimientos_stock_pkey ON public.movimientos_stock USING btree (id)',
      'CREATE INDEX movimientos_stock_producto_fecha_idx ON public.movimientos_stock USING btree (producto_id, owner_id, created_at DESC, id DESC)',
      'CREATE UNIQUE INDEX movimientos_stock_una_vez_por_pedido ON public.movimientos_stock USING btree (pedido_id, producto_id, motivo)'
    ],
    '03 - indices: movimientos de un producto por fecha (producto_id, owner_id, created_at desc, id desc), owner_id y los de las claves'
  );
  return next extensions.is(
    (select c.relrowsecurity::text from pg_catalog.pg_class c where c.oid = 'public.movimientos_stock'::regclass)
      || '|' || (select string_agg(p.policyname || ':' || p.cmd || ':' || p.roles::text || ':'
                   || coalesce(p.qual, '-') || ':' || coalesce(p.with_check, '-'), ',')
                 from pg_catalog.pg_policies p
                 where p.schemaname = 'public' and p.tablename = 'movimientos_stock'),
    'true|movimientos_stock_select_propios:SELECT:{authenticated}:(owner_id = ( SELECT auth.uid() AS uid)):-',
    '04 - RLS activado y una sola politica: select para authenticated con owner_id = (select auth.uid())'
  );
  return next extensions.is(
    (select string_agg(r.rol || '=' || coalesce((
        select string_agg(pr.priv, ',' order by pr.n)
        from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'])
          with ordinality as pr (priv, n)
        where pg_catalog.has_table_privilege(r.rol, 'public.movimientos_stock'::regclass, pr.priv)), '')
        || ':col=' || pg_catalog.has_any_column_privilege(r.rol, 'public.movimientos_stock'::regclass, 'INSERT, UPDATE, REFERENCES')::text,
        '|' order by r.n)
     from unnest(array['public', 'anon', 'authenticated']) with ordinality as r (rol, n)),
    'public=:col=false|anon=:col=false|authenticated=SELECT:col=false',
    '05 - permisos sobre movimientos_stock: PUBLIC y anon ninguno; authenticated solo SELECT (ni insert, update, delete ni truncate, tampoco por columnas)'
  );
  return next extensions.is(
    (select string_agg(r.rol || '=' || pg_catalog.has_sequence_privilege(r.rol, 'public.movimientos_stock_id_seq'::regclass, 'USAGE, SELECT, UPDATE')::text, '|' order by r.n)
     from unnest(array['public', 'anon', 'authenticated']) with ordinality as r (rol, n)),
    'public=false|anon=false|authenticated=false',
    '06 - nadie de la API tiene permisos sobre la secuencia de movimientos_stock'
  );
  return next extensions.set_eq(
    $sql$
      select p.proname::text || '|' || p.prosecdef::text || '|' || array_to_string(p.proconfig, ',')
        || '|' || pg_catalog.pg_get_function_result(p.oid) || '|' || pg_catalog.pg_get_function_arguments(p.oid)
      from pg_catalog.pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname like 'movimientos_stock%'
    $sql$,
    array[
      'movimientos_stock_marcar_origen|false|search_path=""|trigger|',
      'movimientos_stock_registrar_ajuste|true|search_path=""|trigger|',
      'movimientos_stock_registrar_pedido|false|search_path=""|trigger|',
      'movimientos_stock_registrar_cancelacion|false|search_path=""|trigger|'
    ],
    '07 - cuatro funciones de trigger sin argumentos, con search_path vacio; solo registrar_ajuste es security definer'
  );
  return next extensions.is_empty(
    $sql$
      select p.proname || ':' || r.rol
      from pg_catalog.pg_proc p
      cross join unnest(array['public', 'anon', 'authenticated']) as r (rol)
      where p.pronamespace = 'public'::regnamespace and p.proname like 'movimientos_stock%'
        and pg_catalog.has_function_privilege(r.rol, p.oid, 'EXECUTE')
    $sql$,
    '08 - nadie de la API (PUBLIC, anon, authenticated) puede ejecutar las funciones de trigger'
  );
  return next extensions.set_eq(
    $sql$
      select pg_catalog.pg_get_triggerdef(t.oid)
      from pg_catalog.pg_trigger t
      where not t.tgisinternal
        and t.tgfoid in (select p.oid from pg_catalog.pg_proc p
                         where p.pronamespace = 'public'::regnamespace and p.proname like 'movimientos_stock%')
    $sql$,
    array[
      'CREATE TRIGGER movimientos_stock_1_origen AFTER UPDATE OF stock ON public.productos FOR EACH ROW WHEN ((old.stock IS DISTINCT FROM new.stock)) EXECUTE FUNCTION movimientos_stock_marcar_origen()',
      'CREATE TRIGGER movimientos_stock_2_ajuste AFTER UPDATE OF stock ON public.productos FOR EACH ROW WHEN ((old.stock IS DISTINCT FROM new.stock)) EXECUTE FUNCTION movimientos_stock_registrar_ajuste()',
      'CREATE TRIGGER movimientos_stock_alta AFTER INSERT ON public.productos FOR EACH ROW WHEN ((new.stock <> 0)) EXECUTE FUNCTION movimientos_stock_registrar_ajuste()',
      'CREATE TRIGGER movimientos_stock_cancelacion AFTER UPDATE OF estado ON public.pedidos FOR EACH ROW WHEN (((old.estado = ''pendiente''::text) AND (new.estado = ''cancelado''::text))) EXECUTE FUNCTION movimientos_stock_registrar_cancelacion()',
      'CREATE TRIGGER movimientos_stock_pedido AFTER INSERT ON public.pedido_lineas FOR EACH ROW EXECUTE FUNCTION movimientos_stock_registrar_pedido()'
    ],
    '09 - triggers: origen y ajuste (en ese orden) en update de stock, alta con stock, linea de pedido nueva y pedido pendiente que pasa a cancelado'
  );
  -- Los productos que ya existían tienen su saldo inicial (migración) y todo cambio posterior
  -- deja su movimiento: en toda la base de datos, la suma de deltas de cada producto es su stock.
  return next extensions.is_empty(
    $sql$
      select p.id::text from public.productos p
      where p.stock <> coalesce((select sum(m.delta) from public.movimientos_stock m where m.producto_id = p.id), 0)
    $sql$,
    '10 - en toda la base de datos, la suma de los deltas de cada producto es su stock'
  );

  -- -------------------------------------------------------------------------
  -- Datos: A (el caso completo) y B (otro usuario). Usuarios ficticios de prueba (se
  -- deshacen con rollback al terminar).
  -- -------------------------------------------------------------------------

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-t14-a-' || v_a::text || '@inventa.test', now(), now()),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-t14-b-' || v_b::text || '@inventa.test', now(), now());
  v_ja := jsonb_build_object('sub', v_a, 'role', 'authenticated');
  v_jb := jsonb_build_object('sub', v_b, 'role', 'authenticated');

  -- -------------------------------------------------------------------------
  -- Alta y cambios directos de stock (el formulario de productos): 'ajuste'.
  -- -------------------------------------------------------------------------

  v_cafe := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Cafe', 250, 100) returning id$sql$)::uuid;
  v_taza := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Taza', 900, 50) returning id$sql$)::uuid;
  v_molinillo := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Molinillo', 5000, 1) returning id$sql$)::uuid;
  v_vacio := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Vacio', 100, 0) returning id$sql$)::uuid;
  v_ca := pg_temp.valor_de(v_ja, $sql$insert into public.clientes (nombre) values ('Cliente A') returning id$sql$)::uuid;
  v_pb := pg_temp.valor_de(v_jb, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Producto B', 300, 20) returning id$sql$)::uuid;
  v_cb := pg_temp.valor_de(v_jb, $sql$insert into public.clientes (nombre) values ('Cliente B') returning id$sql$)::uuid;

  return next extensions.is(
    pg_temp.movs(v_ja, v_cafe) || '|' || pg_temp.movs(v_ja, v_taza) || '|' || pg_temp.movs(v_ja, v_molinillo)
      || '|' || pg_temp.movs(v_jb, v_pb),
    'ajuste:100:-|ajuste:50:-|ajuste:1:-|ajuste:20:-',
    '11 - el alta de un producto con stock deja un ajuste con el stock inicial, sin pedido'
  );
  return next extensions.is(
    pg_temp.movs(v_ja, v_vacio),
    'ninguno',
    '12 - el alta de un producto con stock 0 no deja movimientos'
  );
  return next extensions.is(
    (select m.owner_id::text || '|' || (m.created_at = now())::text
     from public.movimientos_stock m where m.producto_id = v_cafe),
    v_a::text || '|true',
    '13 - el movimiento es del dueño del producto y lleva la fecha de la transaccion'
  );

  perform pg_temp.valor_de(v_ja, format('update public.productos set stock = 97 where id = %L returning id', v_cafe));
  return next extensions.is(
    pg_temp.movs(v_ja, v_cafe),
    'ajuste:100:-,ajuste:-3:-',
    '14 - un update directo de stock (100 -> 97) deja un ajuste con delta -3'
  );

  perform pg_temp.valor_de(v_ja, format(
    $sql$update public.productos set nombre = 'Cafe molido', precio_cents = 260, stock_minimo = 5 where id = %L returning id$sql$, v_cafe));
  perform pg_temp.valor_de(v_ja, format(
    $sql$update public.productos set nombre = 'Cafe', stock = 97 where id = %L returning id$sql$, v_cafe));
  return next extensions.is(
    pg_temp.movs(v_ja, v_cafe),
    'ajuste:100:-,ajuste:-3:-',
    '15 - un update sin stock y otro con el mismo stock (como el formulario de edicion) no dejan movimientos'
  );

  perform pg_temp.valor_con_origen(v_ja, 'funcion', format('update public.productos set stock = 95 where id = %L returning id', v_cafe));
  return next extensions.is(
    pg_temp.movs(v_ja, v_cafe),
    'ajuste:100:-,ajuste:-3:-,ajuste:-2:-',
    '16 - poner inventa.origen_stock = funcion en la sesion no oculta un update directo: sigue siendo un ajuste (97 -> 95)'
  );

  perform pg_temp.valor_de(v_ja, format(
    'update public.productos set stock = stock + 10 where id in (%L, %L) returning id', v_cafe, v_taza));
  return next extensions.is(
    pg_temp.movs(v_ja, v_cafe) || '|' || pg_temp.movs(v_ja, v_taza),
    'ajuste:100:-,ajuste:-3:-,ajuste:-2:-,ajuste:10:-|ajuste:50:-,ajuste:10:-',
    '17 - un update directo de varias filas deja un ajuste por producto (+10 a Cafe y a Taza)'
  );

  -- -------------------------------------------------------------------------
  -- crear_pedido: 'pedido' por línea, con su pedido_id; ningún ajuste.
  -- -------------------------------------------------------------------------

  v_o1 := pg_temp.valor_con_origen(v_ja, 'directo', format(
    'select public.crear_pedido(%L, %L::jsonb)', v_ca, jsonb_build_array(
      jsonb_build_object('producto_id', v_cafe, 'cantidad', 2),
      jsonb_build_object('producto_id', v_taza, 'cantidad', 1))))::uuid;
  return next extensions.is(
    pg_temp.movs(v_ja, v_cafe) || '|' || pg_temp.movs(v_ja, v_taza),
    format('ajuste:100:-,ajuste:-3:-,ajuste:-2:-,ajuste:10:-,pedido:-2:%s|ajuste:50:-,ajuste:10:-,pedido:-1:%s', v_o1, v_o1),
    '18 - crear un pedido deja un movimiento pedido por linea con delta -cantidad y su pedido_id, y ningun ajuste (aunque la sesion ponga origen directo)'
  );
  -- El segundo trigger borra el origen que apunta el primero: no queda nada en la sesión que
  -- un update posterior pudiera heredar.
  return next extensions.is(
    coalesce(current_setting('inventa.origen_stock', true), 'null'),
    '',
    '19 - tras crear el pedido no queda ningun origen apuntado en la sesion (ni funcion ni directo)'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select count(*) || %L || count(distinct m.producto_id) || %L || bool_and(m.owner_id = %L) from public.movimientos_stock m where m.pedido_id = %L',
      '|', '|', v_a, v_o1)),
    '2|2|true',
    '20 - el pedido de dos lineas tiene exactamente dos movimientos, uno por producto, de A'
  );

  v_n := pg_temp.n_movs(v_a);
  perform pg_temp.valor_de(v_ja, format('select public.enviar_pedido(%L)', v_o1));
  return next extensions.is(
    pg_temp.valor_de(v_ja, format('select estado from public.pedidos where id = %L', v_o1))
      || '|' || (pg_temp.n_movs(v_a) - v_n)::text,
    'enviado|0',
    '21 - enviar un pedido no deja movimientos'
  );
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format('select public.cancelar_pedido(%L)', v_o1))
      || '|' || (pg_temp.n_movs(v_a) - v_n)::text,
    'ERROR: ESTADO_INVALIDO|0',
    '22 - intentar cancelar un pedido enviado no deja movimientos'
  );

  -- -------------------------------------------------------------------------
  -- cancelar_pedido: 'cancelacion' por línea con delta +cantidad, una sola vez.
  -- -------------------------------------------------------------------------

  v_o2 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(%L, %L::jsonb)', v_ca, jsonb_build_array(
      jsonb_build_object('producto_id', v_cafe, 'cantidad', 3),
      jsonb_build_object('producto_id', v_molinillo, 'cantidad', 1))))::uuid;
  perform pg_temp.valor_de(v_ja, format('select public.cancelar_pedido(%L)', v_o2));
  return next extensions.is(
    pg_temp.movs(v_ja, v_cafe) || '|' || pg_temp.movs(v_ja, v_molinillo),
    format('ajuste:100:-,ajuste:-3:-,ajuste:-2:-,ajuste:10:-,pedido:-2:%s,pedido:-3:%s,cancelacion:3:%s|ajuste:1:-,pedido:-1:%s,cancelacion:1:%s',
      v_o1, v_o2, v_o2, v_o2, v_o2),
    '23 - cancelar un pedido deja una cancelacion por linea con delta +cantidad y su pedido_id, y ningun ajuste'
  );
  v_n := pg_temp.n_movs(v_a);
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format('select public.cancelar_pedido(%L)', v_o2))
      || '|' || (pg_temp.n_movs(v_a) - v_n)::text
      || '|' || pg_temp.valor_de(v_ja, format(
        'select count(*) from public.movimientos_stock where pedido_id = %L and motivo = %L', v_o2, 'cancelacion'))
      || '|' || pg_temp.valor_de(v_ja, format(
        'select string_agg(stock::text, %L order by nombre) from public.productos where id in (%L, %L)', ',', v_cafe, v_molinillo)),
    'ERROR: ESTADO_INVALIDO|0|2|103,1',
    '24 - cancelar otra vez el mismo pedido no deja movimientos: sigue habiendo una cancelacion por linea (Cafe 103, Molinillo 1)'
  );

  -- -------------------------------------------------------------------------
  -- Pedido rechazado (atomicidad) y pedido repetido con la misma clave (T13): ninguno.
  -- -------------------------------------------------------------------------

  v_n := pg_temp.n_movs(v_a);
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(
      'select public.crear_pedido(%L, %L::jsonb)', v_ca, jsonb_build_array(
        jsonb_build_object('producto_id', v_taza, 'cantidad', 1),
        jsonb_build_object('producto_id', v_molinillo, 'cantidad', 5))))
      || '|' || (pg_temp.n_movs(v_a) - v_n)::text
      || '|' || pg_temp.valor_de(v_ja, format(
        'select string_agg(stock::text, %L order by nombre) from public.productos where id in (%L, %L)', ',', v_molinillo, v_taza)),
    'ERROR: STOCK_INSUFICIENTE: Molinillo|0|1,59',
    '25 - un pedido rechazado por stock no deja ningun movimiento (tampoco de la linea que si tenia stock)'
  );

  v_o3 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(%L, %L::jsonb, %L)', v_ca, jsonb_build_array(
      jsonb_build_object('producto_id', v_taza, 'cantidad', 2)), v_k1))::uuid;
  v_n := pg_temp.n_movs(v_a);
  return next extensions.is(
    pg_temp.resultado_de(v_ja, format(
      'select public.crear_pedido(%L, %L::jsonb, %L)', v_ca, jsonb_build_array(
        jsonb_build_object('producto_id', v_taza, 'cantidad', 2)), v_k1))
      || '|' || (pg_temp.n_movs(v_a) - v_n)::text
      || '|' || pg_temp.movs(v_ja, v_taza),
    format('%s|0|ajuste:50:-,ajuste:10:-,pedido:-1:%s,pedido:-2:%s', v_o3, v_o1, v_o3),
    '26 - repetir un pedido con la misma clave devuelve el mismo pedido y no deja movimientos nuevos'
  );

  -- -------------------------------------------------------------------------
  -- La suma de los deltas cuadra con el stock.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    (select string_agg(p.nombre || '=' || p.stock || '/' || coalesce((
        select sum(m.delta) from public.movimientos_stock m where m.producto_id = p.id), 0), ',' order by p.nombre)
     from public.productos p where p.owner_id = v_a),
    'Cafe=103/103,Molinillo=1/1,Taza=57/57,Vacio=0/0',
    '27 - para cada producto de A, la suma de los deltas es su stock'
  );

  -- -------------------------------------------------------------------------
  -- Aislamiento entre usuarios.
  -- -------------------------------------------------------------------------

  v_ob := pg_temp.valor_de(v_jb, format(
    'select public.crear_pedido(%L, %L::jsonb)', v_cb, jsonb_build_array(
      jsonb_build_object('producto_id', v_pb, 'cantidad', 3))))::uuid;
  return next extensions.is(
    pg_temp.movs(v_jb, v_pb) || '|' || pg_temp.valor_de(v_jb, 'select count(*) from public.movimientos_stock')
      || '|' || pg_temp.movs(v_jb, v_cafe)
      || '|' || pg_temp.valor_de(v_ja, format('select count(*) from public.movimientos_stock where producto_id = %L', v_pb)),
    format('ajuste:20:-,pedido:-3:%s|2|ninguno|0', v_ob),
    '28 - B solo ve sus dos movimientos; B no ve los de A ni A los de B'
  );
  v_n := pg_temp.n_movs(v_a);
  v_estados := pg_temp.valor_de(v_jb, format(
    'with u as (update public.productos set stock = 0 where id = %L returning 1) select count(*) from u', v_cafe));
  return next extensions.is(
    v_estados
      || '|' || (pg_temp.n_movs(v_a) - v_n)::text
      || '|' || (select p.stock::text from public.productos p where p.id = v_cafe),
    '0|0|103',
    '29 - B no puede cambiar el stock de un producto de A (0 filas) ni dejarle movimientos'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, 'select count(*) from public.movimientos_stock'),
    '42501',
    '30 - anon no puede leer movimientos_stock (42501)'
  );

  -- -------------------------------------------------------------------------
  -- Nadie desde la API escribe ni falsifica movimientos.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    pg_temp.sqlstate_de(v_ja, format(
      $sql$insert into public.movimientos_stock (producto_id, delta, motivo) values (%L, 5, 'ajuste')$sql$, v_cafe))
      || '|' || pg_temp.sqlstate_de(v_ja, format(
      $sql$insert into public.movimientos_stock (producto_id, delta, motivo, pedido_id) values (%L, 3, 'cancelacion', %L)$sql$, v_cafe, v_o1))
      || '|' || pg_temp.sqlstate_de(v_ja, format(
      $sql$update public.movimientos_stock set delta = 1000 where producto_id = %L$sql$, v_cafe))
      || '|' || pg_temp.sqlstate_de(v_ja, format(
      $sql$delete from public.movimientos_stock where producto_id = %L$sql$, v_cafe))
      || '|' || pg_temp.sqlstate_de(v_ja, 'truncate public.movimientos_stock'),
    '42501|42501|42501|42501|42501',
    '31 - authenticated no puede insertar (ni un ajuste ni una cancelacion falsa), actualizar, borrar ni vaciar movimientos_stock (42501)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_anon, format(
      $sql$insert into public.movimientos_stock (owner_id, producto_id, delta, motivo) values (%L, %L, 5, 'ajuste')$sql$, v_a, v_cafe))
      || '|' || pg_temp.sqlstate_de(v_anon, 'update public.movimientos_stock set delta = 1')
      || '|' || pg_temp.sqlstate_de(v_anon, 'delete from public.movimientos_stock'),
    '42501|42501|42501',
    '32 - anon no puede insertar, actualizar ni borrar movimientos_stock (42501)'
  );
  return next extensions.is(
    pg_temp.valor_de(v_ja, 'select count(*) from public.movimientos_stock')
      || '|' || pg_temp.n_movs(v_a)::text,
    '14|14',
    '33 - tras los intentos, A sigue viendo sus 14 movimientos y no hay ninguno mas (Cafe 7, Taza 4, Molinillo 3)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_ja, 'select public.movimientos_stock_registrar_ajuste()')
      || '|' || pg_temp.sqlstate_de(v_ja, 'select public.movimientos_stock_marcar_origen()')
      || '|' || pg_temp.sqlstate_de(v_ja, 'select public.movimientos_stock_registrar_pedido()')
      || '|' || pg_temp.sqlstate_de(v_ja, 'select public.movimientos_stock_registrar_cancelacion()'),
    '42501|42501|42501|42501',
    '34 - authenticated no puede llamar a las funciones de trigger (42501)'
  );

  -- -------------------------------------------------------------------------
  -- Integridad (como postgres, sin RLS): claves ajenas y restricciones.
  -- -------------------------------------------------------------------------

  return next extensions.is(
    pg_temp.sqlstate_de('{"role":"postgres"}', format(
      $sql$insert into public.movimientos_stock (owner_id, producto_id, delta, motivo) values (%L, %L, 1, 'ajuste')$sql$, v_a, v_pb))
      || '|' || pg_temp.sqlstate_de('{"role":"postgres"}', format(
      $sql$insert into public.movimientos_stock (owner_id, producto_id, delta, motivo, pedido_id) values (%L, %L, -1, 'pedido', %L)$sql$, v_a, v_cafe, v_ob)),
    '23503|23503',
    '35 - un movimiento no puede apuntar a un producto ni a un pedido de otro usuario (23503)'
  );
  return next extensions.is(
    (select string_agg(pg_temp.sqlstate_de('{"role":"postgres"}', format(
        'insert into public.movimientos_stock (owner_id, producto_id, delta, motivo, pedido_id) values (%L, %L, %s, %L, %s)',
        v_a, v_taza, c.delta, c.motivo, case when c.con_pedido then quote_literal(v_o2) else 'null' end)), '|' order by c.n)
     from (values
       (1, 0, 'ajuste', false),
       (2, 1, 'ajuste', true),
       (3, -1, 'pedido', false),
       (4, 1, 'cancelacion', false),
       (5, 1, 'pedido', true),
       (6, -1, 'cancelacion', true),
       (7, 1, 'otro', false)
     ) as c (n, delta, motivo, con_pedido)),
    '23514|23514|23514|23514|23514|23514|23514',
    '36 - rechaza delta 0, ajuste con pedido, pedido o cancelacion sin pedido, pedido que suma, cancelacion que resta y motivos desconocidos (23514)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de('{"role":"postgres"}', format(
      $sql$insert into public.movimientos_stock (owner_id, producto_id, delta, motivo, pedido_id) values (%L, %L, 3, 'cancelacion', %L)$sql$, v_a, v_cafe, v_o2))
      || '|' || pg_temp.sqlstate_de('{"role":"postgres"}', format(
      $sql$insert into public.movimientos_stock (owner_id, producto_id, delta, motivo, pedido_id) values (%L, %L, -3, 'pedido', %L)$sql$, v_a, v_cafe, v_o2)),
    '23505|23505',
    '37 - un pedido no puede descontar ni devolver dos veces el mismo producto (23505)'
  );

  -- -------------------------------------------------------------------------
  -- Borrado.
  -- -------------------------------------------------------------------------

  v_borrable := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Borrable', 100, 5) returning id$sql$)::uuid;
  perform pg_temp.valor_de(v_ja, format('update public.productos set stock = 8 where id = %L returning id', v_borrable));
  -- El borrado va en su propia sentencia: las subconsultas de la aserción tienen que verlo.
  v_estados := pg_temp.movs(v_ja, v_borrable)
    || '|' || pg_temp.sqlstate_de(v_ja, format('delete from public.productos where id = %L', v_borrable));
  return next extensions.is(
    v_estados
      || '|' || (select count(*)::text from public.productos p where p.id = v_borrable)
      || '|' || (select count(*)::text from public.movimientos_stock m where m.producto_id = v_borrable),
    'ajuste:5:-,ajuste:3:-|00000|0|0',
    '38 - A puede borrar un producto sin pedidos aunque tenga ajustes, y sus movimientos se borran con el'
  );
  v_estados := pg_temp.sqlstate_de(v_ja, format('delete from public.productos where id = %L', v_cafe));
  return next extensions.is(
    v_estados
      || '|' || (select count(*)::text from public.productos p where p.id = v_cafe)
      || '|' || (select count(*)::text from public.movimientos_stock m where m.producto_id = v_cafe),
    '23503|1|7',
    '39 - un producto con pedidos sigue sin poder borrarse (23503) y conserva sus 7 movimientos'
  );
  -- Como el seed de demostración: el administrador borra las líneas y el pedido.
  delete from public.pedido_lineas where pedido_id = v_o2;
  delete from public.pedidos where id = v_o2;
  return next extensions.is(
    (select count(*)::text from public.movimientos_stock m where m.pedido_id = v_o2)
      || '|' || pg_temp.movs(v_ja, v_molinillo),
    '0|ajuste:1:-',
    '40 - si el administrador borra un pedido, sus movimientos se borran con el'
  );

  -- -------------------------------------------------------------------------
  -- Totales finales.
  -- -------------------------------------------------------------------------

  return next extensions.is_empty(
    format($sql$
      select p.id::text from public.productos p
      where p.owner_id in (%L, %L)
        and p.stock <> coalesce((select sum(m.delta) from public.movimientos_stock m where m.producto_id = p.id), 0)
    $sql$, v_a, v_b),
    '41 - al terminar, la suma de los deltas de cada producto de A y de B sigue siendo su stock'
  );
  v_estados := (select string_agg(m.motivo || '=' || count, ',' order by m.motivo)
                from (select m.motivo, count(*) from public.movimientos_stock m
                      where m.owner_id in (v_a, v_b) group by m.motivo) m);
  return next extensions.is(
    v_estados,
    'ajuste=8,pedido=4',
    '42 - de A y B quedan 8 ajustes (4 altas y 4 cambios directos) y 4 movimientos de pedido, sin cancelaciones (las de o2 se borraron con el)'
  );
  return next extensions.is(
    pg_temp.movs(v_jb, v_pb) || '|' || (select p.stock::text from public.productos p where p.id = v_pb),
    format('ajuste:20:-,pedido:-3:%s|17', v_ob),
    '43 - lo que hace A no cambia los movimientos ni el stock de B'
  );

  return query select * from extensions.finish();
end;
$$;

select * from pg_temp.run_tests();

rollback;
