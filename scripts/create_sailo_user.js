import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const SAILO_TENANT_ID = '9444a5fb-e8ed-4702-ba89-539bee71f4c2';

async function main() {
    console.log('Creating SAILO user...');
    const { data, error } = await supabase.auth.signUp({
        email: 'sailo@soporte.com',
        password: 'Admin123',
        options: {
            data: {
                tenant_id: SAILO_TENANT_ID,
                role: 'admin'
            }
        }
    });

    if (error) {
        console.error('Error creating user:', error);
    } else {
        console.log('User created:', data.user?.email, 'ID:', data.user?.id);
    }
}

main();
