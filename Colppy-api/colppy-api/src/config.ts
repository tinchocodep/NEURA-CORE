// ============================================================
// Configuración centralizada - usa variables de entorno
// ============================================================
// Agregá estas variables a tu .env.local:
//
//   COLPPY_API_USER=TuAppColppy
//   COLPPY_API_PASSWORD_MD5=md5delpasswordapi
//   COLPPY_USER_EMAIL=usuario@empresa.com
//   COLPPY_USER_PASSWORD_MD5=md5delpasswordUsuario
//   COLPPY_DEFAULT_EMPRESA_ID=98
//   COLPPY_ENV=production
// ============================================================

import { createColppy } from "./index";
import { ColppyClient } from "./client";

function getEnvOrThrow(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `Variable de entorno ${key} no definida. Agregala a .env.local`
    );
  }
  return val;
}

/**
 * Crea una instancia de Colppy con las variables de entorno.
 * Usalo en tus API routes de Next.js:
 *
 * @example
 * import { getColppy } from "@/lib/colppy-api/src/config";
 * const colppy = getColppy();
 * await colppy.facturacion.crearVenta({ ... });
 */
export function getColppy() {
  const env = process.env.COLPPY_ENV ?? "production";
  const baseUrl =
    env === "staging"
      ? ColppyClient.STAGING_URL
      : ColppyClient.PRODUCTION_URL;

  return createColppy({
    apiUser: getEnvOrThrow("COLPPY_API_USER"),
    apiPasswordMD5: getEnvOrThrow("COLPPY_API_PASSWORD_MD5"),
    userEmail: getEnvOrThrow("COLPPY_USER_EMAIL"),
    userPasswordMD5: getEnvOrThrow("COLPPY_USER_PASSWORD_MD5"),
    defaultIdEmpresa: process.env.COLPPY_DEFAULT_EMPRESA_ID,
    baseUrl,
  });
}
