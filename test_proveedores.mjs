import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fuytejvnwihghxymyayw.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // I'll pass it via env if it existed, but we don't have it.

const supabase = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY);

async function checkProvs() {
    const { data, error } = await supabase.from('contable_proveedores').select('id, razon_social').limit(5);
    console.log(data, error)
}
checkProvs();
