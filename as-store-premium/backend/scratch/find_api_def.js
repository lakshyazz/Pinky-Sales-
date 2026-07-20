import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

async function walk(dir) {
  let files = [];
  const list = await readdir(dir);
  for (const item of list) {
    if (item === 'node_modules' || item === '.git' || item === 'dist') continue;
    const fullPath = path.join(dir, item);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      files = files.concat(await walk(fullPath));
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  const files = await walk('../../frontend/src');
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('const api =') || line.includes('export const api =') || line.includes('function api(')) {
        console.log(`${file} Line ${index + 1}: ${line.trim()}`);
      }
    });
  }
}

main();
