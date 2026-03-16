import crypto from 'crypto';

function md5(string) {
  return crypto.createHash('md5').update(string).digest('hex');
}

async function testContabilidadDescubrimiento() {
    const usuario = 'bautistadiaz93@gmail.com';
    const clave = 'BautistaDiaz2004';
    const idEmpresa = '46939'; // Assuming one of the valid ids returned successfully in the past

    // 1. Iniciar sesion
    const loginPayload = {
        "1000": {
            "IDM": "1000",
            "modelo": "Usuario",
            "operacion": "iniciar_sesion",
            "parametros": {
                "usuario": usuario,
                "password": md5(clave)
            }
        }
    };

    console.log("Haciendo Login...");
    const loginRes = await fetch('https://login.colppy.com/lib/frontera2/service.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginPayload)
    });
    const loginData = await loginRes.json();
    const claveSesion = loginData["1000"].respuesta.claveSesion;
    console.log("Clave de sesion:", claveSesion);


    // Try operations
    const operationsToTry = [
        "leer_cuentas", 
        "leer_cuentas_contables", 
        "listar_cuentas",
        "obtener_cuentas",
        "leer_arbol",
        "leer_plan_cuentas"
    ];

    for (let op of operationsToTry) {
        console.log(`\nTesting: ${op}`);
        const attemptPayload = {
            "1000": {
                 "IDM": "1000",
                 "modelo": "Contabilidad",
                 "operacion": op,
                 "parametros": {
                      "sesion": {
                           "usuario": usuario,
                           "claveSesion": claveSesion
                      }
                 },
                 "idEmpresa": idEmpresa
            }
        };

        try {
            const attRes = await fetch('https://login.colppy.com/lib/frontera2/service.php', {
                method: 'POST',
                body: JSON.stringify(attemptPayload)
            });
            const attData = await attRes.json();
            const respNode = attData["1000"];
            
            if (respNode && respNode.codigoError) {
                 console.log("Error:", respNode.descripcionError);
            } else {
                 console.log("---- EXITO! La operacion correcta es:", op);
                 return;
            }
        } catch(e) {
            console.log("Fetch failed", e.message);
        }
    }
}

testContabilidadDescubrimiento().then(() => console.log("Done")).catch(console.error);
