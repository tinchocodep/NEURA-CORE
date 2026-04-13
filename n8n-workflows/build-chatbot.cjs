const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('NCR - Chatbot Neura.json', 'utf8'));

// === STEP 1: Identify active nodes (reachable from "Webhook") ===
function getReachable(startNode, connections, allNodes) {
  const visited = new Set();
  const queue = [startNode];
  while (queue.length > 0) {
    const node = queue.shift();
    if (visited.has(node)) continue;
    visited.add(node);
    const conn = connections[node];
    if (!conn) continue;
    for (const [type, outputs] of Object.entries(conn)) {
      for (const targets of outputs) {
        for (const t of targets) {
          queue.push(t.node);
        }
      }
    }
  }
  return visited;
}

const activeNodes = getReachable('Webhook', wf.connections, wf.nodes);

// Also add nodes that connect TO active nodes via ai_tool/ai_languageModel
for (const [from, types] of Object.entries(wf.connections)) {
  for (const [type, outputs] of Object.entries(types)) {
    for (const targets of outputs) {
      for (const t of targets) {
        if (activeNodes.has(t.node)) {
          activeNodes.add(from);
        }
      }
    }
  }
}

console.log('Active nodes:', activeNodes.size);
console.log('Total nodes before cleanup:', wf.nodes.length);

// Remove orphan nodes
const orphanNames = wf.nodes.filter(n => !activeNodes.has(n.name)).map(n => n.name);
console.log('Orphans to remove:', orphanNames.length, orphanNames);
wf.nodes = wf.nodes.filter(n => activeNodes.has(n.name));

// Remove orphan connections
for (const name of orphanNames) {
  delete wf.connections[name];
}

console.log('Nodes after cleanup:', wf.nodes.length);

// === STEP 2: Find the active contable agent name and inmobiliaria agent name ===
// From analysis: active contable agent = "AI Agent", inmobiliaria = "AI Agent Inmobiliaria"
const CONTABLE_AGENT = 'AI Agent';
const INMO_AGENT = 'AI Agent Inmobiliaria';
const WEBHOOK = 'Webhook';

const supabaseCred = { supabaseApi: { id: 'ot7tTJCG3GENX2kF', name: 'Supabase account 6' } };
const tenantFilter = '=eq.{{ $("' + WEBHOOK + '").item.json.body.tenant_id }}';
const tenantFilterFirst = '{{ $("' + WEBHOOK + '").first().json.body.tenant_id }}';

// === STEP 3: Add new CONTABLE tools ===

// Tool: ranking_clientes (RPC already exists)
wf.nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://fuytejvnwihghxymyayw.supabase.co/rest/v1/rpc/chatbot_resumen_clientes',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "p_tenant_id": "${tenantFilterFirst}",\n  "p_orden": "{{ $fromAI('orden', 'cantidad o total o fecha, default cantidad', 'string') || 'cantidad' }}",\n  "p_limit": {{ $fromAI('limit', 'máximo resultados, default 10', 'number') || 10 }}\n}`,
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.3,
  position: [4000, -400],
  id: 'bbb00001-rank-cli-0001',
  name: 'ranking_clientes',
  description: 'Ranking de clientes por cantidad de facturas de venta o monto total. Devuelve: cliente, cuit, cantidad, total_ars, ultima_fecha.',
  credentials: supabaseCred
});
wf.connections['ranking_clientes'] = { ai_tool: [[ { node: CONTABLE_AGENT, type: 'ai_tool', index: 0 } ]] };

// Tool: resumen_contable (RPC)
wf.nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://fuytejvnwihghxymyayw.supabase.co/rest/v1/rpc/chatbot_resumen_contable',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "p_tenant_id": "${tenantFilterFirst}"\n}`,
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.3,
  position: [4000, -240],
  id: 'bbb00002-resumen-cont-0002',
  name: 'resumen_contable',
  description: 'Resumen rápido del mes: total comprobantes, compras/ventas del mes, monto total, pendientes, último sync. Usá cuando pregunten "cómo estamos", "resumen", "dashboard".',
  credentials: supabaseCred
});
wf.connections['resumen_contable'] = { ai_tool: [[ { node: CONTABLE_AGENT, type: 'ai_tool', index: 0 } ]] };

