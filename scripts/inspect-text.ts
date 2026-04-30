import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmDir = path.join(path.resolve(__dirname, '..'), 'node_modules/@mlightcad/libredwg-web/wasm/');

async function main() {
  const target = process.argv[2];
  if (!target) { console.error('usage'); process.exit(1); }
  const lib = await LibreDwg.create(wasmDir);
  const buf = fs.readFileSync(path.resolve(target));
  const dwg = lib.dwg_read_data(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), Dwg_File_Type.DWG);
  if (!dwg) { console.error('parse fail'); process.exit(1); }
  const { database: db } = lib.convertEx(dwg);
  const ents = db.entities as Array<Record<string, unknown> & { type: string }>;
  const texts = ents.filter((e) => e.type === 'TEXT' || e.type === 'MTEXT').slice(0, 3);
  console.log(`Total TEXT/MTEXT in db.entities: ${ents.filter(e => e.type==='TEXT'||e.type==='MTEXT').length}`);
  console.log(`First 3 TEXT/MTEXT entities (full keys):`);
  for (const t of texts) {
    console.log(`\n  type=${t.type}  keys: ${Object.keys(t).join(', ')}`);
    console.log('  json:', JSON.stringify(t).slice(0, 500));
  }
  // Also check text inside blocks
  const blocks = (db.tables.BLOCK_RECORD?.entries ?? []) as Array<{ name: string; entities?: Array<Record<string, unknown> & { type: string }> }>;
  console.log('\nBlocks containing TEXT/MTEXT:');
  let blockTexts = 0;
  for (const b of blocks) {
    const ts = (b.entities ?? []).filter((e) => e.type === 'TEXT' || e.type === 'MTEXT');
    if (ts.length > 0) {
      blockTexts += ts.length;
      console.log(`  ${b.name}: ${ts.length}`);
    }
  }
  console.log(`Total TEXT/MTEXT inside blocks: ${blockTexts}`);
  lib.dwg_free(dwg);
}
main().catch((e) => { console.error(e); process.exit(1); });
