import { readFile } from 'node:fs/promises';

async function main() {
  const content = await readFile('../../frontend/src/App.jsx', 'utf8');
  const lines = content.split('\n');
  for (let i = 1200; i < 1225; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

main();
