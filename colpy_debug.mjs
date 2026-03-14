import md5 from 'md5';
import fs from 'fs';

const COLPY_ENDPOINT = 'https://login.colppy.com/lib/frontera2/service.php';
const devUser = "bautistadiaz93@gmail.com";
const devPass = "BautistaDiaz2004";
const tenantUser = "bautistadiaz93@gmail.com"; 
const tenantPass = "BautistaDiaz2004";

async function run() {
    const loginPayload = {
        "auth": { "usuario": devUser, "password": md5(devPass) },
        "service": { "provision": "Usuario", "operacion": "iniciar_sesion" },
        "parameters": { "usuario": tenantUser, "password": md5(tenantPass) }
    };
    
    let ses = null;
    const resp1 = await fetch(COLPY_ENDPOINT, { method: 'POST', body: JSON.stringify(loginPayload) });
    const authData = await resp1.json();
    if (authData.response && authData.response.data) {
        ses = authData.response.data.claveSesion;
    }

    if(ses) {
        const payload2 = {
            "auth": { "usuario": devUser, "password": md5(devPass) },
            "service": { "provision": "Empresa", "operacion": "listar_empresa" },
            "parameters": {
                "sesion": { "usuario": tenantUser, "claveSesion": ses }
            }
        };

        const resp2 = await fetch(COLPY_ENDPOINT, { method: 'POST', body: JSON.stringify(payload2) });
        const d = await resp2.json(); f.writeFileSync('empresas.json', JSON.stringify(d.response.data));
    }
}
run();
