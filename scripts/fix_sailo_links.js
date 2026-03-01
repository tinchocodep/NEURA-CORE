import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const SAILO_ID = '9444a5fb-e8ed-4702-ba89-539bee71f4c2';

function parseCSV(text) {
    const lines = [];
    let currentLine = '', inQuotes = false;
    for (const ch of text) {
        if (ch === '"') inQuotes = !inQuotes;
        if ((ch === '\n' || ch === '\r') && !inQuotes) { if (currentLine.trim()) lines.push(currentLine); currentLine = ''; }
        else if (ch !== '\r') currentLine += ch;
    }
    if (currentLine.trim()) lines.push(currentLine);
    return lines.map(line => {
        const fields = []; let field = '', inQ = false;
        for (const c of line) { if (c === '"') { inQ = !inQ; continue; } if (c === ',' && !inQ) { fields.push(field.trim()); field = ''; continue; } field += c; }
        fields.push(field.trim()); return fields;
    });
}

async function main() {
    console.log('🔧 Fixing unlinked SAILO data...\n');

    // ── 1. Parse "Tabla codigo" CSV to map proveedor → default producto/servicio ──
    const tablaCodigoRaw = readFileSync('/Users/martin/Documents/TESORERIA/SAILO/Tabla codigo - compras.xlsx - Tabla codigo.csv', 'utf-8');
    const tcRows = parseCSV(tablaCodigoRaw);

    // Build mapping: proveedor → first (default) producto/servicio
    const provDefaultProd = {}; // { provName: firstProductName }
    let currentProv = '';
    for (let i = 3; i < tcRows.length; i++) { // skip header rows
        const [col1, col2] = tcRows[i];
        if (!col1 && !col2) continue;
        if (col1 && col1.startsWith('Total ')) continue;
        if (col1 === 'Suma total') continue;
        if (col1 && col2) {
            currentProv = col1.toUpperCase();
            if (!provDefaultProd[currentProv]) {
                provDefaultProd[currentProv] = col2; // First product as default
            }
        }
    }
    console.log(`Tabla codigo: ${Object.keys(provDefaultProd).length} proveedor→producto mappings found`);

    // ── 2. Get existing productos from DB ──
    const { data: prodCompra } = await supabase.from('contable_productos_servicio')
        .select('id, nombre').eq('tenant_id', SAILO_ID).eq('tipo', 'compra');
    const { data: prodVenta } = await supabase.from('contable_productos_servicio')
        .select('id, nombre').eq('tenant_id', SAILO_ID).eq('tipo', 'venta');
    const { data: centros } = await supabase.from('contable_centros_costo')
        .select('id, nombre').eq('tenant_id', SAILO_ID);

    const mapPC = {}; for (const p of prodCompra || []) mapPC[p.nombre.toLowerCase()] = p.id;
    const mapPV = {}; for (const p of prodVenta || []) mapPV[p.nombre.toLowerCase()] = p.id;
    const mapCC = {}; for (const c of centros || []) mapCC[c.nombre.toLowerCase()] = c.id;

    console.log(`DB products: ${Object.keys(mapPC).length} compra, ${Object.keys(mapPV).length} venta, ${Object.keys(mapCC).length} centros`);

    // ── 3. Find products from CSV that are NOT in DB and create them ──
    const allProdsFromCSV = new Set();
    for (const prodName of Object.values(provDefaultProd)) {
        allProdsFromCSV.add(prodName);
    }
    // Also get from compras CSV rows
    const comprasRaw = readFileSync('/Users/martin/Documents/TESORERIA/SAILO/compra/Tabla codigo - compras.xlsx - X-Reporte Analsis fac compra .csv', 'utf-8');
    const comprasRows = parseCSV(comprasRaw);
    for (let i = 1; i < comprasRows.length; i++) {
        const ps = (comprasRows[i][3] || '').trim();
        if (ps) allProdsFromCSV.add(ps);
    }

    const missingProds = [];
    for (const prodName of allProdsFromCSV) {
        if (!mapPC[prodName.toLowerCase()]) {
            missingProds.push(prodName);
        }
    }
    if (missingProds.length > 0) {
        console.log(`\nCreating ${missingProds.length} missing compra products: ${missingProds.join(', ')}`);
        for (const name of missingProds) {
            const { data, error } = await supabase.from('contable_productos_servicio')
                .insert({ tenant_id: SAILO_ID, nombre: name, tipo: 'compra', grupo: 'General' })
                .select('id').single();
            if (data) mapPC[name.toLowerCase()] = data.id;
            else if (error) console.error(`  Error creating product "${name}": ${error.message}`);
        }
    }

    // Same for venta products
    const ventasRaw = readFileSync('/Users/martin/Documents/TESORERIA/SAILO/ventas/Tabla codigo - Ventas.xlsx - X-Reporte Analisis venta.csv', 'utf-8');
    const ventasRows = parseCSV(ventasRaw);
    const allVentaProds = new Set();
    for (let i = 1; i < ventasRows.length; i++) {
        const ps = (ventasRows[i][2] || '').trim();
        if (ps) allVentaProds.add(ps);
    }
    const missingVentaProds = [];
    for (const prodName of allVentaProds) {
        if (!mapPV[prodName.toLowerCase()]) missingVentaProds.push(prodName);
    }
    if (missingVentaProds.length > 0) {
        console.log(`Creating ${missingVentaProds.length} missing venta products: ${missingVentaProds.join(', ')}`);
        for (const name of missingVentaProds) {
            const { data, error } = await supabase.from('contable_productos_servicio')
                .insert({ tenant_id: SAILO_ID, nombre: name, tipo: 'venta', grupo: 'General' })
                .select('id').single();
            if (data) mapPV[name.toLowerCase()] = data.id;
            else if (error) console.error(`  Error creating venta product "${name}": ${error.message}`);
        }
    }

    // Also create missing centros de costo from CSVs
    const allCentros = new Set();
    for (let i = 1; i < comprasRows.length; i++) {
        const cc = (comprasRows[i][7] || '').trim();
        if (cc) allCentros.add(cc);
    }
    for (let i = 1; i < ventasRows.length; i++) {
        const cc = (ventasRows[i][3] || '').trim();
        if (cc) allCentros.add(cc);
    }
    const missingCentros = [];
    for (const name of allCentros) {
        if (!mapCC[name.toLowerCase()]) missingCentros.push(name);
    }
    if (missingCentros.length > 0) {
        console.log(`Creating ${missingCentros.length} missing centros de costo: ${missingCentros.join(', ')}`);
        for (const name of missingCentros) {
            const { data, error } = await supabase.from('contable_centros_costo')
                .insert({ tenant_id: SAILO_ID, nombre: name })
                .select('id').single();
            if (data) mapCC[name.toLowerCase()] = data.id;
        }
    }

    // ── 4. Update proveedores with default producto/servicio ──
    const { data: proveedores } = await supabase.from('contable_proveedores')
        .select('id, razon_social, producto_servicio_default_id')
        .eq('tenant_id', SAILO_ID);

    let provUpdated = 0;
    for (const prov of proveedores || []) {
        const defaultProdName = provDefaultProd[prov.razon_social.toUpperCase()];
        if (defaultProdName) {
            const prodId = mapPC[defaultProdName.toLowerCase()];
            if (prodId && prodId !== prov.producto_servicio_default_id) {
                const { error } = await supabase.from('contable_proveedores')
                    .update({ producto_servicio_default_id: prodId })
                    .eq('id', prov.id);
                if (!error) provUpdated++;
            }
        }
    }
    console.log(`\n✓ Updated ${provUpdated} proveedores with default producto/servicio`);

    // ── 5. Update comprobantes compra: fill missing producto_servicio_id and centro_costo_id ──
    const { data: compNoPS, error: compError } = await supabase.from('contable_comprobantes')
        .select('id, numero_comprobante, proveedor_id, descripcion')
        .eq('tenant_id', SAILO_ID)
        .eq('tipo', 'compra')
        .is('producto_servicio_id', null);

    console.log(`\nComprobantes compra without producto: ${(compNoPS || []).length}`);

    // Build proveedor_id → razon_social map
    const provById = {};
    for (const p of proveedores || []) provById[p.id] = p.razon_social;

    // For each comprobante without PS, look up the proveedor's default product from Tabla codigo
    let compUpdated = 0;
    for (const comp of compNoPS || []) {
        const provName = provById[comp.proveedor_id]?.toUpperCase();
        if (provName && provDefaultProd[provName]) {
            const prodId = mapPC[provDefaultProd[provName].toLowerCase()];
            if (prodId) {
                const { error } = await supabase.from('contable_comprobantes')
                    .update({ producto_servicio_id: prodId, estado: 'clasificado', clasificacion_score: 80 })
                    .eq('id', comp.id);
                if (!error) compUpdated++;
            }
        }
    }
    console.log(`✓ Updated ${compUpdated} comprobantes compra with producto_servicio`);

    // ── 6. Update comprobantes compra: fill missing centro_costo_id ──
    const { data: compNoCC } = await supabase.from('contable_comprobantes')
        .select('id')
        .eq('tenant_id', SAILO_ID)
        .eq('tipo', 'compra')
        .is('centro_costo_id', null);

    // Default centro for compras is "Proveedor" if it exists
    const centroProv = mapCC['proveedor'];
    if (centroProv && compNoCC?.length) {
        let ccUpdated = 0;
        for (let i = 0; i < compNoCC.length; i += 200) {
            const batch = compNoCC.slice(i, i + 200).map(c => c.id);
            const { error } = await supabase.from('contable_comprobantes')
                .update({ centro_costo_id: centroProv })
                .in('id', batch);
            if (!error) ccUpdated += batch.length;
        }
        console.log(`✓ Updated ${ccUpdated} comprobantes compra with centro_costo "Proveedor"`);
    }

    // ── 7. Update comprobantes venta: fill missing producto_servicio_id ──
    const { data: ventaNoPS } = await supabase.from('contable_comprobantes')
        .select('id, numero_comprobante')
        .eq('tenant_id', SAILO_ID)
        .eq('tipo', 'venta')
        .is('producto_servicio_id', null);
    console.log(`\nComprobantes venta without producto: ${(ventaNoPS || []).length}`);

    // ── 8. Assign segmento to clientes from venta centro_costo ──
    const { data: clientes } = await supabase.from('contable_clientes')
        .select('id, razon_social').eq('tenant_id', SAILO_ID);

    // Derive segmento from their most common centro_costo in ventas
    const clientSegment = {};
    for (let i = 1; i < ventasRows.length; i++) {
        const [, cli, , cc] = ventasRows[i];
        if (cli && cc) {
            const key = cli.trim().toUpperCase();
            if (!clientSegment[key]) clientSegment[key] = {};
            clientSegment[key][cc] = (clientSegment[key][cc] || 0) + 1;
        }
    }

    let cliUpdated = 0;
    for (const client of clientes || []) {
        const segments = clientSegment[client.razon_social.toUpperCase()];
        if (segments) {
            // Pick most common centro_costo as segmento
            const topSegment = Object.entries(segments).sort((a, b) => b[1] - a[1])[0][0];
            const { error } = await supabase.from('contable_clientes')
                .update({ segmento: topSegment })
                .eq('id', client.id);
            if (!error) cliUpdated++;
        }
    }
    console.log(`✓ Updated ${cliUpdated} clientes with segmento`);

    // ── 9. Final stats ──
    const { count: totalComp } = await supabase.from('contable_comprobantes')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', SAILO_ID);
    const { count: linked } = await supabase.from('contable_comprobantes')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', SAILO_ID)
        .not('producto_servicio_id', 'is', null);
    const { count: withProv } = await supabase.from('contable_comprobantes')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', SAILO_ID)
        .eq('tipo', 'compra')
        .not('proveedor_id', 'is', null);
    const { count: withCli } = await supabase.from('contable_comprobantes')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', SAILO_ID)
        .eq('tipo', 'venta')
        .not('cliente_id', 'is', null);

    console.log(`\n══════ RESUMEN FINAL ══════`);
    console.log(`Total comprobantes: ${totalComp}`);
    console.log(`Con producto/servicio: ${linked} (${Math.round(linked / totalComp * 100)}%)`);
    console.log(`Compras con proveedor: ${withProv}`);
    console.log(`Ventas con cliente: ${withCli}`);
    console.log(`\n✅ Fix completo!`);
}

main().catch(console.error);
