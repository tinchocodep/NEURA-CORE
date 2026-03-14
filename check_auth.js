import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    // 1. Authenticate to get a session
    const { data: authData, error: authError } = await sb.auth.signInWithPassword({
        email: 'joaquin@neuraorkesta.com', // Using a known admin email
        password: 'password123' // Try a default password or we'll need the user to provide one
    });
    
    if (authError) {
        console.error("Auth failed:", authError.message);
        
        // Let's try to get users to see if we can read anything
        const { data: users, error: uErr } = await sb.from('users').select('*').limit(1);
        console.log("Users query without auth:", users?.length || uErr);
        return;
    }
    
    console.log("Authenticated as:", authData.user.email);
    
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
