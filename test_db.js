import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://fuytejvnwihghxymyayw.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1eXRlanZud2loZ2h4eW15YXl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjE0MzEsImV4cCI6MjA4NzEzNzQzMX0.DpQeHA--4qG8hjudz4fMBhnYwlpKcsZ7wuKgTzxpKsw');
async function test() {
  const { data, error } = await supabase.from('companies').select('name').limit(1);
  console.log('companies:', data, error);
}
test();
