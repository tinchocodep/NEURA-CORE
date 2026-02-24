import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function createUser() {
    console.log('Fetching demo tenant...');
    const { data: tenant, error: tErr } = await supabase.from('tenants').select('id').eq('name', 'Empresa Demo S.A.').single();
    if (tErr || !tenant) {
        console.error('Error fetching tenant:', tErr);
        return;
    }

    const email = 'tinchocabrera100@gmail.com';
    const password = 'Password123!';
    
    console.log('Creating user...');
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                tenant_id: tenant.id,
                role: 'admin'
            }
        }
    });
    
    if (error) {
        console.error('Error creating user:', error);
    } else {
        console.log('User created:', data.user?.email);
    }
}
createUser();
