import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
    console.log('Setting up Super Admin...');
    
    const email = 'neuracallbot@gmail.com';
    const password = 'Agenteai2026';
    
    // 1. Check if user exists, if not create it without a tenant 
    // (superadmins manage tenants, they don't necessarily belong to one initially, 
    // but they need access to all. For data consistency with our schema, 
    // we'll assign them a master tenant or leave tenant_id null).
    
    let tenantId = null;
    
    // Let's create a Master Tenant for Neuracall Administration
    const { data: masterTenant, error: mtError } = await supabase
        .from('tenants')
        .insert({
            name: 'Neuracall Admin',
            primary_color: '#000000',
            secondary_color: '#333333',
            enabled_modules: ['tesoreria', 'crm', 'administracion', 'logistica']
        })
        .select()
        .single();
        
    if (mtError && mtError.code !== '23505') {
       // If it fails, let's try to just fetch it
       const { data: exist } = await supabase.from('tenants').select('*').eq('name', 'Neuracall Admin').single();
       if (exist) tenantId = exist.id;
    } else if (masterTenant) {
       tenantId = masterTenant.id;
    }

    console.log('Master Tenant ID:', tenantId);

    // 2. Sign Up User
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                tenant_id: tenantId,
                role: 'superadmin'
            }
        }
    });

    if (authError && !authError.message.includes('already registered')) {
        console.error('Error creating user auth:', authError);
        return;
    }
    
    // We need the user ID to insert into public.users
    // If it was already registered, auth.signUp doesn't return the ID when implicit login fails
    // Let's login to get it
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    
    if (loginError) {
        console.error('Login failed to get user ID:', loginError);
        return;
    }
    
    const userId = loginData.user.id;

    // 3. Insert into public.users with role 'superadmin'
    const { error: userError } = await supabase.from('users').upsert({
        id: userId,
        tenant_id: tenantId,
        role: 'superadmin',
        status: 'active'
    });
    
    if (userError) {
         console.error('Failed to create public user:', userError);
    } else {
         console.log('Super Admin successfully configured!');
    }
}
setup();
