// ============================================================
// Colppy API - Cliente Base con Autenticación
// ============================================================
// Maneja la conexión, sesión y requests a la API de Colppy.
// Todas las llamadas van al endpoint único via POST JSON.
// ============================================================

import type {
  ColppyConfig,
  ColppySession,
  ColppyRequest,
  ColppyResponse,
} from "./types";

const COLPPY_PRODUCTION_URL =
  "https://login.colppy.com/lib/frontera2/service.php";
const COLPPY_STAGING_URL =
  "https://staging.colppy.com/lib/frontera2/service.php";

export class ColppyClient {
  private config: ColppyConfig;
  private session: ColppySession | null = null;
  private sessionExpiresAt: number = 0;
  private baseUrl: string;

  constructor(config: ColppyConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? COLPPY_PRODUCTION_URL;
  }

  // -----------------------------------------------------------
  // URL helpers
  // -----------------------------------------------------------

  /** Usar el ambiente de staging (testing) */
  static STAGING_URL = COLPPY_STAGING_URL;

  /** Usar el ambiente de producción */
  static PRODUCTION_URL = COLPPY_PRODUCTION_URL;

  // -----------------------------------------------------------
  // Sesión
  // -----------------------------------------------------------

  /**
   * Inicia sesión en Colppy y obtiene la claveSesion.
   * La sesión dura 60 minutos y se renueva con cada uso.
   */
  async login(): Promise<ColppySession> {
    const request: ColppyRequest = {
      auth: {
        usuario: this.config.apiUser,
        password: this.config.apiPasswordMD5,
      },
      service: {
        provision: "Usuario",
        operacion: "iniciar_sesion",
      },
      parameters: {
        usuario: this.config.userEmail,
        password: this.config.userPasswordMD5,
      },
    };

    const response = await this.rawRequest<any>(request);

    if (!response.response.success) {
      throw new ColppyError(
        `Login failed: ${response.response.message ?? "Unknown error"}`,
        "LOGIN_FAILED"
      );
    }

    this.session = {
      usuario: this.config.userEmail,
      claveSesion: response.response.data.claveSesion,
    };

    // La sesión dura 60 min, renovamos a los 55 por seguridad
    this.sessionExpiresAt = Date.now() + 55 * 60 * 1000;

    return this.session;
  }

  /** Cierra la sesión activa */
  async logout(): Promise<void> {
    if (!this.session) return;

    await this.rawRequest({
      auth: {
        usuario: this.config.apiUser,
        password: this.config.apiPasswordMD5,
      },
      service: {
        provision: "Usuario",
        operacion: "cerrar_sesion",
      },
      parameters: {
        sesion: this.session,
      },
    });

    this.session = null;
    this.sessionExpiresAt = 0;
  }

  /** Verifica si hay sesión activa y la renueva si expiró */
  async ensureSession(): Promise<ColppySession> {
    if (!this.session || Date.now() >= this.sessionExpiresAt) {
      await this.login();
    }
    return this.session!;
  }

  /** Devuelve la sesión actual (sin renovar) */
  getSession(): ColppySession | null {
    return this.session;
  }

  // -----------------------------------------------------------
  // Request genérico
  // -----------------------------------------------------------

  /**
   * Ejecuta una operación contra la API de Colppy.
   * Maneja autenticación automáticamente.
   *
   * @param provision - Nombre de la provisión (ej: "Cliente", "FacturaVenta")
   * @param operacion - Nombre de la operación (ej: "listar_cliente", "alta_facturaventa")
   * @param params - Parámetros adicionales de la operación
   * @returns Los datos de la respuesta
   */
  async execute<T = any>(
    provision: string,
    operacion: string,
    params: Record<string, any> = {}
  ): Promise<T> {
    const session = await this.ensureSession();

    const request: ColppyRequest = {
      auth: {
        usuario: this.config.apiUser,
        password: this.config.apiPasswordMD5,
      },
      service: {
        provision,
        operacion,
      },
      parameters: {
        sesion: session,
        ...params,
      },
    };

    const response = await this.rawRequest<T>(request);

    if (!response.response.success) {
      throw new ColppyError(
        `${provision}.${operacion} failed: ${response.response.message ?? "Unknown error"}`,
        "OPERATION_FAILED",
        { provision, operacion, params }
      );
    }

    return response.response.data as T;
  }

  // -----------------------------------------------------------
  // HTTP (interno)
  // -----------------------------------------------------------

  private async rawRequest<T>(
    body: ColppyRequest
  ): Promise<ColppyResponse<T>> {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new ColppyError(
        `HTTP ${res.status}: ${res.statusText}`,
        "HTTP_ERROR"
      );
    }

    const json = (await res.json()) as ColppyResponse<T>;
    return json;
  }

  // -----------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------

  /** ID de empresa por defecto (del config) */
  get defaultIdEmpresa(): string {
    if (!this.config.defaultIdEmpresa) {
      throw new ColppyError(
        "defaultIdEmpresa no configurado. Pasalo en el config o en cada llamada.",
        "MISSING_EMPRESA"
      );
    }
    return this.config.defaultIdEmpresa;
  }
}

// -----------------------------------------------------------
// Error personalizado
// -----------------------------------------------------------

export class ColppyError extends Error {
  code: string;
  details?: any;

  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = "ColppyError";
    this.code = code;
    this.details = details;
  }
}
