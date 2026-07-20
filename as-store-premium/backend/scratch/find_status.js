import { readFile } from 'node:fs/promises';

async function main() {
  const content = await readFile('../server.js', 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('sales') && line.includes('status')) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  });
}

main();
