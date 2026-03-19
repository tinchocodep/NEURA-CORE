import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://fuytejvnwihghxymyayw.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1eXRlanZud2loZ2h4eW15YXl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjE0MzEsImV4cCI6MjA4NzEzNzQzMX0.DpQeHA--4qG8hjudz4fMBhnYwlpKcsZ7wuKgTzxpKsw'
);

async function setup() {
    // 1. Create tenant
    console.log('Creating tenant "Automotores Alcorta"...');
    const { data: tenant, error: tErr } = await supabase.from('tenants').insert({
        name: 'Automotores Alcorta',
        enabled_modules: ['comercial'],
        razon_social: 'Automotores Alcorta S.A.',
        email: 'automotoresalcorta@gmail.com',
    }).select('id').single();

    if (tErr) {
        console.error('Error creating tenant:', tErr);
        return;
    }
    console.log('Tenant created:', tenant.id);

    // 2. Create auth user
    const email = 'automotoresalcorta@gmail.com';
    const password = 'auto123';

    console.log('Creating auth user...');
    const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                tenant_id: tenant.id,
                role: 'admin'
            }
        }
    });

    if (authErr) {
        console.error('Error creating auth user:', authErr);
        return;
    }
    console.log('Auth user created:', authData.user?.id);

    // 3. Upsert user record in users table
    const userId = authData.user?.id;
    if (userId) {
        const { error: uErr } = await supabase.from('users').upsert({
            id: userId,
            email,
            role: 'admin',
            status: 'active',
            tenant_id: tenant.id,
            display_name: 'Juan Dinardi',
            enabled_modules: ['comercial'],
        });
        if (uErr) {
            console.error('Error upserting user record:', uErr);
        } else {
            console.log('User record created/updated.');
        }
    }

    // 4. Seed default pipeline stages
    console.log('Seeding pipeline stages...');
    const stages = [
        { nombre: 'Nuevo', color: '#3B82F6', orden: 1, es_final: false, descripcion: 'Leads recién ingresados, sin contactar' },
        { nombre: 'Contactado', color: '#0D9488', orden: 2, es_final: false, descripcion: 'Ya se les respondió al menos una vez' },
        { nombre: 'En negociación', color: '#E8963E', orden: 3, es_final: false, descripcion: 'Hay interés concreto, se está trabajando una propuesta' },
        { nombre: 'Cerrado ganado', color: '#10B981', orden: 4, es_final: true, descripcion: 'Operación concretada' },
        { nombre: 'Cerrado perdido', color: '#EF4444', orden: 5, es_final: true, descripcion: 'No se concretó la venta' },
    ];
    const { error: sErr } = await supabase.from('comercial_pipeline_stages').insert(
        stages.map(s => ({ ...s, tenant_id: tenant.id }))
    );
    if (sErr) console.error('Error seeding stages:', sErr);
    else console.log('Stages seeded.');

    // 5. Seed sources
    console.log('Seeding sources...');
    const sources = [
        { nombre: 'Instagram', icono: 'instagram' },
        { nombre: 'Mercado Libre', icono: 'shopping-cart' },
        { nombre: 'Web propia', icono: 'globe' },
        { nombre: 'WhatsApp', icono: 'message-circle' },
        { nombre: 'Referido', icono: 'users' },
        { nombre: 'Llamada entrante', icono: 'phone-incoming' },
        { nombre: 'Visita espontánea', icono: 'map-pin' },
    ];
    const { error: srcErr } = await supabase.from('comercial_sources').insert(
        sources.map(s => ({ ...s, tenant_id: tenant.id, activa: true }))
    );
    if (srcErr) console.error('Error seeding sources:', srcErr);
    else console.log('Sources seeded.');

    // 6. Fetch created stages and sources for FK references
    const { data: dbStages } = await supabase.from('comercial_pipeline_stages')
        .select('id, nombre').eq('tenant_id', tenant.id).order('orden');
    const { data: dbSources } = await supabase.from('comercial_sources')
        .select('id, nombre').eq('tenant_id', tenant.id);

    const stageMap = {};
    (dbStages || []).forEach(s => stageMap[s.nombre] = s.id);
    const sourceMap = {};
    (dbSources || []).forEach(s => sourceMap[s.nombre] = s.id);

    // 7. Seed sample contacts
    console.log('Seeding contacts...');
    const contacts = [
        { nombre: 'Roberto', apellido: 'Méndez', telefono: '+54 11 5555-4321', email: 'r.mendez@email.com', vehiculo_interes: 'Toyota Hilux SRV 2020', presupuesto_min: 17000000, presupuesto_max: 20000000, fuente_id: sourceMap['Instagram'], fuente_detalle: 'Publicación Hilux', etapa_id: stageMap['En negociación'], prioridad: 'alta', fecha_primer_contacto: '2026-03-12' },
        { nombre: 'Lucía', apellido: 'Fernández', telefono: '+54 11 4444-8765', email: 'lucia.f@email.com', vehiculo_interes: 'Ford Ranger XLT 2021', presupuesto_min: 22000000, presupuesto_max: 25000000, fuente_id: sourceMap['Mercado Libre'], fuente_detalle: 'Publicación Ranger', etapa_id: stageMap['Contactado'], prioridad: 'media', fecha_primer_contacto: '2026-03-14' },
        { nombre: 'Martín', apellido: 'García', telefono: '+54 11 3333-1234', email: 'martin.g@email.com', vehiculo_interes: 'Volkswagen Amarok V6 2022', presupuesto_min: 28000000, presupuesto_max: 32000000, fuente_id: sourceMap['Web propia'], etapa_id: stageMap['Nuevo'], prioridad: 'media', fecha_primer_contacto: '2026-03-18' },
        { nombre: 'Carolina', apellido: 'López', telefono: '+54 11 2222-5678', email: 'caro.lopez@email.com', vehiculo_interes: 'Toyota Corolla Cross 2023', presupuesto_min: 19000000, presupuesto_max: 22000000, fuente_id: sourceMap['WhatsApp'], etapa_id: stageMap['Nuevo'], prioridad: 'baja', fecha_primer_contacto: '2026-03-17' },
        { nombre: 'Diego', apellido: 'Romero', telefono: '+54 11 6666-9012', email: 'dromero@email.com', vehiculo_interes: 'Chevrolet S10 High Country 2021', presupuesto_min: 24000000, presupuesto_max: 27000000, fuente_id: sourceMap['Referido'], fuente_detalle: 'Referido por cliente anterior', etapa_id: stageMap['En negociación'], prioridad: 'alta', fecha_primer_contacto: '2026-03-10' },
        { nombre: 'Valentina', apellido: 'Sosa', telefono: '+54 11 7777-3456', email: 'val.sosa@email.com', vehiculo_interes: 'Fiat Cronos 2024', presupuesto_min: 12000000, presupuesto_max: 14000000, fuente_id: sourceMap['Instagram'], fuente_detalle: 'Story destacada', etapa_id: stageMap['Contactado'], prioridad: 'media', fecha_primer_contacto: '2026-03-15' },
        { nombre: 'Andrés', apellido: 'Molina', telefono: '+54 11 8888-7890', email: 'a.molina@email.com', vehiculo_interes: 'Toyota Hilux SRX 2023', presupuesto_min: 30000000, presupuesto_max: 35000000, fuente_id: sourceMap['Llamada entrante'], etapa_id: stageMap['Cerrado ganado'], prioridad: 'alta', monto_cierre: 32500000, fecha_primer_contacto: '2026-03-01' },
        { nombre: 'Florencia', apellido: 'Ruiz', telefono: '+54 11 9999-2345', email: 'flo.ruiz@email.com', vehiculo_interes: 'Jeep Compass 2022', presupuesto_min: 26000000, presupuesto_max: 29000000, fuente_id: sourceMap['Mercado Libre'], fuente_detalle: 'Publicación Compass', etapa_id: stageMap['Cerrado perdido'], prioridad: 'media', motivo_perdida: 'Eligió otra agencia', fecha_primer_contacto: '2026-03-05' },
    ];

    const { data: insertedContacts, error: cErr } = await supabase.from('comercial_contacts').insert(
        contacts.map(c => ({
            ...c,
            tenant_id: tenant.id,
            vendedor_id: userId,
        }))
    ).select('id, nombre');
    if (cErr) console.error('Error seeding contacts:', cErr);
    else console.log('Contacts seeded:', insertedContacts?.length);

    // 8. Seed sample interactions
    if (insertedContacts && insertedContacts.length > 0) {
        console.log('Seeding interactions...');
        const roberto = insertedContacts.find(c => c.nombre === 'Roberto');
        const lucia = insertedContacts.find(c => c.nombre === 'Lucía');
        const martin = insertedContacts.find(c => c.nombre === 'Martín');
        const diego = insertedContacts.find(c => c.nombre === 'Diego');

        const interactions = [];
        if (roberto) {
            interactions.push(
                { contact_id: roberto.id, tipo: 'mensaje_entrante', descripcion: 'Consultó por Instagram: "¿Está disponible la Hilux SRV 2020?"', created_at: '2026-03-12T10:15:00-03:00' },
                { contact_id: roberto.id, tipo: 'respuesta_enviada', descripcion: 'Se envió info completa + 8 fotos del vehículo por DM de Instagram', created_at: '2026-03-12T10:23:00-03:00' },
                { contact_id: roberto.id, tipo: 'llamada', descripcion: 'Interesado, preguntó por financiación. Quiere venir a ver el auto el sábado.', created_at: '2026-03-13T14:00:00-03:00' },
                { contact_id: roberto.id, tipo: 'visita', descripcion: 'Vino con su esposa. Revisaron el vehículo. Pidieron tiempo para pensar.', created_at: '2026-03-14T11:30:00-03:00' },
                { contact_id: roberto.id, tipo: 'mensaje_entrante', descripcion: 'Envió contraoferta: $17.500.000', created_at: '2026-03-15T09:00:00-03:00' },
                { contact_id: roberto.id, tipo: 'respuesta_enviada', descripcion: 'Se envió propuesta final: $18.200.000 con garantía incluida', created_at: '2026-03-16T10:00:00-03:00' },
                { contact_id: roberto.id, tipo: 'recordatorio', descripcion: 'Seguimiento pendiente — sin respuesta hace 3 días', created_at: '2026-03-19T09:00:00-03:00' },
            );
        }
        if (lucia) {
            interactions.push(
                { contact_id: lucia.id, tipo: 'mensaje_entrante', descripcion: 'Consulta por Mercado Libre sobre Ford Ranger XLT', created_at: '2026-03-14T16:30:00-03:00' },
                { contact_id: lucia.id, tipo: 'respuesta_enviada', descripcion: 'Enviada info + detalles de financiación disponible', created_at: '2026-03-14T16:45:00-03:00' },
                { contact_id: lucia.id, tipo: 'llamada', descripcion: 'Pidió coordinar visita, interesada en ver la camioneta en persona', created_at: '2026-03-16T11:00:00-03:00' },
            );
        }
        if (martin) {
            interactions.push(
                { contact_id: martin.id, tipo: 'mensaje_entrante', descripcion: 'Consulta por formulario web sobre Amarok V6', created_at: '2026-03-18T09:00:00-03:00' },
            );
        }
        if (diego) {
            interactions.push(
                { contact_id: diego.id, tipo: 'mensaje_entrante', descripcion: 'Referido por cliente anterior. Interesado en S10 High Country.', created_at: '2026-03-10T15:00:00-03:00' },
                { contact_id: diego.id, tipo: 'respuesta_enviada', descripcion: 'Enviada info completa y propuesta inicial', created_at: '2026-03-10T15:20:00-03:00' },
                { contact_id: diego.id, tipo: 'visita', descripcion: 'Visitó el showroom, probó la camioneta. Muy interesado.', created_at: '2026-03-12T10:00:00-03:00' },
                { contact_id: diego.id, tipo: 'llamada', descripcion: 'Negociando precio final. Pidió incluir accesorios.', created_at: '2026-03-15T14:00:00-03:00' },
            );
        }

        const { error: iErr } = await supabase.from('comercial_interactions').insert(
            interactions.map(i => ({ ...i, tenant_id: tenant.id, registrado_por: userId }))
        );
        if (iErr) console.error('Error seeding interactions:', iErr);
        else console.log('Interactions seeded:', interactions.length);

        // 9. Seed reminders
        if (roberto) {
            const { error: rErr } = await supabase.from('comercial_reminders').insert([
                { tenant_id: tenant.id, contact_id: roberto.id, fecha: '2026-03-19T10:00:00-03:00', nota: 'Llamar a Roberto — esperando respuesta a propuesta final', creado_por: userId },
                { tenant_id: tenant.id, contact_id: diego?.id || roberto.id, fecha: '2026-03-20T09:00:00-03:00', nota: 'Seguimiento Diego — cerrar negociación accesorios', creado_por: userId },
            ]);
            if (rErr) console.error('Error seeding reminders:', rErr);
            else console.log('Reminders seeded.');
        }
    }

    // 10. Seed templates
    console.log('Seeding templates...');
    const { error: tmplErr } = await supabase.from('comercial_templates').insert([
        { tenant_id: tenant.id, nombre: 'Saludo inicial', contenido: 'Hola {nombre}, gracias por contactarnos en Automotores Alcorta. Vi tu interés en {vehiculo}. ¿Te gustaría coordinar una visita para verlo en persona?' },
        { tenant_id: tenant.id, nombre: 'Envío de información', contenido: 'Hola {nombre}, te paso la info completa del {vehiculo}. Precio de lista: {precio}. Tenemos opciones de financiación disponibles. ¿Te interesa que veamos los detalles?' },
        { tenant_id: tenant.id, nombre: 'Seguimiento a 48hs', contenido: 'Hola {nombre}, ¿cómo estás? Te escribo para saber si pudiste evaluar la propuesta del {vehiculo}. Quedo a disposición para cualquier consulta.' },
        { tenant_id: tenant.id, nombre: 'Propuesta de precio', contenido: 'Hola {nombre}, preparé una propuesta especial para vos por el {vehiculo}: {precio} con garantía extendida incluida. Esta oferta es válida hasta fin de mes.' },
    ]);
    if (tmplErr) console.error('Error seeding templates:', tmplErr);
    else console.log('Templates seeded.');

    console.log('\n✅ Setup completo para Automotores Alcorta!');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('   Tenant ID:', tenant.id);
}

setup().catch(console.error);
