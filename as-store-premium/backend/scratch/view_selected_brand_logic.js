import { readFile } from 'node:fs/promises';

async function main() {
  const content = await readFile('../../frontend/src/App.jsx', 'utf8');
  const lines = content.split('\n');
  for (let i = 1220; i < 1260; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

main();