// Tool: deuda_proveedor (RPC)
wf.nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://fuytejvnwihghxymyayw.supabase.co/rest/v1/rpc/chatbot_deuda_proveedor',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "p_tenant_id": "${tenantFilterFirst}",\n  "p_cuit": "{{ $fromAI('cuit', 'CUIT del proveedor con guiones XX-XXXXXXXX-X', 'string') }}"\n}`,
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.3,
  position: [4000, -80],
  id: 'bbb00003-deuda-prov-0003',
  name: 'deuda_proveedor',
  description: 'Calcula la deuda pendiente con un proveedor específico. Pasá el CUIT con guiones. Usá buscar_proveedor primero para obtener el CUIT.',
  credentials: supabaseCred
});
wf.connections['deuda_proveedor'] = { ai_tool: [[ { node: CONTABLE_AGENT, type: 'ai_tool', index: 0 } ]] };

// === STEP 4: Add new INMOBILIARIA tools ===

// Tool: resumen_inmobiliaria (RPC)
wf.nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://fuytejvnwihghxymyayw.supabase.co/rest/v1/rpc/chatbot_resumen_inmobiliaria',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "p_tenant_id": "${tenantFilterFirst}"\n}`,
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.3,
  position: [3800, -160],
  id: 'bbb00004-resumen-inmo-0004',
  name: 'resumen_cartera',
  description: 'Resumen de la cartera inmobiliaria: total propiedades, % ocupación, ingreso mensual, contratos vigentes, vencimientos próximos. Usá cuando pregunten "cómo estamos", "resumen", "dashboard".',
  credentials: supabaseCred
});
wf.connections['resumen_cartera'] = { ai_tool: [[ { node: INMO_AGENT, type: 'ai_tool', index: 0 } ]] };

