export type AuthErrorInfo = {
  code?: string;
  status?: number;
};

const MESSAGES_BY_CODE: Record<string, string> = {
  invalid_credentials: "El email o la contraseña no son correctos.",
  email_not_confirmed: "Tienes que confirmar tu email antes de entrar.",
  user_banned: "Tu cuenta está bloqueada. Contacta con el administrador.",
  over_request_rate_limit: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
  request_timeout: "No se ha podido conectar con el servidor. Revisa tu conexión.",
};

/** Traduce un error de Supabase Auth a un mensaje en español para la persona. */
export function authErrorMessage(error: AuthErrorInfo): string {
  if (error.code && Object.hasOwn(MESSAGES_BY_CODE, error.code)) {
    return MESSAGES_BY_CODE[error.code];
  }
  if (error.status === 429) {
    return MESSAGES_BY_CODE.over_request_rate_limit;
  }
  if (!error.status) {
    return MESSAGES_BY_CODE.request_timeout;
  }
  return "No se ha podido iniciar sesión. Inténtalo de nuevo.";
}
