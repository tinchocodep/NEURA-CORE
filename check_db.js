require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('contable_comprobantes')
    .select('id, tipo, estado, proveedor:contable_proveedores(razon_social)')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) console.error(error);
  else console.table(data.map(d => ({
    tipo: d.tipo,
    estado: d.estado,
    proveedor: d.proveedor?.razon_social
  })));
}
check();
