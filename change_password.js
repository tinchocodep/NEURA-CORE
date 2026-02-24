import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function change() {
    console.log('Trying to update password...');
    
    // We can't use admin.updateUserById without service_role key, 
    // but auth.updateUser works for the currently logged in user.
    // So we need to log in first.
    
    const email = 'tinchocabrera100@gmail.com';
    const oldPassword = 'Password123!';
    const newPassword = 'Mncp060103';
    
    // Sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
    });
    
    if (signInError) {
        console.error('Login failed, perhaps password was already changed or user deleted:', signInError.message);
        return;
    }
    
    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
    });
    
    if (updateError) {
        console.error('Failed to change password:', updateError.message);
    } else {
        console.log('Password successfully changed for', email);
    }
}
change();
