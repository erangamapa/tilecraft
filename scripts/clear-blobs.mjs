#!/usr/bin/env node
import { list, del } from '@vercel/blob';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Missing BLOB_READ_WRITE_TOKEN. Run: vercel env pull .env.local, then re-run with --env-file=.env.local');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const yes = process.argv.includes('--yes');

async function collectAll() {
  const all = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    all.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

const blobs = await collectAll();
const totalBytes = blobs.reduce((sum, b) => sum + (b.size ?? 0), 0);
const totalMb = (totalBytes / 1024 / 1024).toFixed(2);

console.log(`Found ${blobs.length} blob(s), ${totalMb} MB total.`);
if (blobs.length === 0) process.exit(0);

if (dryRun) {
  for (const b of blobs.slice(0, 20)) console.log(`  - ${b.pathname} (${b.size} bytes)`);
  if (blobs.length > 20) console.log(`  ... and ${blobs.length - 20} more`);
  process.exit(0);
}

if (!yes) {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`Delete all ${blobs.length} blob(s)? Type "DELETE" to confirm: `);
  rl.close();
  if (answer.trim() !== 'DELETE') {
    console.log('Aborted.');
    process.exit(0);
  }
}

const batchSize = 100;
let deleted = 0;
for (let i = 0; i < blobs.length; i += batchSize) {
  const batch = blobs.slice(i, i + batchSize).map((b) => b.url);
  await del(batch);
  deleted += batch.length;
  console.log(`Deleted ${deleted}/${blobs.length}`);
}

console.log(`Done. Freed ${totalMb} MB.`);