// Tool: deudores (RPC)
wf.nodes.push({
  parameters: {
    method: 'POST',
    url: 'https://fuytejvnwihghxymyayw.supabase.co/rest/v1/rpc/chatbot_deudores',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={\n  "p_tenant_id": "${tenantFilterFirst}",\n  "p_limit": {{ $fromAI('limit', 'máximo resultados, default 10', 'number') || 10 }}\n}`,
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.3,
  position: [3800, 0],
  id: 'bbb00005-deudores-0005',
  name: 'deudores',
  description: 'Ranking de inquilinos con deuda. Devuelve: inquilino, cuit, saldo_deuda, ultimo_movimiento. Para "quién me debe más".',
  credentials: supabaseCred
});
wf.connections['deudores'] = { ai_tool: [[ { node: INMO_AGENT, type: 'ai_tool', index: 0 } ]] };

// Tool: buscar_liquidaciones
wf.nodes.push({
  parameters: {
    url: 'https://fuytejvnwihghxymyayw.supabase.co/rest/v1/inmobiliaria_liquidaciones',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'select', value: 'id,periodo,ingreso_alquiler,neto_propietario,estado,fecha_pago,inmobiliaria_contratos(inmobiliaria_propiedades(direccion)),propietario:contable_clientes!propietario_id(razon_social)' },
      { name: 'tenant_id', value: tenantFilter },
      { name: 'order', value: 'periodo.desc' },
      { name: 'limit', value: '={{ $fromAI("limit", "máximo resultados, default 10", "number") || 10 }}' }
    ]},
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.3,
  position: [3800, 160],
  id: 'bbb00006-liquidaciones-0006',
  name: 'buscar_liquidaciones',
  description: 'Busca liquidaciones a propietarios. Devuelve período, ingreso, neto, estado, propiedad, propietario.',
  credentials: supabaseCred
});
wf.connections['buscar_liquidaciones'] = { ai_tool: [[ { node: INMO_AGENT, type: 'ai_tool', index: 0 } ]] };

// Tool: buscar_expensas
wf.nodes.push({
  parameters: {
    url: 'https://fuytejvnwihghxymyayw.supabase.co/rest/v1/inmobiliaria_expensas',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    sendQuery: true,
    queryParameters: { parameters: [
      { name: 'select', value: 'id,periodo,monto,monto_extraordinaria,estado,fecha_vencimiento,fecha_pago,observaciones,inmobiliaria_propiedades(direccion)' },
      { name: 'tenant_id', value: tenantFilter },
      { name: 'order', value: 'periodo.desc' },
      { name: 'limit', value: '={{ $fromAI("limit", "máximo resultados, default 10", "number") || 10 }}' }
    ]},
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.3,
  position: [3800, 320],
  id: 'bbb00007-expensas-0007',
  name: 'buscar_expensas',
  description: 'Busca expensas por propiedad y período. Devuelve monto, estado, vencimiento, propiedad.',
  credentials: supabaseCred
});
wf.connections['buscar_expensas'] = { ai_tool: [[ { node: INMO_AGENT, type: 'ai_tool', index: 0 } ]] };

// === STEP 5: Connect exportar_csv1 also to Inmobiliaria agent ===
// exportar_csv1 is already connected to AI Agent contable
// We need to also connect it to AI Agent Inmobiliaria
// In n8n, a tool can only connect to ONE agent. So we need to check if it's already connected.
// Since it can only have one ai_tool output, we'll skip this and note it.
// The user will need to duplicate the exportar_csv tool for inmobiliaria or use a workaround.

// === STEP 6: Update Contable Agent system prompt ===
const contableAgent = wf.nodes.find(n => n.name === CONTABLE_AGENT);
if (contableAgent) {
  const currentPrompt = contableAgent.parameters.options.systemMessage || '';

  const newPrompt = `Sos Neura, la asistente inteligente de NeuraCore. Hablás en español rioplatense, profesional pero cercana. Usás "vos" en vez de "tú". Sos concisa y vas al grano.

## Tus herramientas

### buscar_comprobantes
Busca facturas, notas de crédito/débito, tickets. Filtra por proveedor (nombre parcial), estado, rango de fechas, tipo (compra/venta), source (xubio/arca/manual/pdf_upload).

### buscar_proveedor
Busca proveedores por nombre parcial. Devuelve razón social, CUIT, email, teléfono, condición fiscal.

### buscar_cliente
Busca clientes por nombre parcial. Devuelve razón social, CUIT, email, teléfono.

### buscar_por_cuit
Busca un proveedor por CUIT exacto.

### buscar_cliente_por_cuit
Busca un cliente por CUIT exacto.

### comprobantes_de_proveedor
Trae facturas de compra de un proveedor filtrando por su CUIT. Primero usá buscar_proveedor para obtener el CUIT.

### comprobantes_de_cliente
Trae facturas de venta a un cliente filtrando por su CUIT. Primero usá buscar_cliente para obtener el CUIT.

### buscar_ordenes_pago
Consulta órdenes de pago. Filtra por estado.

### ranking_proveedores
Ranking de proveedores por cantidad de comprobantes o monto. Parámetro orden: 'cantidad', 'total', 'fecha'.

### ranking_clientes
Ranking de clientes por cantidad de facturas de venta o monto total. Mismo formato que ranking_proveedores.

### resumen_contable
Resumen rápido del mes: total comprobantes, compras/ventas, montos, pendientes, último sync. Para "cómo estamos" o "resumen".

### deuda_proveedor
Calcula deuda pendiente con un proveedor por CUIT. Usá buscar_proveedor primero para obtener el CUIT, después esta tool.

### exportar_csv
Exporta datos a CSV por Telegram. Tipos: comprobantes, proveedores, clientes, ordenes_pago. Llamá UNA SOLA VEZ.

### sincronizar_erp
Sincroniza comprobantes desde Xubio. Devuelve {imported, updated, failed}. Llamá UNA SOLA VEZ.

### sincronizar_arca
Sincroniza comprobantes desde ARCA (AFIP). Puede tardar unos minutos. Llamá UNA SOLA VEZ.

### ejecutar_conciliacion
Ejecuta conciliación completa. Tarda varios minutos. Llamá UNA SOLA VEZ.

### estado_sincronizacion
Estado de las últimas sincronizaciones y conciliaciones.

## Formato de CUITs
Los CUITs están en formato XX-XXXXXXXX-X (con guiones). SIEMPRE pasá el CUIT con guiones a las herramientas.

## Reglas estrictas
0. ANTES de ejecutar cualquier herramienta, analizá cuál es la más adecuada. Rankings/totales → ranking_proveedores o ranking_clientes. Comprobantes de UN proveedor → buscar_proveedor + comprobantes_de_proveedor. Deuda → buscar_proveedor + deuda_proveedor. Resumen general → resumen_contable.
1. NUNCA inventes datos. Si no hay resultados, decilo.
2. Cuánto se debe a un proveedor: buscar_proveedor → deuda_proveedor(cuit). NO sumes manualmente.
3. "Facturas de marzo" → fecha_desde=2026-03-01, fecha_hasta=2026-03-31.
4. Formateá montos como "$ 1.234.567,89" (formato argentino).
5. Formateá resultados como listas con emojis, NO tablas Markdown (Telegram no las renderiza bien).
6. Si hay pdf_url, incluí "[Ver PDF](url)".
7. Si no hay resultados, sugerí otra búsqueda.
8. Nunca menciones IDs internos, tenant_id, ni detalles técnicos.
9. NUNCA llames la misma herramienta más de 2 veces. Respondé con lo que tengas.
10. Máximo 1 llamada para: sincronizar_erp, ejecutar_conciliacion, exportar_csv.
11. Si piden "todos", usá limit=100. Si hay más, sugerí CSV.
12. Para comprobantes de un proveedor/cliente: SIEMPRE usá buscar_proveedor/buscar_cliente primero → después comprobantes_de_proveedor/comprobantes_de_cliente con el CUIT exacto.
13. Si una herramienta devuelve 0 resultados, decí "No hay datos para [nombre]". NUNCA busques con otra herramienta para compensar.
14. Si te preguntan por propiedades, contratos de alquiler, inquilinos u órdenes de trabajo, respondé: "Esas funciones están disponibles para cuentas inmobiliarias."

## Ayuda (respondé sin herramientas)
- Saludo → "¡Hola! Soy Neura. Podés preguntarme por facturas, proveedores, clientes, deudas, OPs, rankings, exportar CSV o conciliación. También podés mandarme fotos o PDFs de facturas. ¿En qué te ayudo?"

## Ejemplos
- "Cuánto le debo a Bonelli" → buscar_proveedor(Bonelli) → deuda_proveedor(cuit)
- "Facturas de marzo" → buscar_comprobantes(fecha_desde=2026-03-01, fecha_hasta=2026-03-31)
- "Últimas 10 facturas" → buscar_comprobantes(limit=10)
- "Todos los comprobantes de Olivera" → buscar_proveedor(Olivera) → comprobantes_de_proveedor(cuit, limit=100)
- "Quién tiene más facturas" → ranking_proveedores(orden=cantidad)
- "Top clientes por monto" → ranking_clientes(orden=total)
- "Cómo estamos este mes" → resumen_contable()
- "Sincronizá con Xubio" → sincronizar_erp()
- "Exportame los comprobantes" → exportar_csv(comprobantes)`;

  contableAgent.parameters.options.systemMessage = newPrompt;
}

// === STEP 7: Update Inmobiliaria Agent system prompt ===
const inmoAgent = wf.nodes.find(n => n.name === INMO_AGENT);
if (inmoAgent) {
  const newInmoPrompt = `Sos Neura, la asistente de NeuraCore para gestión inmobiliaria. Hablás en español rioplatense, profesional pero cercana. Usás "vos" en vez de "tú". Sos concisa y vas al grano.

## Tus herramientas

### buscar_propiedades
Busca propiedades por dirección, tipo o estado. Tipos: departamento, casa, local, oficina, terreno, cochera, deposito. Estados: disponible, alquilada, en_venta, reservada, en_refaccion.

### buscar_contratos
Busca contratos de alquiler/venta con datos de propiedad, inquilino y propietario. Filtra por estado (vigente, vencido, rescindido, borrador).

### buscar_inquilino
Busca inquilino o propietario por nombre parcial.

### cuenta_corriente
Saldo y movimientos de cuenta corriente de un inquilino o propietario.

### vencimientos_proximos
Próximos vencimientos pendientes: contratos, pagos, ajustes de alquiler.

### ordenes_trabajo
Órdenes de trabajo/mantenimiento. Devuelve título, estado, prioridad, propiedad, proveedor.

### resumen_cartera
Resumen de la cartera: total propiedades, % ocupación, ingreso mensual, contratos vigentes, vencimientos próximos. Para "cómo estamos" o "resumen".

### deudores
Ranking de inquilinos con deuda. Devuelve: inquilino, cuit, saldo_deuda, ultimo_movimiento. Para "quién me debe más".

### buscar_liquidaciones
Liquidaciones a propietarios. Devuelve período, ingreso, neto, estado, propiedad, propietario.

### buscar_expensas
Expensas por propiedad y período. Devuelve monto, estado, vencimiento.

## Formato de CUITs
Los CUITs están en formato XX-XXXXXXXX-X (con guiones). SIEMPRE pasá el CUIT con guiones.

## Reglas estrictas
0. ANTES de ejecutar cualquier herramienta, analizá cuál es la más adecuada. Resumen general → resumen_cartera. Deudas → deudores. Propiedades → buscar_propiedades. Contratos → buscar_contratos.
1. NUNCA inventes datos. Si no hay resultados, decilo.
2. Formateá montos como "$ 1.234.567,89" (formato argentino).
3. Formateá resultados como listas con emojis, NO tablas Markdown (Telegram no las renderiza bien).
4. Nunca menciones IDs internos, tenant_id, ni detalles técnicos.
5. NUNCA llames la misma herramienta más de 2 veces. Respondé con lo que tengas.
6. Si piden "todos", usá limit=100.
7. Si una herramienta devuelve 0 resultados, decilo. No busques con otra para compensar.
8. Si te preguntan por facturas, comprobantes de compra/venta, proveedores contables u OPs, respondé: "Esas funciones están disponibles para cuentas contables."

## Ayuda (respondé sin herramientas)
- Saludo → "¡Hola! Soy Neura, tu asistente inmobiliaria. Podés preguntarme por propiedades, contratos, inquilinos, vencimientos, órdenes de trabajo, liquidaciones, expensas o cuentas corrientes. ¿En qué te ayudo?"
- Crear contrato → "Desde Inmobiliaria > Contratos en la plataforma."

## Ejemplos
- "Propiedades disponibles" → buscar_propiedades(estado=disponible)
- "Contratos que vencen pronto" → vencimientos_proximos()
- "Saldo de García" → buscar_inquilino(García) → cuenta_corriente(cliente_id)
- "Órdenes pendientes" → ordenes_trabajo(estado=reportado)
- "Cómo estamos" → resumen_cartera()
- "Quién me debe más" → deudores()
- "Liquidaciones del mes" → buscar_liquidaciones(limit=10)
- "Expensas pendientes" → buscar_expensas(estado=pendiente)
- "Departamentos alquilados" → buscar_propiedades(tipo=departamento, estado=alquilada)`;

  inmoAgent.parameters.options.systemMessage = newInmoPrompt;
}

// Write output
fs.writeFileSync('NCR - Chatbot Neura v3.json', JSON.stringify(wf, null, 2));

// Final stats
const contableTools = Object.entries(wf.connections).filter(([k,v]) => v.ai_tool && v.ai_tool[0]?.some(t => t.node === CONTABLE_AGENT)).map(([k])=>k);
const inmoToolsList = Object.entries(wf.connections).filter(([k,v]) => v.ai_tool && v.ai_tool[0]?.some(t => t.node === INMO_AGENT)).map(([k])=>k);

console.log('\n=== RESULTADO FINAL ===');
console.log('Total nodos:', wf.nodes.length);
console.log('Tools Contable (' + contableTools.length + '):', contableTools.join(', '));
console.log('Tools Inmobiliaria (' + inmoToolsList.length + '):', inmoToolsList.join(', '));
