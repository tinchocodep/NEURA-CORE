import fs from 'fs';

function run() {
    try {
        const jsonText = fs.readFileSync('empresas.json', 'utf8');
        const data = JSON.parse(jsonText);
        for(let e of data) {
            console.log(`ID: ${e.idEmpresa} - RazonSocial: ${e.RazonSocial}`);
        }
    } catch(e) {
        console.log("Error reading empresas.json", e.message);
        
        try {
            const outTxt = fs.readFileSync('output.txt', 'utf16le');
            const clean = outTxt.replace(/\s+/g,'').replace(/,\]/g,']');
            const json = JSON.parse(clean);
            const data = json.response.data;
            for(let e of data) {
                console.log(`ID: ${e.idEmpresa} - RazonSocial: ${e.RazonSocial}`);
            }
        } catch(e2) {
            console.log("Error reading output.txt", e2.message);
        }
    }
}
run();
