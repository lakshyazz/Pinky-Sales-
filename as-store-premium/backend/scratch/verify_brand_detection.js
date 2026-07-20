import XLSX from 'xlsx';

const detectBrand = (name, fullModelList, defaultBrand = 'Universal') => {
  const brandVal = String(name || '').trim();
  const modelsVal = String(fullModelList || '').trim();
  const text = `${brandVal} ${modelsVal}`.toLowerCase();

  if (text.includes('oneplus') || text.includes('1+') || text.includes('one plus')) return 'OnePlus';
  if (text.includes('realme') || text.includes('rmx') || text.includes('realm')) return 'Realme';
  if (text.includes('redmi') || text.includes('xiaomi') || /\bmi\b/i.test(text)) return 'Redmi';
  if (text.includes('poco')) return 'Poco';
  if (text.includes('motorola') || text.includes('moto')) return 'Motorola';
  if (text.includes('samsung') || text.includes('galaxy')) return 'Samsung';
  if (text.includes('infinix')) return 'Infinix';
  if (text.includes('iqoo')) return 'IQOO';
  if (text.includes('lava')) return 'Lava';
  if (text.includes('oppo')) return 'Oppo';
  if (text.includes('vivo')) return 'Vivo';
  if (text.includes('tecno')) return 'Tecno';
  if (text.includes('apple') || text.includes('iphone')) return 'Apple';
  if (text.includes('nokia')) return 'Nokia';

  const cleanDefault = String(defaultBrand || '').trim();
  return (cleanDefault === 'Generic' || cleanDefault === '') ? 'Universal' : cleanDefault;
};

function main() {
  try {
    const workbook = XLSX.readFile('../../../WDHD+combo LIST.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    console.log(`Verifying brand detection on ${json.length} rows...`);
    const results = {};
    json.forEach((row, idx) => {
      const nameCandidate = String(row['main modle'] || '').trim();
      const modelsCandidate = String(row['WDHD+ LIST SUPER VERSION'] || '').trim();
      if (!nameCandidate && !modelsCandidate) return;

      const detected = detectBrand(nameCandidate, modelsCandidate, 'Universal');
      results[detected] = (results[detected] || 0) + 1;
      
      if (idx < 15) {
        console.log(`Row ${idx + 1}: Name="${nameCandidate}", Models="${modelsCandidate}" -> Brand: ${detected}`);
      }
    });

    console.log('\nDetection summary:');
    console.log(results);
  } catch (err) {
    console.error(err);
  }
}

main();
