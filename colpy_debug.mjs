import md5 from 'md5';
import fs from 'fs';

const COLPY_ENDPOINT = 'https://login.colppy.com/lib/frontera2/service.php';
const devUser = "bautistadiaz93@gmail.com";
const devPass = "BautistaDiaz2004";

// Replace with actual ones the user might be putting in the UI
const tenantUser = "bautistadiaz93@gmail.com"; 
const tenantPass = "BautistaDiaz2004";

async function login() {
    const payload = {
        "auth": {
            "usuario": devUser,
            "password": md5(devPass)
        },
        "service": {
            "provision": "Usuario",
            "operacion": "iniciar_sesion"
        },
        "parameters": {
            "usuario": tenantUser,
            "password": md5(tenantPass)
        }
    };
    
    fs.writeFileSync("debug_out.txt", "PAYLOAD: " + JSON.stringify(payload) + "\n");

    const response = await fetch(COLPY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const text = await response.text();
    fs.appendFileSync("debug_out.txt", "RESPUESTA:\n" + text);
    try {
        const json = JSON.parse(text);
        if (json.data && json.data.claveSesion) {
            return json.data.claveSesion;
        }
    } catch(e) {}
    return null;
}

async function run() {
    await login();
}
run();
