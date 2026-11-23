# Revisión T2b — ronda 2

**Veredicto: APROBADO**

## Comandos
| Comando | Resultado |
|---|---|
| npm run lint | ✅ (`eslint`, código 0, sin avisos) |
| npm run typecheck | ✅ (`tsc --noEmit`, código 0) |
| npm test | ✅ (3 archivos, 44 tests) |
| npm run build | ✅ (Next.js 16.4.6; `/panel`, `/productos`, `/clientes` y `/pedidos` en ◐ Partial Prerender; `ƒ Proxy (Middleware)`) |

## Directrices
| Id | Estado | Evidencia |
|---|---|---|
| D1 | ✅ | `npm run lint` sale con código 0 y sin salida. |
| D2 | ✅ | `npm run typecheck` sale con código 0. |
| D3 | ✅ | 44/44 tests. Esta ronda no añade funciones en `src/lib/domain/`. |
| D4 | ✅ | `npm run build` sale con código 0. |
| D5 | ✅ | `grep` de `any`, `@ts-ignore`, `console.*`, `TODO` y `FIXME` en `src/**/*.ts(x)`: sin resultados. El único `//` es el comentario explicativo de `src/lib/supabase/server.ts:28`. |
| D6 | ✅ | `grep` de `service_role`, `sb_secret` y `eyJhbGci` en `src`: sin resultados. No hay variables nuevas. |
| D7 | N/A | Esta ronda no toca SQL. |
| D8 | N/A | Esta ronda no toca funciones SQL. |
| D9 | ✅ | Las páginas siguen llamando a `requireUser()`. En el navegador, tras «Cerrar sesión», `/clientes` redirige a `/login`. |
| D10 | N/A | No hay Server Actions nuevas. Las que hay (`login`, `logout`) usan `createClient()`, que ahora llama a `connection()`, y en el navegador funcionan: el log del servidor muestra `ƒ logout()` y `ƒ login(...)` sin errores. |
| D11 | N/A | Sin cambios de base de datos. |
| D12 | N/A | Sin cambios de base de datos. |
| D13 | N/A | Sin cambios de base de datos. |
| D14 | N/A | Sin cambios de base de datos. |
| D15 | N/A | Esta tarea no muestra importes. |
| D16 | ✅ | El estado de carga dice «Cargando…». Login con contraseña incorrecta: «El email o la contraseña no son correctos.» (en `role="alert"`). El 404 sigue diciendo «Página no encontrada». |
| D17 | ✅ | Sin cambios en `field.tsx` ni en `login-form.tsx`. En el navegador, el login con error muestra el aviso sobre el formulario y vuelve a rellenar el email. |
| D18 | ✅ | `EmptyState` sin cambios. Las cuatro secciones muestran «Esta sección aún no tiene asientos.». No hay acciones destructivas. |
| D19 | ✅ | Navegador a 375 px: `scrollWidth` = 375 en `/login`, `/panel`, `/productos`, `/clientes`, `/pedidos` y el 404, entrando directamente y con las pestañas. El estado de carga inyectado en el DOM tampoco desborda. |
| D20 | ✅ | `src/lib/supabase/server.ts:13` llama a `await connection()` antes de `cookies()` y de Supabase, como indica `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md:335`. El layout ya no envuelve `{children}` en `Suspense` (`src/app/(app)/layout.tsx:27`); cada sección tiene su `loading.tsx`, que reexporta `SectionLoading`. `UserMenu` sigue en su `<Suspense>` (`layout.tsx:17-19`). En el navegador, con `npm run dev`: entrando directamente en las cuatro rutas privadas y navegando con las pestañas (Panel → Productos → Clientes → Pedidos → logotipo → Panel), a 1280 px y a 375 px, la superposición de Next no muestra Issues ni Insights; el menú de Dev Tools solo lista Bundler, Cache Components, Navigation Inspector, Route Info y Preferences. La consola del navegador no tiene errores. El log del servidor solo tiene líneas `GET`/`POST 200` (y `404` en `/no-existe`), sin errores, avisos ni `Date.now()`. Siguen `src/proxy.ts` y la prop `retry`. |
| D21 | ✅ | Los `grep` de degradados, sombras, `rounded-md` o mayor, hex sueltos y colores de Tailwind dan vacío en `src`. `section-loading.tsx` solo usa `rule-thick`, `letterhead` y `text-ink-soft`: sin esqueletos grises, sin spinner y sin animación de pulso. |
| D22 | ✅ | En el navegador, `SectionLoading` (`src/components/section-loading.tsx:8-10`) sale como una cabecera de página vacía: membrete «CARGANDO…» en Plex Mono, mayúsculas y tinta suave, con la regla de tinta debajo en el mismo sitio que la de `PageHeader` (alto de 31/42 px, igual que el título). Al cargar la sección no hay salto: la regla no se mueve. A 1280 y a 375 px se ve como una hoja con el título aún sin escribir. Lo que ya estaba bien sigue igual: título en Newsreader, sección activa subrayada en tinta con `aria-current="page"` en las cuatro, sello «PRÓXIMAMENTE» girado y 404 como «hoja de incidencia». Como en la ronda 1, las reglas se declaran a 1,5 px pero este panel de navegador las pinta a 1 px; es redondeo del navegador, no un fallo del código. |

## Fallos que Develop tiene que corregir
Ninguno.

Notas para el orquestador (no bloquean):
- `.claude/agents/develop.md` está modificado en el árbol de trabajo (4 líneas nuevas en «Cómo se escribe el código»: cada ruta privada lleva su `loading.tsx` y `connection()` no va dentro de `"use cache"`). No está en la lista de archivos de Develop: confirma si el cambio es tuyo antes del commit.
- Cobertura del navegador: login vacío no repetido (no cambió), login con contraseña incorrecta, login correcto, «Cerrar sesión», redirección sin sesión, las cuatro secciones (directas y con pestañas, a 1280 y 375 px) y el 404. El estado de carga lo vi en el HTML que devuelve `/productos` (`<div role="status">…Cargando…`) y metiéndolo en el DOM para verlo; en la navegación real va demasiado rápido para verlo. `error.tsx` y `global-error.tsx` no se pueden provocar desde el navegador: no han cambiado.
- Paré el servidor de desarrollo (el puerto 3000 queda libre) y cerré la pestaña del navegador. No he editado ningún archivo.
