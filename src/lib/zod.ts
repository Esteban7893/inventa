import { z } from "zod";

/**
 * Zod sin compilación JIT. Sin esto, la primera validación en el navegador prueba
 * `new Function("")` y la CSP (sin `'unsafe-eval'`) lo registra como violación, aunque Zod
 * capture el error. Los esquemas que también se usan en el cliente importan `z` de aquí.
 */
z.config({ jitless: true });

export { z };
