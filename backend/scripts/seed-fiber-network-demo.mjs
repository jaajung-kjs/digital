/**
 * 시험용 **광 링 + 네트워크 거미줄** — 추적이 국(局)을 넘어가는지, 거미줄에서 무엇을 말하는지.
 *
 * 두 가지를 한꺼번에 만든다.
 *
 * **① 광 링 — 네 국을 OPGW 로 두른다.**
 *   광링A ─ 광링B ─ 광링C ─ 광링D ─ (다시 광링A)
 *   국마다 OFD(광분배함, 슬롯 4)를 놓고 이웃 두 국과 OPGW 한 가닥씩 잇는다. 24심 인입은
 *   포트 **하나**이고 그 안의 코어가 앞면 24구로 갈라진다(`derivedLinks` 의 byPosition) —
 *   그래서 「내 장비의 광 1번」에서 추적을 걸면 앞면 1번 → 인입 코어 1 → 이웃 국 인입 코어 1
 *   → 그 국 앞면 1번 → 그 국 장비까지 **국을 넘어** 이어진다. 그 길이 실제로 이어지는지를
 *   눈으로 보려고 만든다.
 *
 * **② 네트워크 거미줄 — 한 국 안에서 여러 갈래로 얽는다.**
 *   스위치 둘을 서로 이중으로 잇고(A↔B 두 가닥), 거기에 장비 여럿을 매단다. 네트워크는
 *   **방향도 내부 통과도 없는 종류**라(`pairing: 'any'`), 추적이 어디까지 가는지가 전원·광과
 *   다르다 — 그 차이를 실제 자료로 확인하려는 것이다.
 *
 *   node backend/scripts/seed-fiber-network-demo.mjs [--url http://localhost:3000]
 *   node backend/scripts/seed-fiber-network-demo.mjs --clean   # 만든 변전소 넷을 지운다
 */

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const API = `${arg('url', 'http://localhost:3000')}/api/v2`;

/** 링을 이루는 국들 — 차례대로 이웃과 잇고 마지막이 처음으로 돌아온다. */
const RING = ['광링A S/S', '광링B S/S', '광링C S/S', '광링D S/S'];
/** 국마다 앞면에서 장비로 뽑아 쓰는 심선 수 — 24심을 다 쓰지는 않는다(실물도 그렇다). */
const USED_CORES = 2;

let tok;
async function call(path, method = 'GET', body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${tok}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

tok = await (async () => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: arg('user', 'admin'), password: arg('pass', 'admin123') }),
  });
  if (!r.ok) throw new Error(`로그인 실패 ${r.status}`);
  return (await r.json()).accessToken;
})();

const orgTree = await call('/org-tree');
const allSubs = orgTree.headquarters.flatMap((h) => h.branches).flatMap((b) => b.substations);
const branch = orgTree.headquarters.flatMap((h) => h.branches)[0];
if (!branch) throw new Error('지사가 없습니다 — 조직을 먼저 만드세요');

if (has('clean')) {
  /* 케이블 → 자산 → 층 → 변전소 순서로 걷는다. 하나라도 남아 있으면 변전소 삭제가 막힌다.
     국을 넘는 케이블은 **양쪽 어디서 지워도** 같은 한 가닥이라, 먼저 만난 국에서 지워진다. */
  for (const name of RING) {
    const sub = allSubs.find((x) => x.name === name);
    if (!sub) continue;
    const wc = await call(`/substations/${sub.id}/workingcopy`);
    const baseVersions = Object.fromEntries([...wc.cables, ...wc.assets].map((r) => [r.id, r.updatedAt]));
    if (wc.cables.length) {
      await call(`/substations/${sub.id}/commit`, 'PUT', { cables: { deletes: wc.cables.map((c) => c.id) }, baseVersions });
    }
    if (wc.assets.length) {
      const depth = (a) => (a.parentAssetId ? 1 : 0);
      const ids = [...wc.assets].sort((a, b) => depth(b) - depth(a)).map((a) => a.id);
      await call(`/substations/${sub.id}/commit`, 'PUT', { assets: { deletes: ids }, baseVersions });
    }
    if (wc.floors.length) {
      await call(`/substations/${sub.id}/commit`, 'PUT', {
        floors: { deletes: wc.floors.map((f) => f.id) },
        baseVersions: Object.fromEntries(wc.floors.map((f) => [f.id, f.updatedAt])),
      });
    }
    await call(`/org/substations/${sub.id}`, 'DELETE');
    console.log(`[seed-ring] ${name} 지움`);
  }
  process.exit(0);
}

