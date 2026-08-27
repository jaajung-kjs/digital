import { describe, it } from 'vitest';
import { powerTree } from '../powerSelectors';
describe('실데이터', () => {
  it('계통시험S/S', async () => {
    const login = await fetch('http://localhost:3000/api/v2/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    }).then((r) => r.json());
    const wc = await fetch('http://localhost:3000/api/v2/substations/e61747a2-0c3f-4839-ae24-d0d9b27616ed/workingcopy', {
      headers: { authorization: `Bearer ${login.accessToken}` },
    }).then((r) => r.json());
    const show = (n: any, d = 0) => {
      const src = n.sources.map((s: any) => s.from ? `${s.from.assetName}#${s.from.portIndex}` : '밖').join(', ');
      console.log(`${'  '.repeat(d)}▸ ${n.containerName ?? '-'} · ${n.name} [입력: ${src}]`);
      for (const c of n.circuits) {
        const load = c.load ? `${c.load.assemblyName ?? ''} ${c.load.assetName}` : '(비어 있음)';
        console.log(`${'  '.repeat(d)}    ${String(c.index).padStart(2)} ${c.closed ? 'ON ' : 'OFF'} ${String(c.values.voltage ?? '').padEnd(8)} ${load}`);
      }
      n.children.forEach((c: any) => show(c, d + 1));
    };
    powerTree(wc.assets, wc.cables).forEach((n) => show(n));
  });
});
