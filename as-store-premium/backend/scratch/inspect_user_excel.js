import XLSX from '../../frontend/node_modules/xlsx/xlsx.js';
import path from 'node:path';

async function main() {
  const excelPath = 'c:/Users/laksh/Downloads/pinky-sales-main/WDHD+combo LIST.xlsx';
  console.log('Reading file:', excelPath);
  try {
    const workbook = XLSX.readFile(excelPath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    console.log('Sheet Name:', sheetName);
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    console.log('Total Rows:', rawRows.length);
    if (rawRows.length > 0) {
      console.log('Headers (First Row Keys):', Object.keys(rawRows[0] || {}));
      console.log('First 5 Rows:');
      console.log(JSON.stringify(rawRows.slice(0, 5), null, 2));
    } else {
      console.log('No rows found!');
    }
  } catch (err) {
    console.error('Error reading Excel:', err);
  }
}

main();
