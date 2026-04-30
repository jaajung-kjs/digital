import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmDir = path.join(path.resolve(__dirname, '..'), 'node_modules/@mlightcad/libredwg-web/wasm/');

async function main() {
  const target = process.argv[2];
  if (!target) { console.error('usage: tsx inspect-blocks.ts <file>'); process.exit(1); }
  const lib = await LibreDwg.create(wasmDir);
  const buf = fs.readFileSync(path.resolve(target));
  const dwg = lib.dwg_read_data(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), Dwg_File_Type.DWG);
  if (!dwg) { console.error('parse fail'); process.exit(1); }
  const { database: db } = lib.convertEx(dwg);
  const blocks = (db.tables.BLOCK_RECORD?.entries ?? []) as Array<Record<string, unknown> & { name: string; handle: string; entities?: unknown[] }>;
  console.log(`${blocks.length} blocks. Per-block entity counts:`);
  for (const b of blocks) {
    const ents = (b.entities as Array<{ type: string }> | undefined) ?? [];
    if (ents.length === 0) continue;
    const byType: Record<string, number> = {};
    for (const e of ents) byType[e.type] = (byType[e.type] ?? 0) + 1;
    console.log(`  ${b.name.padEnd(20)} h=${(b.handle as string).padEnd(6)} entities=${ents.length}  types=${Object.entries(byType).map(([t,n])=>`${t}:${n}`).join(' ')}`);
  }
  // sample one INSERT entity from model space
  const inserts = (db.entities as Array<Record<string, unknown> & { type: string }>).filter((e) => e.type === 'INSERT').slice(0, 3);
  console.log('\nSample INSERT entities:');
  for (const ins of inserts) {
    console.log(' ', JSON.stringify(ins).slice(0, 400));
  }
  lib.dwg_free(dwg);
}
main().catch((e) => { console.error(e); process.exit(1); });
