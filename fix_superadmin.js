import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// We need the SERVICE ROLE KEY to bypass RLS and create users reliably
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
    console.log('Fixing Super Admin account...');
    
    // Get master tenant ID
    const { data: mt } = await supabase.from('tenants').select('id').eq('name', 'Neuracall Admin').single();
    if (!mt) {
        console.error('Master tenant not found, run setup_superadmin.js first');
        return;
    }
    
    console.log('Master tenant ID:', mt.id);
    
    // We can't easily upsert auth users with anon key if they exist. 
    // Let's try to sign in. If it fails due to invalid credentials, we're stuck unless we have the service role key.
    // However, if we just use signUp it might work if the user wasn't actually created.
    
    const { error: signUpError } = await supabase.auth.signUp({
        email: 'neuracallbot@gmail.com',
        password: 'Agenteai2026',
        options: {
            data: {
                tenant_id: mt.id,
                role: 'superadmin'
            }
        }
    });
    
    console.log('SignUp result:', signUpError ? signUpError.message : 'Success');
    
    // Let's test the login right away
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'neuracallbot@gmail.com',
        password: 'Agenteai2026'
    });
    
    if (loginError) {
        console.error('Login still fails:', loginError.message);
    } else {
        console.log('Login successful! User ID:', loginData.user.id);
        
        // Ensure public user exists
        const { error: upsertError } = await supabase.from('users').upsert({
            id: loginData.user.id,
            tenant_id: mt.id,
            role: 'superadmin',
            status: 'active'
        });
        
        if (upsertError) console.error('Failed to create public user record:', upsertError.message);
        else console.log('Public user record ensured.');
    }
}

fix();
