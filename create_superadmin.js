import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: mt } = await supabase.from('tenants').select('id').eq('name', 'Neuracall Admin').single();
    if (!mt) { console.error('Tenant missing'); return; }

    const { data, error } = await supabase.auth.signUp({
        email: 'neuracallbot@gmail.com',
        password: 'Agenteai2026',
        options: { data: { tenant_id: mt.id, role: 'superadmin' } }
    });
    
    if (error) {
        console.error('SignUp Error:', error.message);
    } else {
        const user = data.user;
        if(user) {
             console.log('User created:', user.id);
             await supabase.from('users').upsert({ id: user.id, email: 'neuracallbot@gmail.com', tenant_id: mt.id, role: 'superadmin', status: 'active' });
        } else {
             console.log('User created but implicit login failed.');
        }
    }
}
run();
