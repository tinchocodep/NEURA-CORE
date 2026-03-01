import { readFileSync, readdirSync } from 'fs';
import 'dotenv/config';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function execSQL(sql) {
    const res = await fetch(`${URL}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': KEY,
            'Authorization': `Bearer ${KEY}`,
        },
        body: JSON.stringify({ query: sql }),
    });
    return res;
}

// Try using the pg_net approach - execute via Supabase's postgres REST
// Actually we need to use a different approach. Let's use the Supabase management API
// or just output SQL files that can be executed

// The simplest approach: create a Supabase Edge Function that accepts SQL
// Or: use the database URL directly with a pg client

import pg from 'pg';
const { Client } = pg;

async function main() {
    // Connect directly to the database
    const client = new Client({
        connectionString: 'postgresql://postgres.fuytejvnwihghxymyayw:@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
    });

    try {
        await client.connect();
        console.log('Connected to database');
    } catch (e) {
        console.error('Connection failed:', e.message);
        console.log('\nFallback: printing SQL files to execute manually');
        return;
    }

    const files = [
        '/tmp/s_prov.sql',
        '/tmp/s_cli.sql',
        ...readdirSync('/tmp').filter(f => f.startsWith('s_comp_')).sort((a, b) => {
            const na = parseInt(a.match(/\d+/)?.[0] || '0');
            const nb = parseInt(b.match(/\d+/)?.[0] || '0');
            return na - nb;
        }).map(f => `/tmp/${f}`)
    ];

    for (const file of files) {
        const sql = readFileSync(file, 'utf-8').trim();
        if (!sql) continue;
        try {
            await client.query(sql);
            console.log(`✓ ${file}`);
        } catch (e) {
            console.error(`✗ ${file}: ${e.message}`);
        }
    }

    await client.end();
    console.log('\n✅ Done!');
}

main().catch(console.error);
