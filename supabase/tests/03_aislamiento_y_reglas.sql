-- Inventa — tests pgTAP que completan los 27 casos de 01_reglas_negocio.sql:
-- sesión obligatoria en las tres funciones (D8), aislamiento entre usuarios al escribir en
-- productos y clientes (D7), check de stock (D11), atomicidad de las líneas (D12), precio
-- copiado en cada pedido (D13) y estados (D14).
-- Compatible con `supabase test db --linked` (pg_prove) y con `supabase db query --linked -f`:
-- toda la salida TAP sale de un único select. Termina en rollback: no deja datos.

begin;

-- Ayudantes: ejecutan p_sql con el rol y los claims de p_claims y vuelven al rol de la sesión.
-- Si p_sql falla, la subtransacción se deshace (también el cambio de rol).

-- SQLSTATE del error, o '00000' si no falla.
create function pg_temp.sqlstate_de(p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
begin
  execute format('set local role %I', p_claims ->> 'role');
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute p_sql;
  reset role;
  return '00000';
exception when others then
  return sqlstate;
end;
$$;

-- Mensaje del error, o 'SIN_ERROR' si no falla.
create function pg_temp.mensaje_de(p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
begin
  execute format('set local role %I', p_claims ->> 'role');
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute p_sql;
  reset role;
  return 'SIN_ERROR';
exception when others then
  return sqlerrm;
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
  execute format('set local role %I', p_claims ->> 'role');
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute p_sql into v_valor;
  reset role;
  return v_valor;
end;
$$;

-- Filas afectadas por un update o delete. Un error aborta el archivo (rojo).
create function pg_temp.filas_de(p_claims jsonb, p_sql text)
returns integer
language plpgsql
as $$
declare
  v_filas integer;
begin
  execute format('set local role %I', p_claims ->> 'role');
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute p_sql;
  get diagnostics v_filas = row_count;
  reset role;
  return v_filas;
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
  v_sin_sub constant jsonb := '{"role":"authenticated"}';
  v_ja jsonb;
  v_jb jsonb;
  v_pa uuid;
  v_pb uuid;
  v_ca uuid;
  v_cb uuid;
  v_o1 uuid;
  v_o2 uuid;
begin
  return next extensions.plan(21);

  -- Usuarios ficticios de prueba (se deshacen con rollback al terminar).
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-a-' || v_a::text || '@inventa.test', now(), now()),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-b-' || v_b::text || '@inventa.test', now(), now());
  v_ja := jsonb_build_object('sub', v_a, 'role', 'authenticated');
  v_jb := jsonb_build_object('sub', v_b, 'role', 'authenticated');

  v_pb := pg_temp.valor_de(v_jb, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Ajeno', 100, 50) returning id$sql$)::uuid;
  v_cb := pg_temp.valor_de(v_jb, $sql$insert into public.clientes (nombre) values ('Cliente B') returning id$sql$)::uuid;
  v_pa := pg_temp.valor_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Cafe', 250, 5) returning id$sql$)::uuid;
  v_ca := pg_temp.valor_de(v_ja, $sql$insert into public.clientes (nombre) values ('Cliente A') returning id$sql$)::uuid;

  -- D8: las tres funciones exigen sesión (01_reglas_negocio.sql ya prueba enviar_pedido).
  return next extensions.is(
    pg_temp.mensaje_de(v_sin_sub, format(
      'select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 1)))',
      v_ca, 'producto_id', v_pa, 'cantidad')),
    'NO_AUTENTICADO',
    '01 - crear_pedido sin sesion (sin sub) rechaza con NO_AUTENTICADO'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_sin_sub, 'select public.cancelar_pedido(gen_random_uuid())'),
    'NO_AUTENTICADO',
    '02 - cancelar_pedido sin sesion (sin sub) rechaza con NO_AUTENTICADO'
  );
  return next extensions.is(
    pg_temp.valor_de(v_sin_sub, 'select count(*) from public.productos'),
    '0',
    '03 - authenticated sin sub no ve ningun producto por RLS'
  );

  -- D7: aislamiento al leer y escribir productos y clientes.
  return next extensions.is(
    pg_temp.valor_de(v_ja, 'select count(*) from public.clientes'),
    '1',
    '04 - usuario A solo ve su cliente por RLS'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_ja, format(
      'insert into public.productos (owner_id, nombre, precio_cents) values (%L, %L, 1)', v_b, 'Falso')),
    '42501',
    '05 - A no puede crear un producto a nombre de B (42501 por with check)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_ja, format(
      'insert into public.clientes (owner_id, nombre) values (%L, %L)', v_b, 'Falso')),
    '42501',
    '06 - A no puede crear un cliente a nombre de B (42501 por with check)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_ja, format(
      'update public.productos set owner_id = %L where id = %L', v_b, v_pa)),
    '42501',
    '07 - A no puede pasar su producto a B (42501 por with check)'
  );
  return next extensions.is(
    pg_temp.filas_de(v_ja, format('update public.productos set stock = 0 where id = %L', v_pb)),
    0,
    '08 - update de A sobre el producto de B no toca ninguna fila'
  );
  return next extensions.is(
    pg_temp.filas_de(v_ja, format('delete from public.productos where id = %L', v_pb)),
    0,
    '09 - delete de A sobre el producto de B no toca ninguna fila'
  );
  return next extensions.is(
    pg_temp.filas_de(v_ja, format('update public.clientes set nombre = %L where id = %L', 'Robado', v_cb)),
    0,
    '10 - update de A sobre el cliente de B no toca ninguna fila'
  );
  return next extensions.is(
    pg_temp.filas_de(v_ja, format('delete from public.clientes where id = %L', v_cb)),
    0,
    '11 - delete de A sobre el cliente de B no toca ninguna fila'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jb, format(
      'select p.nombre || %L || p.stock || %L || c.nombre from public.productos p, public.clientes c '
        || 'where p.id = %L and c.id = %L', '|', '|', v_pb, v_cb)),
    'Ajeno|50|Cliente B',
    '12 - el producto y el cliente de B siguen intactos'
  );

  -- D11: el stock nunca es negativo, tampoco con una escritura directa.
  return next extensions.is(
    pg_temp.sqlstate_de(v_ja, format('update public.productos set stock = -1 where id = %L', v_pa)),
    '23514',
    '13 - update directo a stock -1 falla con 23514 (check stock >= 0)'
  );
  return next extensions.is(
    pg_temp.sqlstate_de(v_ja, $sql$insert into public.productos (nombre, precio_cents, stock) values ('Negativo', 1, -1)$sql$),
    '23514',
    '14 - insert con stock -1 falla con 23514 (check stock >= 0)'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_ja, format(
      'select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 0)))',
      v_ca, 'producto_id', v_pa, 'cantidad')),
    'CANTIDAD_INVALIDA',
    '15 - crear_pedido rechaza cantidad 0 con CANTIDAD_INVALIDA'
  );
  return next extensions.is(
    pg_temp.mensaje_de(v_ja, format(
      'select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, -1)))',
      v_ca, 'producto_id', v_pa, 'cantidad')),
    'CANTIDAD_INVALIDA',
    '16 - crear_pedido rechaza cantidad negativa con CANTIDAD_INVALIDA'
  );

  -- Pedido válido de A: 2 x Cafe (stock 5 -> 3).
  v_o1 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 2)))',
    v_ca, 'producto_id', v_pa, 'cantidad'))::uuid;

  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select (select owner_id::text from public.pedidos where id = %1$L) || %2$L '
        || '|| (select string_agg(owner_id::text, %3$L) from public.pedido_lineas where pedido_id = %1$L)',
      v_o1, '|', ',')),
    v_a::text || '|' || v_a::text,
    '17 - el pedido y su linea quedan a nombre de A (owner_id = auth.uid())'
  );
  return next extensions.is(
    pg_temp.valor_de(v_jb, 'select count(*) from public.pedido_lineas'),
    '0',
    '18 - usuario B no ve las lineas de pedido de A por RLS'
  );

  -- D12: si una línea falla no se guarda ninguna línea ni cambia el stock.
  return next extensions.is(
    pg_temp.mensaje_de(v_ja, format(
      'select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 99999)))',
      v_ca, 'producto_id', v_pa, 'cantidad'))
      || '|lineas=' || pg_temp.valor_de(v_ja, 'select count(*) from public.pedido_lineas')
      || '|stock=' || pg_temp.valor_de(v_ja, format('select stock from public.productos where id = %L', v_pa)),
    'STOCK_INSUFICIENTE: Cafe|lineas=1|stock=3',
    '19 - pedido rechazado por stock no deja lineas ni descuenta stock'
  );

  -- D13: cada pedido copia el precio vigente; el anterior conserva el suyo.
  perform pg_temp.filas_de(v_ja, format('update public.productos set precio_cents = 300 where id = %L', v_pa));
  v_o2 := pg_temp.valor_de(v_ja, format(
    'select public.crear_pedido(%L, jsonb_build_array(jsonb_build_object(%L, %L, %L, 1)))',
    v_ca, 'producto_id', v_pa, 'cantidad'))::uuid;
  return next extensions.is(
    pg_temp.valor_de(v_ja, format(
      'select (select precio_unit_cents from public.pedido_lineas where pedido_id = %L) || %L '
        || '|| (select precio_unit_cents from public.pedido_lineas where pedido_id = %L) || %L '
        || '|| (select total_cents from public.pedidos where id = %L)',
      v_o2, '|', v_o1, '|', v_o2)),
    '300|250|300',
    '20 - el pedido nuevo copia el precio nuevo (300) y el anterior conserva 250'
  );

  -- D14: un pedido enviado no se puede volver a enviar.
  perform pg_temp.valor_de(v_ja, format('select public.enviar_pedido(%L)', v_o2));
  return next extensions.is(
    pg_temp.mensaje_de(v_ja, format('select public.enviar_pedido(%L)', v_o2)),
    'ESTADO_INVALIDO',
    '21 - enviar un pedido ya enviado falla con ESTADO_INVALIDO'
  );

  return query select * from extensions.finish();
end;
$$;

select * from pg_temp.run_tests();

rollback;