const catalog = await call('/catalog');
const typeById = Object.fromEntries(catalog.types.map((t) => [t.id, t]));
const assemblyByName = Object.fromEntries(catalog.assemblies.map((a) => [a.name, a]));
const ofdAssembly = assemblyByName['OFD(광분배함)'];
const termAssembly = assemblyByName['송변전광단말장치'];
if (!ofdAssembly || !termAssembly) throw new Error('OFD·송변전광단말장치 설비 품목이 필요합니다');

/** 광 케이블 종류 — 이름이 아니라 **매체가 광인 그룹**에서 고른다. */
const fiberGroup = catalog.cableGroups.find((g) => g.key === 'fiber');
const netGroup = catalog.cableGroups.find((g) => g.key === 'network');
const OPGW = fiberGroup.categories.find((c) => /OPGW/i.test(c.name))?.id ?? fiberGroup.categories[0].id;
const JUMPER = fiberGroup.categories.find((c) => /점퍼|jumper/i.test(c.name))?.id ?? fiberGroup.categories[0].id;
const UTP = netGroup.categories[0].id;

/** 설비 품목 하나를 펴서 설비 + 부품 — 포트 id 를 여기서 붙인다(화면이 하는 그대로). */
function place(assembly, name, floorId, x, y) {
  const equipmentId = crypto.randomUUID();
  const creates = [{ id: equipmentId, name, assemblyId: assembly.id, floorId, x, y, width: 70, height: 70 }];
  /** `부품이름|그룹|번호` → 포트 id */
  const ports = new Map();
  for (const item of assembly.items) {
    const templates = [...typeById[item.typeId].portTemplates].sort((a, b) => a.sortOrder - b.sortOrder);
    const portIds = {};
    for (const tpl of templates) {
      const count = item.portCounts?.[tpl.group] ?? tpl.count;
      for (let i = 1; i <= count; i++) {
        const id = crypto.randomUUID();
        portIds[`${tpl.group}:${i}`] = id;
        ports.set(`${item.name}|${tpl.group}|${i}`, id);
      }
    }
    creates.push({
      id: crypto.randomUUID(), name: item.name, typeId: item.typeId, parentAssetId: equipmentId,
      assemblyItemId: item.id,
      col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan,
      portIds,
      ...(item.portCounts ? { portCounts: item.portCounts } : {}),
      ...(item.portPositions ? { portPositions: item.portPositions } : {}),
    });
  }
  return { creates, ports, id: equipmentId };
}

const at = (placed, part, group, i = 1) => {
  const id = placed.ports.get(`${part}|${group}|${i}`);
  if (!id) throw new Error(`포트를 찾을 수 없습니다: ${part} ${group} ${i}`);
  return id;
};

// ── 국을 만든다 ─────────────────────────────────────────────────────────────
const sites = [];
for (const name of RING) {
  const existing = allSubs.find((s) => s.name === name);
  if (existing) { console.log(`[seed-ring] ${name} 이미 있음 — --clean 으로 지우고 다시 만드세요`); process.exit(0); }
  const substation = await call('/org/substations', 'POST', { branchId: branch.id, name });
  const floor = { id: crypto.randomUUID(), name: '1층' };
  await call(`/substations/${substation.id}/commit`, 'PUT', {
    floors: { creates: [{ id: floor.id, name: floor.name, sortOrder: 0 }] },
  });

  const ofd = place(ofdAssembly, 'OFD', floor.id, 40, 40);
  const term = place(termAssembly, '송광치', floor.id, 200, 40);
  await call(`/substations/${substation.id}/commit`, 'PUT', {
    assets: { creates: [...ofd.creates, ...term.creates] },
  });
  sites.push({ name, substation, ofd, term });
  console.log(`[seed-ring] ${name} — OFD(슬롯 4) · 송광치 1식`);
}

// ── ① 광 링: 이웃 국끼리 OPGW 한 가닥 ───────────────────────────────────────
/* 슬롯 1 은 **다음 국**으로, 슬롯 2 는 **이전 국**으로 — 한 국이 두 이웃을 갖는다. */
for (let i = 0; i < sites.length; i++) {
  const here = sites[i];
  const next = sites[(i + 1) % sites.length];
  await call(`/substations/${here.substation.id}/commit`, 'PUT', {
    cables: { creates: [{
      id: crypto.randomUUID(),
      aPortId: at(here.ofd, '슬롯 1', 'FIBER-TRUNK'),
      bPortId: at(next.ofd, '슬롯 2', 'FIBER-TRUNK'),
      categoryId: OPGW,
      specParams: { lengthM: 1200 },
    }] },
  });
  console.log(`[seed-ring] OPGW  ${here.name} ⇄ ${next.name}`);
}

