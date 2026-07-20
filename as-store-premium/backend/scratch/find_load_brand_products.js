import { readFile } from 'node:fs/promises';

async function main() {
  const content = await readFile('../../frontend/src/App.jsx', 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('loadBrandProducts') || line.includes('setSelectedBrand')) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  });
}

main();
