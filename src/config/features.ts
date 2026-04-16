// Feature flags centralizados.
// Fuente unica de verdad para saber que features estan disponibles en NeuraCore
// y que controlan dentro de la UI.
//
// Los flags activos de cada tenant viven en la columna tenants.enabled_modules (JSONB array).
// Esta constante documenta todos los flags posibles + su descripcion + donde se usan.

export type FeatureFlag =
  // Modulos grandes (los que ya existen en tenants.enabled_modules)
  | 'tesoreria'
  | 'contable'
  | 'crm'
  | 'comercial'
  | 'inmobiliaria'
  | 'construccion'
  | 'agro'
  | 'impuestos'
  | 'liquidaciones'
  | 'obras'
  | 'administracion'
  | 'logistica'
  | 'bank_import'
  // Integraciones
  | 'erp_colppy'
  | 'erp_xubio'
  | 'arca_sync'           // sync ARCA / Mis Comprobantes
  | 'facturacion_afip'    // emision de facturas electronicas AFIP
  // Mensajeria
  | 'mensajeria_whatsapp'
  | 'mensajeria_mail'
  | 'mensajeria_telegram';

export interface FeatureDefinition {
  flag: FeatureFlag;
  label: string;
  description: string;
  category: 'modulo' | 'integracion' | 'mensajeria';
}

export const FEATURES: FeatureDefinition[] = [
  { flag: 'tesoreria',          label: 'Tesorería',           description: 'Cajas, bancos, conciliación, movimientos.',                       category: 'modulo' },
  { flag: 'contable',           label: 'Contable',            description: 'Comprobantes, clientes, proveedores.',                             category: 'modulo' },
  { flag: 'crm',                label: 'CRM',                 description: 'Prospectos, clientes, pipeline.',                                  category: 'modulo' },
  { flag: 'comercial',          label: 'Comercial',           description: 'Pipeline de ventas, presupuestos.',                                category: 'modulo' },
  { flag: 'inmobiliaria',       label: 'Inmobiliaria',        description: 'Propiedades, contratos, liquidaciones, órdenes.',                  category: 'modulo' },
  { flag: 'construccion',       label: 'Construcción',        description: 'Centros de costo, materiales, obras.',                             category: 'modulo' },
  { flag: 'agro',               label: 'Agro',                description: 'Campos, lotes, carga de comprobantes.',                            category: 'modulo' },
  { flag: 'impuestos',          label: 'Impuestos',           description: 'IVA, IIBB, saldos a favor.',                                       category: 'modulo' },
  { flag: 'liquidaciones',      label: 'Liquidaciones',       description: 'Sueldos, empleados, fichajes.',                                    category: 'modulo' },
  { flag: 'obras',              label: 'Obras',               description: 'Partes diarios, contratistas, cartas de oferta.',                  category: 'modulo' },
  { flag: 'administracion',     label: 'Administración',      description: 'Gestión administrativa.',                                          category: 'modulo' },
  { flag: 'logistica',          label: 'Logística',           description: 'Envíos, rutas, stock.',                                            category: 'modulo' },
  { flag: 'bank_import',        label: 'Import bancos',       description: 'Importación de extractos bancarios.',                              category: 'modulo' },
  { flag: 'erp_colppy',         label: 'ERP Colppy',          description: 'Sincronización con Colppy.',                                       category: 'integracion' },
  { flag: 'erp_xubio',          label: 'ERP Xubio',           description: 'Sincronización con Xubio.',                                        category: 'integracion' },
  { flag: 'arca_sync',          label: 'Sync ARCA',           description: 'Importar comprobantes desde Mis Comprobantes AFIP.',               category: 'integracion' },
  { flag: 'facturacion_afip',   label: 'Facturación AFIP',    description: 'Emitir facturas electrónicas con certificado digital.',            category: 'integracion' },
  { flag: 'mensajeria_whatsapp',label: 'WhatsApp',            description: 'Envío/recepción por WhatsApp Business.',                           category: 'mensajeria' },
  { flag: 'mensajeria_mail',    label: 'Mail',                description: 'Envío de mails transaccionales.',                                  category: 'mensajeria' },
  { flag: 'mensajeria_telegram',label: 'Telegram',            description: 'Bot de Telegram para notificaciones.',                             category: 'mensajeria' },
];

export function hasFeature(enabledModules: string[] | undefined | null, flag: FeatureFlag): boolean {
  if (!enabledModules) return false;
  return enabledModules.includes(flag);
}

export function getFeaturesByCategory(category: FeatureDefinition['category']): FeatureDefinition[] {
  return FEATURES.filter(f => f.category === category);
}
