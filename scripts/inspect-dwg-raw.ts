/**
 * Dump every top-level key of the parsed DWG database to verify the WASM
 * library actually exposes Layout/Paperspace info or not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmDir = path.join(path.resolve(__dirname, '..'), 'node_modules/@mlightcad/libredwg-web/wasm/');
const target = process.argv[2];
if (!target) { console.error('Usage: tsx scripts/inspect-dwg-raw.ts <file>'); process.exit(1); }

async function main() {
  const lib = await LibreDwg.create(wasmDir);
  const buf = fs.readFileSync(path.resolve(target));
  const ext = path.extname(target).toLowerCase();
  const dwg = lib.dwg_read_data(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ext === '.dxf' ? Dwg_File_Type.DXF : Dwg_File_Type.DWG);
  if (!dwg) { console.error('parse failed'); process.exit(1); }
  const result = lib.convertEx(dwg);
  const db = result.database as unknown as Record<string, unknown>;
  console.log('database top-level keys:', Object.keys(db));
  for (const k of Object.keys(db)) {
    const v = db[k];
    if (Array.isArray(v)) console.log(`  ${k}: array(${v.length})`);
    else if (v && typeof v === 'object') console.log(`  ${k}: object keys=[${Object.keys(v as Record<string, unknown>).slice(0, 12).join(',')}]`);
    else console.log(`  ${k}: ${JSON.stringify(v)?.slice(0, 80)}`);
  }
  const tables = db.tables as Record<string, unknown> | undefined;
  if (tables) {
    console.log('\ndatabase.tables keys:', Object.keys(tables));
    for (const k of Object.keys(tables)) {
      const t = tables[k] as { entries?: unknown[] } | undefined;
      const n = t?.entries?.length ?? '?';
      console.log(`  tables.${k}: entries=${n}`);
    }
  }
  // Check for any field whose name contains 'layout' or 'paper'
  console.log('\nKeys containing "layout"/"paper" anywhere:');
  function walk(obj: unknown, p: string, depth: number) {
    if (!obj || depth > 4) return;
    if (typeof obj !== 'object') return;
    for (const k of Object.keys(obj as object)) {
      const lower = k.toLowerCase();
      if (lower.includes('layout') || lower.includes('paper') || lower.includes('viewport')) {
        const v = (obj as Record<string, unknown>)[k];
        const vs = Array.isArray(v) ? `array(${v.length})` : (typeof v === 'object' && v ? `object keys=[${Object.keys(v).slice(0,8).join(',')}]` : JSON.stringify(v)?.slice(0, 80));
        console.log(`  ${p}.${k} = ${vs}`);
      }
    }
    for (const k of Object.keys(obj as object)) {
      const v = (obj as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${p}.${k}`, depth + 1);
    }
  }
  walk(db, 'database', 0);
  // Sample one block_record entry to see its structure
  const blockEntries = (tables?.BLOCK_RECORD as { entries?: unknown[] } | undefined)?.entries ?? [];
  console.log('\nFirst BLOCK_RECORD entry full keys:', blockEntries[0] ? Object.keys(blockEntries[0] as object) : 'none');
  console.log('First BLOCK_RECORD entry json (truncated):', JSON.stringify(blockEntries[0]).slice(0, 800));
  lib.dwg_free(dwg);
}
main().catch((e) => { console.error(e); process.exit(1); });
