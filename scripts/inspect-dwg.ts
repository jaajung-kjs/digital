import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const wasmDir = path.join(projectRoot, 'node_modules/@mlightcad/libredwg-web/wasm/');

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: tsx scripts/inspect-dwg.ts <dwg-or-dxf-file>...');
  process.exit(1);
}

async function main() {
const libredwg = await LibreDwg.create(wasmDir);

for (const file of targets) {
  const abs = path.resolve(file);
  console.log('\n========================================');
  console.log('FILE:', abs);
  console.log('========================================');

  const buffer = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const fileType = ext === '.dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG;

  const t0 = Date.now();
  const dwg = libredwg.dwg_read_data(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), fileType);
  if (dwg == null) {
    console.error('  parse failed (dwg_read_data returned null)');
    continue;
  }
  const { database: db, stats } = libredwg.convertEx(dwg);
  const tParse = Date.now() - t0;
  console.log(`parsed in ${tParse}ms, unknownEntityCount=${stats.unknownEntityCount}`);

  const layers = db.tables.LAYER?.entries ?? [];
  console.log(`\nLayers (${layers.length}):`);
  for (const layer of layers.slice(0, 60)) {
    const l = layer as { name?: string; isOff?: boolean; isFrozen?: boolean; colorIndex?: number };
    console.log(`  - ${l.name}  off=${l.isOff ?? false} frozen=${l.isFrozen ?? false} color=${l.colorIndex}`);
  }
  if (layers.length > 60) console.log(`  ... ${layers.length - 60} more`);

  const blocks = db.tables.BLOCK_RECORD?.entries ?? [];
  console.log(`\nBlocks (${blocks.length}):`);
  for (const blk of blocks.slice(0, 30)) {
    const b = blk as { name?: string };
    console.log(`  - ${b.name}`);
  }
  if (blocks.length > 30) console.log(`  ... ${blocks.length - 30} more`);

  const entities = db.entities ?? [];
  const byType: Record<string, number> = {};
  const byLayer: Record<string, number> = {};
  for (const e of entities) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    byLayer[e.layer] = (byLayer[e.layer] ?? 0) + 1;
  }
  console.log(`\nEntities total: ${entities.length}`);
  console.log('  by type:');
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${t.padEnd(20)} ${n}`);
  }
  console.log('  top layers by entity count:');
  for (const [l, n] of Object.entries(byLayer).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`    ${l.padEnd(40)} ${n}`);
  }

  const sample = entities.slice(0, 3);
  console.log('\nSample entities (first 3):');
  for (const e of sample) {
    const keys = Object.keys(e).filter((k) => !['xdata', 'proxyEntity'].includes(k));
    const view: Record<string, unknown> = {};
    for (const k of keys) view[k] = (e as unknown as Record<string, unknown>)[k];
    console.log('  -', JSON.stringify(view).slice(0, 300));
  }

  libredwg.dwg_free(dwg);
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
