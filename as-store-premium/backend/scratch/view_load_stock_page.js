import { readFile } from 'node:fs/promises';

async function main() {
  const content = await readFile('../../frontend/src/App.jsx', 'utf8');
  const lines = content.split('\n');
  let start = -1;
  lines.forEach((line, index) => {
    if (line.includes('const loadStockPage =')) {
      start = index;
    }
  });
  if (start !== -1) {
    for (let i = start; i < start + 40; i++) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  }
}

main();
