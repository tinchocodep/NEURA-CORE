// ============================================================
// Helpers y utilidades
// ============================================================

import { createHash } from "crypto";

/**
 * Convierte un password en texto plano a MD5 (formato requerido por Colppy).
 *
 * @example
 * const md5 = toMD5("miPassword123");
 * // => "482c811da5d5b4bc6d497ffa98491e38"
 */
export function toMD5(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

/**
 * Formatea una fecha Date a string "YYYY-MM-DD" (formato Colppy).
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Valida que el total de una factura cuadre con sus componentes.
 * Colppy requiere: total = netoGravado + netoNoGravado + totalIVA + percepcionIVA + percepcionIIBB
 */
export function validarTotalFactura(params: {
  netoGravado?: number;
  netoNoGravado?: number;
  totalIVA?: number;
  percepcionIVA?: number;
  percepcionIIBB?: number;
  importeTotal?: number;
}): { valid: boolean; expected: number; actual: number | undefined } {
  const expected =
    (params.netoGravado ?? 0) +
    (params.netoNoGravado ?? 0) +
    (params.totalIVA ?? 0) +
    (params.percepcionIVA ?? 0) +
    (params.percepcionIIBB ?? 0);

  return {
    valid: params.importeTotal === undefined || params.importeTotal === expected,
    expected,
    actual: params.importeTotal,
  };
}

/**
 * Calcula el IVA a partir del neto gravado.
 * Alícuota por defecto: 21%
 */
export function calcularIVA(
  netoGravado: number,
  alicuota: number = 0.21
): { netoGravado: number; totalIVA: number; importeTotal: number } {
  const totalIVA = Math.round(netoGravado * alicuota * 100) / 100;
  return {
    netoGravado,
    totalIVA,
    importeTotal: netoGravado + totalIVA,
  };
}
