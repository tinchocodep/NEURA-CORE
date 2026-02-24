import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function fix() {
    const email = 'tinchocabrera100@gmail.com';
    const password = 'Mncp060103';
    
    // 1. Log in to get the auth.user.id
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    
    if (signInError) {
        console.error('Login failed:', signInError.message);
        return;
    }
    
    const userId = authData.user.id;
    console.log('User ID:', userId);

    // 2. Get the tenant ID
    const { data: tenant, error: tErr } = await supabase.from('tenants').select('id').limit(1).single();
    if (tErr || !tenant) {
        console.error('Error fetching tenant:', tErr);
        return;
    }

    // 3. Insert into public.users
    const { data, error } = await supabase.from('users').insert({
        id: userId,
        tenant_id: tenant.id,
        role: 'admin',
        status: 'active'
    }).select();

    if (error) {
        if (error.code === '23505') {
            console.log('User profile already exists in public.users');
        } else {
            console.error('Error creating user profile:', error);
        }
    } else {
        console.log('Successfully created public.users profile:', data);
    }
}
fix();
