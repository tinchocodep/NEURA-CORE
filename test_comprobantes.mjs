import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fuytejvnwihghxymyayw.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_KEY_HERE_BUT_WE_WILL_INJECT_IT'; // I'll pass it via CLI

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkComprobantes() {
  const { data, error } = await supabase
    .from('contable_comprobantes')
    .select('id, tipo, estado, proveedor_id, numero_comprobante')
    .limit(10);
    
  if (error) {
    console.error('Error fetching data:', error);
  } else {
    console.log('Comprobantes Data:', data);
  }
}

checkComprobantes();
