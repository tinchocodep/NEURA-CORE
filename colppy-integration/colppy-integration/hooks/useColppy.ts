// ============================================================
// Hook: useColppy — Acceso a Colppy desde componentes React
// ============================================================
// Se integra con TenantContext y AuthContext de NeuraCore.
// ============================================================

import { useState, useCallback, useMemo } from "react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
// Ajustá estos imports a la ubicación real en tu proyecto:
// import { useTenant } from "@/contexts/TenantContext";
import { ColppyService, type ColppyCredentials, type ColppyIntegrationConfig } from "../services/colppy.service";
import { IntegrationService } from "../services/integration.service";

/**
 * Hook para interactuar con Colppy desde cualquier componente.
 *
 * @example
 * function MiComponente() {
 *   const { colppy, isActive, syncComprobante, loading } = useColppy();
 *
 *   const handleSync = async () => {
 *     const result = await syncComprobante({ tipo: "venta", ... });
 *     if (result.success) toast.success("Sincronizado!");
 *   };
 * }
 */
export function useColppy() {
  const supabase = useSupabaseClient();
  // const { tenantId } = useTenant(); // Descomentá con tu TenantContext real
  const tenantId = ""; // PLACEHOLDER — reemplazar con useTenant()

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Instanciar servicios
  const colppy = useMemo(
    () => new ColppyService(supabase, tenantId),
    [supabase, tenantId]
  );

  const integration = useMemo(
    () => new IntegrationService(supabase, tenantId),
    [supabase, tenantId]
  );

  // --- Helpers con loading/error state ---

  const withLoading = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const result = await fn();
        return result;
      } catch (err: any) {
        setError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // --- Acciones expuestas ---

  /** Guarda credenciales de Colppy para este tenant */
  const saveCredentials = useCallback(
    (creds: ColppyCredentials, config?: Partial<ColppyIntegrationConfig>) =>
      withLoading(() => colppy.saveCredentials(creds, config)),
    [colppy, withLoading]
  );

  /** Prueba la conexión */
  const testConnection = useCallback(
    () => withLoading(() => colppy.testConnection()),
    [colppy, withLoading]
  );

  /** Verifica si está activa la integración */
  const checkActive = useCallback(
    () => withLoading(() => colppy.isActive()),
    [colppy, withLoading]
  );

  /** Sync cliente → Colppy */
  const syncCliente = useCallback(
    (data: Parameters<ColppyService["syncCliente"]>[0]) =>
      withLoading(() => colppy.syncCliente(data)),
    [colppy, withLoading]
  );

  /** Sync proveedor → Colppy */
  const syncProveedor = useCallback(
    (data: Parameters<ColppyService["syncProveedor"]>[0]) =>
      withLoading(() => colppy.syncProveedor(data)),
    [colppy, withLoading]
  );

  /** Sync comprobante → Colppy */
  const syncComprobante = useCallback(
    (data: Parameters<ColppyService["syncComprobante"]>[0]) =>
      withLoading(() => colppy.syncComprobante(data)),
    [colppy, withLoading]
  );

  /** Sync asiento → Colppy */
  const syncAsiento = useCallback(
    (data: Parameters<ColppyService["syncAsiento"]>[0]) =>
      withLoading(() => colppy.syncAsiento(data)),
    [colppy, withLoading]
  );

  /** Sync sueldos → Colppy */
  const syncSueldos = useCallback(
    (data: Parameters<ColppyService["syncSueldos"]>[0]) =>
      withLoading(() => colppy.syncSueldos(data)),
    [colppy, withLoading]
  );

  /** Lista empresas del usuario en Colppy */
  const listarEmpresas = useCallback(
    () => withLoading(() => colppy.listarEmpresas()),
    [colppy, withLoading]
  );

  /** Lista talonarios */
  const listarTalonarios = useCallback(
    () => withLoading(() => colppy.listarTalonarios()),
    [colppy, withLoading]
  );

  /** Lista plan de cuentas */
  const listarCuentas = useCallback(
    () => withLoading(() => colppy.listarCuentas()),
    [colppy, withLoading]
  );

  /** Historial de sincronizaciones */
  const getSyncHistory = useCallback(
    (limit?: number) => withLoading(() => colppy.getSyncHistory(limit)),
    [colppy, withLoading]
  );

  return {
    // Servicio directo (para operaciones no wrapeadas)
    colppy,
    integration,

    // Estado
    loading,
    error,

    // Configuración
    saveCredentials,
    testConnection,
    checkActive,

    // Sync
    syncCliente,
    syncProveedor,
    syncComprobante,
    syncAsiento,
    syncSueldos,

    // Lectura (para mapeo/config)
    listarEmpresas,
    listarTalonarios,
    listarCuentas,

    // Log
    getSyncHistory,
  };
}
