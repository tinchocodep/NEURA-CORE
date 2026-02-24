import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function fix() {
    const email = 'admin@demo.com';
    const password = 'Password123!';
    
    // 1. Log in to get the auth.user.id
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    
    if (signInError) return;
    
    const userId = authData.user.id;

    // 2. Get the tenant ID
    const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single();
    if (!tenant) return;

    // 3. Insert into public.users
    await supabase.from('users').insert({
        id: userId,
        tenant_id: tenant.id,
        role: 'admin',
        status: 'active'
    });
}
fix();
