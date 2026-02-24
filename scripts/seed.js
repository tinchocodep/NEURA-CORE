import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
    console.log('Seeding data...');

    // 1. Create Tenant
    const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
            name: 'Empresa Demo S.A.',
            primary_color: '#8b5cf6', // Violet
            secondary_color: '#4c1d95',
            enabled_modules: ['tesoreria']
        })
        .select()
        .single();

    if (tenantError) {
        console.error('Error creating tenant:', tenantError);
        return;
    }
    console.log('Created tenant:', tenant.name, tenant.id);

    // 2. Sign Up User
    const email = 'admin@demo.com';
    const password = 'Password123!';

    const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                tenant_id: tenant.id,
                role: 'admin'
            }
        }
    });

    if (authError) {
        if (authError.message.includes('already registered')) {
            console.log('User already exists. Skipping auth creation.');
        } else {
            console.error('Error creating user:', authError);
            return;
        }
    } else {
        console.log('Created user:', authData.user?.email);
    }

    console.log('Seed completed successfully!');
    console.log('You can now log in with:');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
}

seed();
