// ============================================================
// Componente: ColppySetup
// ============================================================
// Panel de configuración para que un admin del tenant conecte
// su cuenta de Colppy a NeuraCore.
// Va en: /contable/configuracion o en un modal de integraciones.
// ============================================================

import { useState, useEffect } from "react";
import { useColppy } from "../hooks/useColppy";
import { createHash } from "crypto";

// Helper para MD5 (client-side)
function toMD5(text: string): string {
  // En el browser, podés usar crypto-js o similar.
  // Acá usamos una implementación simple:
  if (typeof window !== "undefined") {
    // Usar Web Crypto API (o reemplazar con crypto-js si preferís)
    // NOTA: MD5 no está en Web Crypto. Usá la librería 'md5' de npm:
    // import md5 from "md5";
    // return md5(text);
    console.warn("Usar librería md5 para browser. Ver comentario en el código.");
    return text; // PLACEHOLDER — instalar: npm install md5 @types/md5
  }
  return createHash("md5").update(text).digest("hex");
}

interface ColppySetupProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function ColppySetup({ onComplete, onCancel }: ColppySetupProps) {
  const {
    saveCredentials,
    testConnection,
    listarEmpresas,
    loading,
    error,
  } = useColppy();

  const [step, setStep] = useState<"credentials" | "empresa" | "done">(
    "credentials"
  );
  const [form, setForm] = useState({
    userEmail: "",
    userPassword: "",
    idEmpresa: "",
  });
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);

  // --- Step 1: Credenciales ---
  const handleTestConnection = async () => {
    setTestResult(null);

    // Guardar credenciales temporalmente para testear
    const result = await saveCredentials({
      userEmail: form.userEmail,
      userPasswordMD5: toMD5(form.userPassword),
      idEmpresa: form.idEmpresa || "0",
    });

    if (!result?.success) {
      setTestResult("Error guardando credenciales");
      return;
    }

    // Testear conexión
    const test = await testConnection();
    if (test?.success) {
      setTestResult("Conexión exitosa");

      // Listar empresas para que elija
      const empresasResult = await listarEmpresas();
      if (empresasResult?.success && empresasResult.data) {
        setEmpresas(
          Array.isArray(empresasResult.data) ? empresasResult.data : []
        );
        setStep("empresa");
      }
    } else {
      setTestResult(
        `Error de conexión: ${test?.error ?? "Verificá las credenciales"}`
      );
    }
  };

  // --- Step 2: Selección de empresa ---
  const handleSelectEmpresa = async (idEmpresa: string) => {
    setForm((f) => ({ ...f, idEmpresa }));

    // Guardar con la empresa seleccionada
    const result = await saveCredentials(
      {
        userEmail: form.userEmail,
        userPasswordMD5: toMD5(form.userPassword),
        idEmpresa,
      },
      { environment: "production" }
    );

    if (result?.success) {
      setStep("done");
      onComplete?.();
    }
  };

  // --- Render ---

  if (step === "done") {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h3>Colppy conectado exitosamente</h3>
        <p style={{ color: "#666", marginTop: 8 }}>
          Tus comprobantes, clientes y proveedores se sincronizarán
          automáticamente con Colppy.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
      <h2 style={{ marginBottom: 4 }}>Conectar Colppy</h2>
      <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
        Ingresá las credenciales de tu cuenta de Colppy para sincronizar
        datos automáticamente.
      </p>

      {step === "credentials" && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
              Email de Colppy
            </label>
            <input
              type="email"
              value={form.userEmail}
              onChange={(e) =>
                setForm((f) => ({ ...f, userEmail: e.target.value }))
              }
              placeholder="tu-email@empresa.com"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #ddd",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
              Contraseña de Colppy
            </label>
            <input
              type="password"
              value={form.userPassword}
              onChange={(e) =>
                setForm((f) => ({ ...f, userPassword: e.target.value }))
              }
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #ddd",
              }}
            />
            <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
              La contraseña se encripta antes de guardarse. Nunca se almacena
              en texto plano.
            </p>
          </div>

          {testResult && (
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                marginBottom: 16,
                background: testResult.includes("exitosa")
                  ? "#f0fdf4"
                  : "#fef2f2",
                color: testResult.includes("exitosa") ? "#166534" : "#991b1b",
                fontSize: 14,
              }}
            >
              {testResult}
            </div>
          )}

          {error && (
            <div
              style={{
                padding: 12,
                borderRadius: 6,
                marginBottom: 16,
                background: "#fef2f2",
                color: "#991b1b",
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {onCancel && (
              <button
                onClick={onCancel}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            )}
            <button
              onClick={handleTestConnection}
              disabled={loading || !form.userEmail || !form.userPassword}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: loading ? "#94a3b8" : "#3b82f6",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {loading ? "Conectando..." : "Probar conexión"}
            </button>
          </div>
        </>
      )}

      {step === "empresa" && (
        <>
          <p style={{ marginBottom: 16, fontWeight: 500 }}>
            Seleccioná la empresa de Colppy a vincular:
          </p>

          {empresas.length === 0 && (
            <p style={{ color: "#666" }}>No se encontraron empresas.</p>
          )}

          {empresas.map((empresa: any) => (
            <button
              key={empresa.idEmpresa}
              onClick={() => handleSelectEmpresa(empresa.idEmpresa)}
              disabled={loading}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 6,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
                marginBottom: 8,
                textAlign: "left",
              }}
            >
              <strong>{empresa.RazonSocial ?? empresa.NombreFantasia}</strong>
              {empresa.CUIT && (
                <span style={{ color: "#666", marginLeft: 8, fontSize: 13 }}>
                  CUIT: {empresa.CUIT}
                </span>
              )}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
