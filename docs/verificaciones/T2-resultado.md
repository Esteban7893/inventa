# Verificación del orquestador — T2 aplicada en Supabase

Tras el APROBADO de Testing (`docs/revisiones/T2-r2.md`), el orquestador aplicó
`supabase/migrations/0001_esquema.sql` al proyecto real y ejecutó `T2-pruebas.sql`:
un bloque que crea dos usuarios (A y B) dentro de una transacción, ejecuta las pruebas
con el rol `authenticated` y lo deshace todo al final (no deja datos).

| # | Prueba | Resultado |
|---|---|---|
| 01 | Función sin sesión | `NO_AUTENTICADO` ✅ |
| 02 | A solo ve sus productos | 2 de 2 ✅ |
| 03 | Pedido correcto: total | 1400 = 2×250 + 1×900 ✅ |
| 04–05 | Pedido correcto: descuenta stock | Café 5→3, Taza 1→0 ✅ |
| 06 | Precio copiado aunque luego cambie el producto | 250 ✅ |
| 07 | Sin stock | `STOCK_INSUFICIENTE: Taza` ✅ |
| 08 | Atómico: una línea falla → no se descuenta nada | stock Café sigue en 3 ✅ |
| 09–10 | Líneas vacías / no es array | `PEDIDO_VACIO` ✅ |
| 11 | Cantidad 1.5 | `CANTIDAD_INVALIDA` ✅ |
| 12 | Producto repetido | `PRODUCTO_REPETIDO` ✅ |
| 13 | Producto de otro usuario | `PRODUCTO_NO_ENCONTRADO` (sin filtrar su nombre) ✅ |
| 14 | Cliente de otro usuario | `CLIENTE_NO_ENCONTRADO` ✅ |
| 15–17 | Insert / update / delete directos en pedidos y líneas | `42501 permission denied` ✅ |
| 18 | B ve los pedidos de A | 0 ✅ |
| 19–20 | B cancela / envía un pedido de A | `PEDIDO_NO_ENCONTRADO` ✅ |
| 21 | Cancelar devuelve el stock | Café vuelve a 5 ✅ |
| 22 | Cancelar dos veces | `ESTADO_INVALIDO`, stock sigue en 5 ✅ |
| 23 | Enviar un cancelado | `ESTADO_INVALIDO` ✅ |
| 24–25 | Enviar y luego cancelar un enviado | `enviado` / `ESTADO_INVALIDO` ✅ |
| 26–27 | Borrar cliente / producto con pedidos | `23503 update or delete on table …` ✅ |

Después: 0 productos, 0 pedidos y 0 usuarios en la base de datos (todo deshecho).

## Advisors de Supabase
- `0029 authenticated_security_definer_function_executable` en `crear_pedido`,
  `cancelar_pedido` y `enviar_pedido`: **esperado y aceptado** (decisión D7/D8: son la única
  vía de escritura de pedidos, exigen sesión y filtran por `auth.uid()`).
- `0028/0029` en `public.rls_auto_enable()`: función de *event trigger* que crea Supabase al
  activar "RLS automático" en el proyecto. No se puede llamar por RPC, pero se revoca
  `execute` para dejar el aviso limpio → tarea para Develop (migración `0002`, en T3).
