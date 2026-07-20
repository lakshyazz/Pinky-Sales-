import XLSX from 'xlsx';

function main() {
  try {
    const workbook = XLSX.readFile('WDHD+combo LIST.xlsx');
    console.log('Sheet Names:', workbook.SheetNames);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    console.log('Total Rows:', json.length);
    if (json.length > 0) {
      console.log('Headers:', Object.keys(json[0]));
      console.log('First 5 rows:');
      console.log(json.slice(0, 5));
    }
  } catch (err) {
    console.error(err);
  }
}

main();
