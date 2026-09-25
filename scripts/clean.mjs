import fs from 'node:fs';

const toDelete = [
    'dist',
    'dist-test'
];

const tsbuildInfoFiles = fs.readdirSync('.', { recursive: true }).filter((file) => file.endsWith('.tsbuildinfo'));

toDelete.push(...tsbuildInfoFiles);

for (const file of toDelete) fs.rmSync(file, { recursive: true, force: true });