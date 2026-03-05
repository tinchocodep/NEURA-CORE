import XLSX from 'xlsx';
import fs from 'fs';

const wb = XLSX.readFile('tabla_compras.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Parse proveedor → products structure
// Pattern: proveedor name (identifier) followed by product lines
const mapping = [];
let currentProv = null;

for (let i = 0; i < data.length; i++) {
    const val = (data[i][0] || '').toString().trim();
    if (!val || val === 'Etiquetas de fila' || val === 'Total general' || val === '(en blanco)') continue;

    // Heuristic: proveedor names are typically ALL-CAPS or mixed case with company suffixes
    // products tend to be descriptive phrases (Honorarios, Sueldos, Producto, etc.)
    const knownProductPrefixes = [
        'Honorarios', 'Sueldos', 'Producto', 'Sueldo', 'Alquiler', 'Alojamiento',
        'Marketing', 'Gastos', 'Servicio', 'Licencia', 'Campaña', 'Comisiones',
        'Desarrollo', 'Gasto', 'Impuesto', 'Intereses', 'Medicina', 'Telefonia',
        'Gastos bono', 'Gastos Bancarios'
    ];

    const isProduct = knownProductPrefixes.some(p => val.startsWith(p));

    if (!isProduct) {
        // This is a proveedor
        currentProv = { razon_social: val, products: [] };
        mapping.push(currentProv);
    } else if (currentProv) {
        currentProv.products.push(val);
    }
}

// Output: proveedor → first product (default)
console.log(`\n=== PROVEEDORES PARSED: ${mapping.length} ===\n`);

// Get unique product names
const uniqueProducts = [...new Set(mapping.flatMap(m => m.products))].sort();
console.log(`=== UNIQUE PRODUCTS (${uniqueProducts.length}): ===`);
uniqueProducts.forEach(p => console.log(`  - ${p}`));

console.log(`\n=== MAPPING (proveedor → first product as default): ===`);
mapping.forEach(m => {
    console.log(`${m.razon_social} → ${m.products[0] || 'NO PRODUCT'} ${m.products.length > 1 ? `(+${m.products.length - 1} more)` : ''}`);
});

// Write as JSON for further processing
fs.writeFileSync('proveedor_product_mapping.json', JSON.stringify(mapping, null, 2), 'utf8');
console.log('\nSaved to proveedor_product_mapping.json');
