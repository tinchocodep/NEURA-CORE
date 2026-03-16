import fs from 'fs';

async function run() {
    const url = "https://apidocs.colppy.com/api/collections/2675876/T17Dg8xk?environment=2675876-dd6e71f2-8af6-442c-b628-5a27ba1a7dd9&segregateAuth=true&versionTag=latest";
    const resp = await fetch(url);
    const data = await resp.json();

    const ops = new Set();
    function search(obj) { 
        if(obj && obj.request && obj.request.body && obj.request.body.raw) { 
            try { 
                const b = JSON.parse(obj.request.body.raw); 
                if(b.service && b.service.provision && b.service.operacion) { 
                    ops.add(b.service.provision + ' -> ' + b.service.operacion); 
                } 
            }catch(e){} 
        } 
        if(typeof obj === 'object' && obj) { 
            for(let k in obj) search(obj[k]); 
        } 
    }; 
    search(data);
    
    fs.writeFileSync("out_ops.txt", Array.from(ops).join("\n"));
    console.log("Done");
}
run();
