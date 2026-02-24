import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testRLS() {
    console.log('Testing RLS rules for Super Admin vs Normal User...');

    // 1. Login as Super Admin (configured earlier)
    const { error: saLoginError } = await supabase.auth.signInWithPassword({
        email: 'neuracallbot@gmail.com',
        password: 'Agenteai2026'
    });
    
    if (saLoginError) {
        console.error('Super Admin Login failed:', saLoginError);
        return;
    }
    
    // 2. Query Tenants as Super Admin
    const { data: saTenants, error: saTenantsError } = await supabase.from('tenants').select('*');
    console.log('--- SUPER ADMIN ---');
    console.log(`Tenants visible: ${saTenants?.length || 0} (Should see all)`);
    if (saTenantsError) console.error('Error fetching tenants:', saTenantsError);
    
    // 3. Login as Normal User (admin@demo.com)
    await supabase.auth.signOut();
    const { error: nuLoginError } = await supabase.auth.signInWithPassword({
        email: 'admin@demo.com',
        password: 'Password123!'
    });
    
    if (nuLoginError) {
        console.error('Normal User Login failed:', nuLoginError);
        return;
    }
    
    // 4. Query Tenants as Normal User
    const { data: nuTenants, error: nuTenantsError } = await supabase.from('tenants').select('*');
    console.log('\n--- NORMAL USER ---');
    console.log(`Tenants visible: ${nuTenants?.length || 0} (Should see 1 - their own)`);
    if (nuTenantsError) console.error('Error fetching tenants:', nuTenantsError);
}

testRLS();
