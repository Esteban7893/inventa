-- Inventa — tests pgTAP de reglas de negocio, RLS y aislamiento entre usuarios.
-- Equivalente en pgTAP a las 27 verificaciones de docs/verificaciones/T2-pruebas.sql.
-- Compatible con `supabase test db --linked` (pg_prove) y con `supabase db query --linked -f`.
-- Todo se ejecuta dentro de una transacción que termina en rollback: no deja datos.

begin;

create function pg_temp.run_tests()
returns setof text
language plpgsql
set search_path = public, extensions
as $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_p1 uuid;
  v_p2 uuid;
  v_pb uuid;
  v_c1 uuid;
  v_cb uuid;
  v_o1 uuid;
  v_o2 uuid;
  v_msg text;
  v_state text;
  v_estado text;
  v_n integer;
  v_val integer;
  v_val2 integer;
begin
  return next extensions.plan(27);

  -- Usuarios ficticios de prueba (se deshacen con rollback al terminar).
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values
    (v_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-a-' || v_a::text || '@inventa.test', now(), now()),
    (v_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-b-' || v_b::text || '@inventa.test', now(), now());

  -- 01: función sin sesión (JWT sin sub -> auth.uid() es null).
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    perform public.enviar_pedido(gen_random_uuid());
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'NO_AUTENTICADO',
    '01 - funcion sin sesion rechaza con NO_AUTENTICADO'
  );

  -- Datos del usuario B bajo rol authenticated.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  insert into public.productos (nombre, precio_cents, stock)
  values ('Ajeno', 100, 50)
  returning id into v_pb;
  insert into public.clientes (nombre)
  values ('Cliente B')
  returning id into v_cb;

  -- Datos del usuario A bajo rol authenticated.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  insert into public.productos (nombre, precio_cents, stock, stock_minimo)
  values ('Cafe', 250, 5, 2)
  returning id into v_p1;
  insert into public.productos (nombre, precio_cents, stock)
  values ('Taza', 900, 1)
  returning id into v_p2;
  insert into public.clientes (nombre)
  values ('Cliente A')
  returning id into v_c1;

  -- 02: RLS en productos — A solo ve sus 2 productos.
  select count(*)::integer into v_n from public.productos;
  reset role;
  return next extensions.is(
    v_n,
    2,
    '02 - usuario A solo ve sus 2 productos por RLS'
  );

  -- 03, 04, 05: crear pedido correcto calcula total y descuenta stock.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  v_o1 := public.crear_pedido(
    v_c1,
    jsonb_build_array(
      jsonb_build_object('producto_id', v_p1, 'cantidad', 2),
      jsonb_build_object('producto_id', v_p2, 'cantidad', 1)
    )
  );
  select total_cents into v_val from public.pedidos where id = v_o1;
  reset role;
  return next extensions.is(
    v_val,
    1400,
    '03 - crear_pedido calcula total_cents correctamente (2*250 + 1*900 = 1400)'
  );

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select stock into v_val from public.productos where id = v_p1;
  reset role;
  return next extensions.is(
    v_val,
    3,
    '04 - crear_pedido descuenta stock de Cafe (5 -> 3)'
  );

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select stock into v_val from public.productos where id = v_p2;
  reset role;
  return next extensions.is(
    v_val,
    0,
    '05 - crear_pedido descuenta stock de Taza (1 -> 0)'
  );

  -- 06: precio copiado en pedido_lineas no cambia si se edita el producto.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  update public.productos set precio_cents = 999 where id = v_p1;
  select precio_unit_cents into v_val
  from public.pedido_lineas
  where pedido_id = v_o1 and producto_id = v_p1;
  reset role;
  return next extensions.is(
    v_val,
    250,
    '06 - precio_unit_cents copiado permanece en 250 tras editar el producto'
  );

  -- 07: sin stock suficiente.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.crear_pedido(
      v_c1,
      jsonb_build_array(jsonb_build_object('producto_id', v_p2, 'cantidad', 1))
    );
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'STOCK_INSUFICIENTE: Taza',
    '07 - crear_pedido rechaza linea sin stock con STOCK_INSUFICIENTE'
  );

  -- 08: atomicidad (Cafe con stock, Taza sin stock -> falla todo y stock de Cafe sigue en 3).
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.crear_pedido(
      v_c1,
      jsonb_build_array(
        jsonb_build_object('producto_id', v_p1, 'cantidad', 1),
        jsonb_build_object('producto_id', v_p2, 'cantidad', 1)
      )
    );
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select stock into v_val from public.productos where id = v_p1;
  select count(*)::integer into v_n from public.pedidos;
  reset role;
  return next extensions.is(
    v_msg || '|stock=' || v_val::text || '|pedidos=' || v_n::text,
    'STOCK_INSUFICIENTE: Taza|stock=3|pedidos=1',
    '08 - atomicidad: si una linea falla no se guarda el pedido ni baja el stock de Cafe'
  );

  -- 09: array de líneas vacío.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.crear_pedido(v_c1, '[]'::jsonb);
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'PEDIDO_VACIO',
    '09 - crear_pedido rechaza lineas vacias con PEDIDO_VACIO'
  );

  -- 10: payload de líneas que no es array.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.crear_pedido(v_c1, '{"x":1}'::jsonb);
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'PEDIDO_VACIO',
    '10 - crear_pedido rechaza payload que no es array con PEDIDO_VACIO'
  );

  -- 11: cantidad decimal (1.5).
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.crear_pedido(
      v_c1,
      jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 1.5))
    );
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'CANTIDAD_INVALIDA',
    '11 - crear_pedido rechaza cantidad decimal (1.5) con CANTIDAD_INVALIDA'
  );

  -- 12: producto repetido.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.crear_pedido(
      v_c1,
      jsonb_build_array(
        jsonb_build_object('producto_id', v_p1, 'cantidad', 1),
        jsonb_build_object('producto_id', v_p1, 'cantidad', 1)
      )
    );
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'PRODUCTO_REPETIDO',
    '12 - crear_pedido rechaza producto repetido con PRODUCTO_REPETIDO'
  );

  -- 13: producto de otro usuario (no filtra nombre ni stock).
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.crear_pedido(
      v_c1,
      jsonb_build_array(jsonb_build_object('producto_id', v_pb, 'cantidad', 100000))
    );
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'PRODUCTO_NO_ENCONTRADO',
    '13 - crear_pedido rechaza producto ajeno con PRODUCTO_NO_ENCONTRADO sin filtrar datos'
  );

  -- 14: cliente de otro usuario.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.crear_pedido(
      v_cb,
      jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 1))
    );
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'CLIENTE_NO_ENCONTRADO',
    '14 - crear_pedido rechaza cliente ajeno con CLIENTE_NO_ENCONTRADO'
  );

  -- 15: insert directo en public.pedidos denegado.
  v_state := '00000';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    insert into public.pedidos (cliente_id, estado, total_cents)
    values (v_c1, 'pendiente', 0);
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return next extensions.is(
    v_state,
    '42501',
    '15 - insert directo en public.pedidos denegado con 42501'
  );

  -- 16: update directo en public.pedidos denegado.
  v_state := '00000';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    update public.pedidos set total_cents = 1 where id = v_o1;
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return next extensions.is(
    v_state,
    '42501',
    '16 - update directo en public.pedidos denegado con 42501'
  );

  -- 17: delete directo en public.pedido_lineas denegado.
  v_state := '00000';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    delete from public.pedido_lineas where pedido_id = v_o1;
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return next extensions.is(
    v_state,
    '42501',
    '17 - delete directo en public.pedido_lineas denegado con 42501'
  );

  -- 18: RLS en pedidos — B no ve el pedido de A.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*)::integer into v_n from public.pedidos;
  reset role;
  return next extensions.is(
    v_n,
    0,
    '18 - usuario B no ve los pedidos de usuario A por RLS'
  );

  -- 19: usuario B intenta cancelar el pedido de A.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    perform public.cancelar_pedido(v_o1);
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'PEDIDO_NO_ENCONTRADO',
    '19 - usuario B no puede cancelar pedido de A (PEDIDO_NO_ENCONTRADO)'
  );

  -- 20: usuario B intenta enviar el pedido de A.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    perform public.enviar_pedido(v_o1);
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'PEDIDO_NO_ENCONTRADO',
    '20 - usuario B no puede enviar pedido de A (PEDIDO_NO_ENCONTRADO)'
  );

  -- 21: cancelar pedido de A cambia estado y devuelve el stock.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform public.cancelar_pedido(v_o1);
  select estado into v_estado from public.pedidos where id = v_o1;
  select stock into v_val from public.productos where id = v_p1;
  select stock into v_val2 from public.productos where id = v_p2;
  reset role;
  return next extensions.is(
    v_estado || '|cafe=' || v_val::text || '|taza=' || v_val2::text,
    'cancelado|cafe=5|taza=1',
    '21 - cancelar_pedido pasa el pedido a cancelado y devuelve el stock (Cafe=5, Taza=1)'
  );

  -- 22: cancelar una segunda vez falla y no vuelve a sumar stock.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.cancelar_pedido(v_o1);
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select stock into v_val from public.productos where id = v_p1;
  select stock into v_val2 from public.productos where id = v_p2;
  reset role;
  return next extensions.is(
    v_msg || '|cafe=' || v_val::text || '|taza=' || v_val2::text,
    'ESTADO_INVALIDO|cafe=5|taza=1',
    '22 - cancelar por segunda vez falla con ESTADO_INVALIDO y no vuelve a sumar stock'
  );

  -- 23: enviar un pedido cancelado falla.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.enviar_pedido(v_o1);
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'ESTADO_INVALIDO',
    '23 - enviar un pedido cancelado falla con ESTADO_INVALIDO'
  );

  -- 24: crear nuevo pedido y enviarlo pasa a estado enviado.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  v_o2 := public.crear_pedido(
    v_c1,
    jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 1))
  );
  perform public.enviar_pedido(v_o2);
  select estado into v_estado from public.pedidos where id = v_o2;
  reset role;
  return next extensions.is(
    v_estado,
    'enviado',
    '24 - enviar_pedido cambia el estado del pedido a enviado'
  );

  -- 25: cancelar un pedido ya enviado falla.
  v_msg := 'SIN_ERROR';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.cancelar_pedido(v_o2);
  exception when others then
    v_msg := sqlerrm;
  end;
  reset role;
  return next extensions.is(
    v_msg,
    'ESTADO_INVALIDO',
    '25 - cancelar un pedido enviado falla con ESTADO_INVALIDO'
  );

  -- 26: borrar un cliente con pedidos restringido por FK (23503).
  v_state := '00000';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    delete from public.clientes where id = v_c1;
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return next extensions.is(
    v_state,
    '23503',
    '26 - borrar un cliente con pedidos falla con 23503 (on delete restrict)'
  );

  -- 27: borrar un producto con pedidos restringido por FK (23503).
  v_state := '00000';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    delete from public.productos where id = v_p1;
  exception when others then
    v_state := sqlstate;
  end;
  reset role;
  return next extensions.is(
    v_state,
    '23503',
    '27 - borrar un producto con pedidos falla con 23503 (on delete restrict)'
  );

  return query select * from extensions.finish();
end;
$$;

select * from pg_temp.run_tests();

rollback;
