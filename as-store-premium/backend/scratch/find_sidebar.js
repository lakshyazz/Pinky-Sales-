import { readFile } from 'node:fs/promises';

async function main() {
  const content = await readFile('../../frontend/src/App.jsx', 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('label:') || line.includes('role') && (line.includes('sidebar') || line.includes('menu') || line.includes('navigation'))) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  });
}

main();