// ── 앞면 심선을 장비로 뽑는다 ───────────────────────────────────────────────
/* 코어 i 는 앞면 i 번으로 나온다 — 그 앞면을 광단말의 광 포트에 점퍼로 잇는다.
   그래야 「내 장비의 광 1」에서 이웃 국의 장비까지 한 줄로 이어진다. */
for (const site of sites) {
  const jumpers = [];
  for (let core = 1; core <= USED_CORES; core++) {
    jumpers.push({
      id: crypto.randomUUID(),
      aPortId: at(site.ofd, '슬롯 1', 'FIBER', core),
      bPortId: at(site.term, '광단말 A', 'FIBER', core),
      categoryId: JUMPER,
      specParams: { lengthM: 15 },
    });
    jumpers.push({
      id: crypto.randomUUID(),
      aPortId: at(site.ofd, '슬롯 2', 'FIBER', core),
      bPortId: at(site.term, '광단말 B', 'FIBER', core),
      categoryId: JUMPER,
      specParams: { lengthM: 15 },
    });
  }
  await call(`/substations/${site.substation.id}/commit`, 'PUT', { cables: { creates: jumpers } });
}
console.log(`[seed-ring] 점퍼 — 국마다 앞면 ${USED_CORES}심씩 광단말 A·B 로`);

// ── ② 네트워크 거미줄 — 첫 국 안에서 ────────────────────────────────────────
/* 스위치 둘을 **이중으로** 잇고, 거기에 장비들을 매단다. 네트워크에는 방향도 내부 통과도
   없으므로(`pairing: 'any'`) 이 거미줄에서 추적이 무엇을 말하는지 보려는 것이다. */
const web = sites[0];
const netCables = [
  // 스위치끼리 이중화 — 같은 두 장비 사이에 두 가닥
  { a: ['L3 스위치 1', 'NETWORK', 23], b: ['L3 스위치 2', 'NETWORK', 23] },
  { a: ['L3 스위치 1', 'NETWORK', 24], b: ['L3 스위치 2', 'NETWORK', 24] },
  // 스위치 1 에 매달리는 것들
  { a: ['L3 스위치 1', 'NETWORK', 1], b: ['광단말 A', 'NETWORK', 1] },
  { a: ['L3 스위치 1', 'NETWORK', 2], b: ['광단말 B', 'NETWORK', 1] },
  { a: ['L3 스위치 1', 'NETWORK', 3], b: ['통합단말', 'NETWORK', 1] },
  { a: ['L3 스위치 1', 'NETWORK', 4], b: ['광컨버터 상단', 'NETWORK', 1] },
  { a: ['L3 스위치 1', 'NETWORK', 5], b: ['광스위치 상단', 'NETWORK', 1] },
  // 스위치 2 에 매달리는 것들
  { a: ['L3 스위치 2', 'NETWORK', 1], b: ['방화벽', 'NETWORK', 1] },
  { a: ['L3 스위치 2', 'NETWORK', 2], b: ['광컨버터 하단', 'NETWORK', 1] },
  { a: ['L3 스위치 2', 'NETWORK', 3], b: ['광스위치 하단', 'NETWORK', 1] },
  { a: ['L3 스위치 2', 'NETWORK', 4], b: ['통합단말', 'NETWORK', 2] },
].map(({ a, b }) => ({
  id: crypto.randomUUID(),
  aPortId: at(web.term, ...a),
  bPortId: at(web.term, ...b),
  categoryId: UTP,
  specParams: { lengthM: 3 },
}));
await call(`/substations/${web.substation.id}/commit`, 'PUT', { cables: { creates: netCables } });
console.log(`[seed-ring] 네트워크 거미줄 — ${web.name} 안에 ${netCables.length} 가닥(스위치 이중화 포함)`);

console.log(`\n광 링: ${RING.join(' ⇄ ')} ⇄ ${RING[0]}`);
console.log(`국마다 OFD 앞면 ${USED_CORES}심이 광단말 A·B 로 나간다 — 광 포트에서 추적하면 이웃 국까지 간다.`);
