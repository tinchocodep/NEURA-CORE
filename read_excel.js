import XLSX from 'xlsx';
import fs from 'fs';

const wb = XLSX.readFile('tabla_compras.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const lines = data.map((row, i) => `ROW ${i}: ${JSON.stringify(row)}`).join('\n');
fs.writeFileSync('excel_dump.txt', lines, 'utf8');
console.log(`Written ${data.length} rows. Sheets: ${wb.SheetNames.join(', ')}`);
