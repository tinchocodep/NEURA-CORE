import { ColpyService } from './src/services/ColpyService';
import { supabase } from './src/lib/supabase';

async function runTest() {
    console.log("Iniciando prueba de lectura del Arbol Contable de Colppy...");
    
    // Buscar la configuración del primer tenant que tenga Colppy configurado
    const { data: config, error } = await supabase
        .from('contable_config')
        .select('*')
        .not('colpy_username', 'is', null)
        .limit(1)
        .single();
    
    if (error || !config) {
        console.error("No se encontró configuración de Colppy en la Base de Datos.");
        return;
    }

    console.log(`Configuración encontrada para Tenant ID: ${config.tenant_id}`);
    const colpy = new ColpyService(config.tenant_id);
    
    // Cargamos usuario, pass y la empresa elegida
    await colpy.loadConfig();

    try {
        console.log(`Consultando el árbol de cuentas para la Empresa ID: ${colpy.getEmpresaId()}`);
        const arbol = await colpy.getArbolContable();
        console.log("\n====== RESULTADO DE CUENTAS ======");
        console.log(JSON.stringify(arbol, null, 2));
        console.log("==================================\n");
        console.log("✅ Prueba finalizada con éxito.");
    } catch (e) {
        console.error("❌ Error en la prueba:", e);
    }
}

runTest();
