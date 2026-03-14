import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    console.log("Fetching contable_comprobantes...");
    const { data: comps, error: e1 } = await sb.from('contable_comprobantes').select('*').limit(10);
    if (e1) {
        console.error("Error fetching comps:", e1);
    } else {
        console.log(`Found ${comps.length} comprobantes.`);
        comps.forEach(c => {
            console.log(`ID: ${c.id}, Prov ID: ${c.proveedor_id}, Tipo: "${c.tipo}", Estado: "${c.estado}"`);
        });
    }
}

run();
