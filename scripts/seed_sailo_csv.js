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
const parseArgNum = s => s ? (parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0) : 0;
const parseDate = s => { if (!s) return null; const p = s.split('/'); return p.length === 3 ? `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}` : null; };
const norm = s => (s || '').trim().toUpperCase().replace(/\s+/g, ' ');

async function main() {
    console.log('🔄 Re-seeding SAILO comprobantes with proper linking...\n');

    // Load lookups – key by UPPER name for case-insensitive matching
    const { data: prods } = await supabase.from('contable_productos_servicio').select('id,nombre,tipo').eq('tenant_id', SAILO_ID);
    const { data: centros } = await supabase.from('contable_centros_costo').select('id,nombre').eq('tenant_id', SAILO_ID);
    const { data: provs } = await supabase.from('contable_proveedores').select('id,razon_social').eq('tenant_id', SAILO_ID);
    const { data: clis } = await supabase.from('contable_clientes').select('id,razon_social').eq('tenant_id', SAILO_ID);

    const mapPC = {}; for (const p of prods || []) if (p.tipo === 'compra') mapPC[norm(p.nombre)] = p.id;
    const mapPV = {}; for (const p of prods || []) if (p.tipo === 'venta') mapPV[norm(p.nombre)] = p.id;
    const mapCC = {}; for (const c of centros || []) mapCC[norm(c.nombre)] = c.id;
    const mapProv = {}; for (const p of provs || []) mapProv[norm(p.razon_social)] = p.id;
    const mapCli = {}; for (const c of clis || []) mapCli[norm(c.razon_social)] = c.id;

    console.log(`Lookups: ${Object.keys(mapPC).length} prodC, ${Object.keys(mapPV).length} prodV, ${Object.keys(mapCC).length} centros, ${Object.keys(mapProv).length} provs, ${Object.keys(mapCli).length} clis`);

    // ── Create missing proveedores from compras CSV ──
    const comprasRows = parseCSV(readFileSync('/Users/martin/Documents/TESORERIA/SAILO/compra/Tabla codigo - compras.xlsx - X-Reporte Analsis fac compra .csv', 'utf-8'));
    const missingProvs = new Set();
    for (let i = 1; i < comprasRows.length; i++) {
        const provName = norm(comprasRows[i][4]);
        if (provName && !mapProv[provName]) missingProvs.add(provName);
    }
    if (missingProvs.size > 0) {
        console.log(`Creating ${missingProvs.size} missing proveedores...`);
        for (const name of missingProvs) {
            const { data, error } = await supabase.from('contable_proveedores')
                .insert({ tenant_id: SAILO_ID, razon_social: name })
                .select('id').single();
            if (data) mapProv[name] = data.id;
            else console.error(`  Error prov "${name}": ${error?.message}`);
        }
    }

    // ── Create missing clientes from ventas CSV ──
    const ventasRows = parseCSV(readFileSync('/Users/martin/Documents/TESORERIA/SAILO/ventas/Tabla codigo - Ventas.xlsx - X-Reporte Analisis venta.csv', 'utf-8'));
    const missingClis = new Set();
    for (let i = 1; i < ventasRows.length; i++) {
        const cliName = norm(ventasRows[i][1]);
        if (cliName && !mapCli[cliName]) missingClis.add(cliName);
    }
    if (missingClis.size > 0) {
        console.log(`Creating ${missingClis.size} missing clientes...`);
        for (const name of missingClis) {
            const { data, error } = await supabase.from('contable_clientes')
                .insert({ tenant_id: SAILO_ID, razon_social: name })
                .select('id').single();
            if (data) mapCli[name] = data.id;
            else console.error(`  Error cli "${name}": ${error?.message}`);
        }
    }

    // ── Create missing products & centros ──
    const missingPC = new Set(), missingPV = new Set(), missingCCSet = new Set();
    for (let i = 1; i < comprasRows.length; i++) {
        const ps = norm(comprasRows[i][3]); const cc = norm(comprasRows[i][7]);
        if (ps && !mapPC[ps]) missingPC.add(ps);
        if (cc && !mapCC[cc]) missingCCSet.add(cc);
    }
    for (let i = 1; i < ventasRows.length; i++) {
        const ps = norm(ventasRows[i][2]); const cc = norm(ventasRows[i][3]);
        if (ps && !mapPV[ps]) missingPV.add(ps);
        if (cc && !mapCC[cc]) missingCCSet.add(cc);
    }
    for (const name of missingPC) {
        const { data } = await supabase.from('contable_productos_servicio')
            .insert({ tenant_id: SAILO_ID, nombre: name, tipo: 'compra', grupo: 'General' }).select('id').single();
        if (data) mapPC[name] = data.id;
    }
    for (const name of missingPV) {
        const { data } = await supabase.from('contable_productos_servicio')
            .insert({ tenant_id: SAILO_ID, nombre: name, tipo: 'venta', grupo: 'General' }).select('id').single();
        if (data) mapPV[name] = data.id;
    }
    for (const name of missingCCSet) {
        const { data } = await supabase.from('contable_centros_costo')
            .insert({ tenant_id: SAILO_ID, nombre: name }).select('id').single();
        if (data) mapCC[name] = data.id;
    }
    console.log(`After creates: ${Object.keys(mapPC).length} prodC, ${Object.keys(mapPV).length} prodV, ${Object.keys(mapCC).length} centros, ${Object.keys(mapProv).length} provs, ${Object.keys(mapCli).length} clis`);

    // ── COMPRAS ──
    let inserted = 0, errors = 0;
    for (let b = 1; b < comprasRows.length; b += 200) {
        const slice = comprasRows.slice(b, b + 200);
        const rows = slice.map(r => {
            const [fecha, , doc, ps, prov, td, desc, cc, obs, mon, , , , impT, impP] = r;
            const provId = mapProv[norm(prov)] || null;
            const prodId = mapPC[norm(ps)] || null;
            const ccId = mapCC[norm(cc)] || null;
            const tipoC = (td || '').toLowerCase().includes('crédito') ? 'Nota de Crédito' : (td || '').toLowerCase().includes('débito') ? 'Nota de Débito' : 'Factura';
            return {
                tenant_id: SAILO_ID, tipo: 'compra',
                fecha: parseDate(fecha) || '2026-01-01',
                numero_comprobante: doc || '',
                tipo_comprobante: tipoC,
                proveedor_id: provId,
                producto_servicio_id: prodId,
                centro_costo_id: ccId,
                descripcion: desc || null,
                observaciones: obs || null,
                moneda: (mon || '').includes('USD') ? 'USD' : 'ARS',
                monto_original: parseArgNum(impP || impT),
                monto_ars: parseArgNum(impP || impT),
                estado: prodId ? 'clasificado' : 'pendiente',
                clasificacion_score: prodId ? 100 : 0
            };
        });
        const { error } = await supabase.from('contable_comprobantes').insert(rows);
        if (error) { console.error(`Compra batch ${b}: ${error.message}`); errors++; }
        else inserted += rows.length;
    }
    console.log(`✓ Compras: ${inserted} inserted, ${errors} errors`);

    // ── VENTAS ──
    inserted = 0; errors = 0;
    for (let b = 1; b < ventasRows.length; b += 200) {
        const slice = ventasRows.slice(b, b + 200);
        const rows = [];
        for (const r of slice) {
            if (r.length < 14) continue;
            const [fecha, cli, ps, cc, comp, td, , desc, obs, mon, , , , , impT, impP] = r;
            const cliId = mapCli[norm(cli)] || null;
            const prodId = mapPV[norm(ps)] || null;
            const ccId = mapCC[norm(cc)] || null;
            const tipoC = (td || '').toLowerCase().includes('crédito') ? 'Nota de Crédito' : (td || '').toLowerCase().includes('débito') ? 'Nota de Débito' : 'Factura';
            rows.push({
                tenant_id: SAILO_ID, tipo: 'venta',
                fecha: parseDate(fecha) || '2026-01-01',
                numero_comprobante: comp || '',
                tipo_comprobante: tipoC,
                cliente_id: cliId,
                producto_servicio_id: prodId,
                centro_costo_id: ccId,
                descripcion: desc || null,
                observaciones: obs || null,
                moneda: (mon || '').includes('USD') ? 'USD' : 'ARS',
                monto_original: parseArgNum(impP || impT),
                monto_ars: parseArgNum(impP || impT),
                estado: prodId && ccId ? 'clasificado' : 'pendiente',
                clasificacion_score: prodId && ccId ? 100 : 0
            });
        }
        const { error } = await supabase.from('contable_comprobantes').insert(rows);
        if (error) { console.error(`Venta batch ${b}: ${error.message}`); errors++; }
        else inserted += rows.length;
    }
    console.log(`✓ Ventas: ${inserted} inserted, ${errors} errors`);

    // ── FINAL STATS ──
    const { count: total } = await supabase.from('contable_comprobantes').select('*', { count: 'exact', head: true }).eq('tenant_id', SAILO_ID);
    const { count: withProd } = await supabase.from('contable_comprobantes').select('*', { count: 'exact', head: true }).eq('tenant_id', SAILO_ID).not('producto_servicio_id', 'is', null);
    const { count: comprasWithProv } = await supabase.from('contable_comprobantes').select('*', { count: 'exact', head: true }).eq('tenant_id', SAILO_ID).eq('tipo', 'compra').not('proveedor_id', 'is', null);
    const { count: ventasWithCli } = await supabase.from('contable_comprobantes').select('*', { count: 'exact', head: true }).eq('tenant_id', SAILO_ID).eq('tipo', 'venta').not('cliente_id', 'is', null);
    const { count: withCC } = await supabase.from('contable_comprobantes').select('*', { count: 'exact', head: true }).eq('tenant_id', SAILO_ID).not('centro_costo_id', 'is', null);

    console.log(`\n══════ RESUMEN FINAL ══════`);
    console.log(`Total comprobantes: ${total}`);
    console.log(`Con producto/servicio: ${withProd} (${Math.round(withProd / total * 100)}%)`);
    console.log(`Compras con proveedor: ${comprasWithProv}`);
    console.log(`Ventas con cliente: ${ventasWithCli}`);
    console.log(`Con centro costo: ${withCC} (${Math.round(withCC / total * 100)}%)`);
    console.log(`\n✅ Done!`);
}

main().catch(console.error);
