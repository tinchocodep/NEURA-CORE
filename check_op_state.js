import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    console.log("Fetching contable_comprobantes...");
    const { data: comps, error: e1 } = await sb.from('contable_comprobantes').select('id, numero_comprobante, estado').limit(50);
    console.log("Comprobantes:", comps?.length || e1);
    
    console.log("Fetching tesoreria_op_comprobantes...");
    const { data: opComps, error: e2 } = await sb.from('tesoreria_op_comprobantes').select('*').limit(50);
    console.log("OP Comprobantes:", opComps?.length || e2);
    
    // Check if there are OP Comps pointing to deleted comps
    if (opComps && comps) {
        const compIds = new Set(comps.map(c => c.id));
        const missing = opComps.filter(oc => !compIds.has(oc.comprobante_id));
        console.log("OP details pointing to MISSING comprobantes:", missing.length);
        if (missing.length > 0) {
           console.log(missing[0]);
        }
    }
}

run();
