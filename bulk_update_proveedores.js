import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

// Read the parsed Excel mapping
const mapping = JSON.parse(fs.readFileSync('proveedor_product_mapping.json', 'utf8'));

async function run() {
    // 1. Fetch all proveedores from DB
    const { data: dbProvs, error: e1 } = await supabase
        .from('contable_proveedores')
        .select('id, razon_social, producto_servicio_default_id')
        .eq('activo', true)
        .order('razon_social');
    if (e1) { console.error('Error fetching proveedores:', e1); return; }

    // 2. Fetch all productos_servicio from DB
    const { data: dbProds, error: e2 } = await supabase
        .from('contable_productos_servicio')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
    if (e2) { console.error('Error fetching productos:', e2); return; }

    console.log(`DB proveedores: ${dbProvs.length}`);
    console.log(`DB productos: ${dbProds.length}`);
    console.log(`Excel proveedores: ${mapping.length}`);

    // Show available products in DB
    console.log('\n=== PRODUCTOS IN DB ===');
    dbProds.forEach(p => console.log(`  [${p.id.slice(0, 8)}] ${p.nombre}`));

    // Normalize for matching
    const normalize = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();

    // Build product lookup (nombre → id)
    const prodLookup = {};
    dbProds.forEach(p => {
        prodLookup[normalize(p.nombre)] = p.id;
        prodLookup[p.nombre] = p.id; // exact match too
    });

    // Build proveedor lookup (normalized razon_social → db record)
    const provLookup = {};
    dbProvs.forEach(p => {
        provLookup[normalize(p.razon_social)] = p;
    });

    // Match
    const matched = [];
    const notFoundProv = [];
    const notFoundProd = [];
    const alreadySet = [];
    const updates = [];

    for (const entry of mapping) {
        const excelNorm = normalize(entry.razon_social);
        const dbProv = provLookup[excelNorm];

        if (!dbProv) {
            notFoundProv.push(entry.razon_social);
            continue;
        }

        const defaultProduct = entry.products[0];
        if (!defaultProduct) continue;

        const prodNorm = normalize(defaultProduct);
        const prodId = prodLookup[prodNorm];

        if (!prodId) {
            notFoundProd.push({ prov: entry.razon_social, prod: defaultProduct });
            continue;
        }

        if (dbProv.producto_servicio_default_id === prodId) {
            alreadySet.push({ prov: entry.razon_social, prod: defaultProduct });
            continue;
        }

        matched.push({ prov: entry.razon_social, prod: defaultProduct });
        updates.push({ provId: dbProv.id, prodId, provName: dbProv.razon_social, prodName: defaultProduct });
    }

    // Report
    console.log(`\n=== RESULTS ===`);
    console.log(`✅ Ready to update: ${updates.length}`);
    console.log(`⏭️  Already set correctly: ${alreadySet.length}`);
    console.log(`❌ Proveedor not found in DB: ${notFoundProv.length}`);
    console.log(`❌ Product not found in DB: ${notFoundProd.length}`);

    if (updates.length > 0) {
        console.log('\n=== UPDATES TO APPLY ===');
        updates.forEach((u, i) => console.log(`  ${i + 1}. ${u.provName} → ${u.prodName}`));
    }

    if (notFoundProv.length > 0) {
        console.log('\n=== PROVEEDORES NOT FOUND IN DB ===');
        notFoundProv.forEach(p => console.log(`  ❌ ${p}`));
    }

    if (notFoundProd.length > 0) {
        console.log('\n=== PRODUCTS NOT FOUND IN DB ===');
        notFoundProd.forEach(p => console.log(`  ❌ ${p.prov} needs "${p.prod}"`));
    }

    // DRY RUN - don't actually update yet
    const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--execute');

    if (isDryRun) {
        console.log('\n⚠️  DRY RUN - No changes made. Run with --execute to apply.');
    } else {
        console.log('\n🚀 EXECUTING UPDATES...');
        let ok = 0, fail = 0;
        for (const u of updates) {
            const { error } = await supabase
                .from('contable_proveedores')
                .update({ producto_servicio_default_id: u.prodId })
                .eq('id', u.provId);
            if (error) {
                console.error(`  ❌ Failed: ${u.provName}: ${error.message}`);
                fail++;
            } else {
                ok++;
            }
        }
        console.log(`\n✅ Updated: ${ok} | ❌ Failed: ${fail}`);
    }

    // Save full report
    const report = { updates, alreadySet, notFoundProv, notFoundProd };
    fs.writeFileSync('update_report.json', JSON.stringify(report, null, 2), 'utf8');
    console.log('\nReport saved to update_report.json');
}

run().catch(console.error);
