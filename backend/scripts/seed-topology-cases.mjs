/**
 * 토폴로지 시험 시드 — **그림이 어긋날 만한 모양을 다 만든다.**
 *
 * 링 하나만 있는 자료로는 배치가 옳은지 알 수 없다. 실제로 옛 구현이 무너진 자리가
 * 「마디를 공유하는 링 둘」과 「구간을 공유하는 링 둘」이었고, 그 둘을 그리려다 레이아웃이
 * 978줄이 됐다. 지금 배치는 「바깥 테두리를 원으로 놓으면 공유 구간이 저절로 현이 된다」로
 * 그 일을 대신하므로, 그 가정이 맞는지 눈으로 확인할 자료가 있어야 한다.
 *
 * 국 하나 = OFD 설비 + 경로슬롯 몇. 국 사이는 OPGW(구간 케이블) 한 본.
 *
 *   node backend/scripts/seed-topology-cases.mjs
 *   node backend/scripts/seed-topology-cases.mjs --clean
 */

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const API = `${arg('url', 'http://localhost:3000')}/api/v2`;

/** 만들 국 스무 개 — 이름은 전부 `토폴로지-` 로 시작해 `--clean` 이 한 번에 걷는다. */
const STATION_KEYS = Array.from({ length: 20 }, (_, i) => `T${i + 1}`);
const fullName = (key) => `토폴로지-${key}`;

/** 성단(앞면 ↔ 장비)을 놓는 국 — 나머지는 코어가 안 지나가는 마디가 어떻게 보이는지 보는 자리. */
const WITH_EQUIPMENT = new Set(['T1', 'T2']);

/**
 * 구간 케이블 — `[국A, 국A 쪽 슬롯 번호, 국B, 국B 쪽 슬롯 번호]`.
 * 슬롯 번호는 OFD 기본 4슬롯(슬롯 1~4) 안에서 국마다 겹치지 않게 손으로 배정했다 — 최대
 * 사용량은 T4(링 두 방향 + 8자 두 방향)로 정확히 4.
 */
const SEGMENTS = [
  // 닫힌 링 넷 — T1 T2 T3 T4 가 원을 이룬다
  ['T1', 1, 'T2', 1],
  ['T2', 3, 'T3', 1],
  ['T3', 2, 'T4', 1],
  ['T4', 2, 'T1', 3],
  // 평행 구간 — T1–T2 를 한 본 더(모두 두 본)
  ['T1', 2, 'T2', 2],
  // 마디 공유(8자) — T4 에서 접한다
  ['T4', 3, 'T5', 1],
  ['T5', 2, 'T6', 1],
  ['T6', 2, 'T4', 4],
  // 구간 공유(내부·외부 링) — T7–T9 사이를 T8 경유와 T10·T11 경유 둘이 대신한다
  ['T7', 1, 'T8', 1],
  ['T8', 2, 'T9', 1],
  ['T9', 2, 'T10', 1],
  ['T10', 2, 'T7', 2],
  ['T7', 3, 'T11', 1],
  ['T11', 2, 'T9', 3],
  // 링에 매달린 사슬
  ['T3', 3, 'T12', 1],
  ['T12', 2, 'T13', 1],
  // 안 닫힌 링 — T17–T14 가 없다
  ['T14', 1, 'T15', 1],
  ['T15', 2, 'T16', 1],
  ['T16', 2, 'T17', 1],
  // 따로 노는 망 — 나머지 어느 국과도 이어지지 않는다
  ['T18', 1, 'T19', 1],
  ['T19', 2, 'T20', 1],
];

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
     국을 넘는 케이블은 **만든 쪽 국의 커밋에서만** 지워진다(`Cable.substationId` = 만들 때
     URL 에 쓴 국) — 반대쪽에서 지우려 하면 422 INVALID_CABLE 이다. 그래서 케이블은 **국
     스무 개를 다 돈 뒤에**(내가 만든 것만 골라) 지운다 — 자산 삭제 차례에 아직 반대쪽이
     안 지운 대국 케이블이 붙어 있으면 `assertNoAttachedCables` 가 자산 삭제도 막는다. */
  const subs = STATION_KEYS.map((key) => allSubs.find((x) => x.name === fullName(key))).filter(Boolean);
  for (const sub of subs) {
    const wc = await call(`/substations/${sub.id}/workingcopy`);
    const myCables = wc.cables.filter((c) => c.substationId === sub.id);
    if (myCables.length) {
      const baseVersions = Object.fromEntries(myCables.map((r) => [r.id, r.updatedAt]));
      await call(`/substations/${sub.id}/commit`, 'PUT', { cables: { deletes: myCables.map((c) => c.id) }, baseVersions });
    }
  }
  for (const sub of subs) {
    const wc = await call(`/substations/${sub.id}/workingcopy`);
    const baseVersions = Object.fromEntries([...wc.assets, ...wc.floors].map((r) => [r.id, r.updatedAt]));
    if (wc.assets.length) {
      const depth = (a) => (a.parentAssetId ? 1 : 0);
      const ids = [...wc.assets].sort((a, b) => depth(b) - depth(a)).map((a) => a.id);
      await call(`/substations/${sub.id}/commit`, 'PUT', { assets: { deletes: ids }, baseVersions });
    }
    if (wc.floors.length) {
      await call(`/substations/${sub.id}/commit`, 'PUT', {
        floors: { deletes: wc.floors.map((f) => f.id) },
        baseVersions,
      });
    }
    await call(`/org/substations/${sub.id}`, 'DELETE');
    console.log(`[seed-topology] ${sub.name} 지움`);
  }
  process.exit(0);
}

const catalog = await call('/catalog');
const typeById = Object.fromEntries(catalog.types.map((t) => [t.id, t]));
const assemblyByName = Object.fromEntries(catalog.assemblies.map((a) => [a.name, a]));
const ofdAssembly = assemblyByName['OFD(광분배함)'];
const termAssembly = assemblyByName['송변전광단말장치'];
if (!ofdAssembly || !termAssembly) throw new Error('OFD·송변전광단말장치 설비 품목이 필요합니다');

/** 구간·점퍼 케이블 종류 — 이름이 아니라 **매체가 광인 그룹**에서 고른다. */
const fiberGroup = catalog.cableGroups.find((g) => g.key === 'fiber');
const OPGW = fiberGroup.categories[0].id;
const JUMPER = fiberGroup.categories.find((c) => /점퍼|jumper/i.test(c.name))?.id ?? fiberGroup.categories[0].id;

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
const sites = {};
for (const key of STATION_KEYS) {
  const name = fullName(key);
  const existing = allSubs.find((s) => s.name === name);
  if (existing) { console.log(`[seed-topology] ${name} 이미 있음 — --clean 으로 지우고 다시 만드세요`); process.exit(0); }
  const substation = await call('/org/substations', 'POST', { branchId: branch.id, name });
  const floor = { id: crypto.randomUUID(), name: '1층' };
  await call(`/substations/${substation.id}/commit`, 'PUT', {
    floors: { creates: [{ id: floor.id, name: floor.name, sortOrder: 0 }] },
  });

  const ofd = place(ofdAssembly, 'OFD', floor.id, 40, 40);
  const assetCreates = [...ofd.creates];
  let term;
  if (WITH_EQUIPMENT.has(key)) {
    term = place(termAssembly, '송광치', floor.id, 200, 40);
    assetCreates.push(...term.creates);
  }
  await call(`/substations/${substation.id}/commit`, 'PUT', { assets: { creates: assetCreates } });
  sites[key] = { key, name, substation, ofd, term };
  console.log(`[seed-topology] ${name} — OFD(슬롯 4)${term ? ' · 송광치 1식' : ''}`);
}

// ── 구간 케이블 — 국과 국을 OPGW 로 잇는다 ──────────────────────────────────
for (const [aKey, aSlot, bKey, bSlot] of SEGMENTS) {
  const a = sites[aKey];
  const b = sites[bKey];
  await call(`/substations/${a.substation.id}/commit`, 'PUT', {
    cables: { creates: [{
      id: crypto.randomUUID(),
      aPortId: at(a.ofd, `슬롯 ${aSlot}`, 'FIBER-TRUNK'),
      bPortId: at(b.ofd, `슬롯 ${bSlot}`, 'FIBER-TRUNK'),
      categoryId: OPGW,
      specParams: { lengthM: 800 },
    }] },
  });
  console.log(`[seed-topology] OPGW  ${a.name}(슬롯${aSlot}) ⇄ ${b.name}(슬롯${bSlot})`);
}

// ── 통과 점퍼 — 중간 국에서 코어가 실제로 지나가게 한다 ─────────────────────
/* `/reach` 는 케이블로 이어진 자산만 너비 우선으로 걷는다. 한 OFD 의 슬롯들은 같은
   설비 밑 형제 자산일 뿐 서로 케이블로 이어져 있지 않으므로, 국 안에서 점퍼로 앞면끼리
   잇지 않으면 BFS 가 그 국에서 멈춘다 — 어느 포트에서 추적해도 이웃 국 하나만 보이고
   링·8자·구간공유·사슬이 그래프에 아예 안 잡힌다(서버 잘못이 아니라 시드가 통과 접속을
   안 놓은 것). 슬롯을 순서대로 사슬처럼 이어 국 하나 안의 모든 방향을 한 덩어리로 묶는다.

   T1·T2 는 이미 앞면 슬롯1·2 의 코어 1 을 장비로 뽑아 썼으므로(성단), 통과 점퍼는 코어 2 를
   쓴다 — 포트가 겹치지 않는다. T3 만 코어 5 를 써서 「코어가 안 지나가는 국」을 만든다:
   `/reach` 는 케이블만 보고 걸으므로 링을 한 바퀴 다 돌지만(코어 번호를 안 따짐), 광단말
   A 의 코어 1 을 그대로 타고 가는 추적은 T3(정확히는 이미 코어 1 이 T1·T2 성단 안에서 끝나
   있어 그보다 앞에서) 못 넘어가 T4 부터 마디만 서고 장비 목록이 빈다. */
const BRIDGES = [
  { key: 'T2', slots: [1, 2, 3], core: 2 },
  { key: 'T3', slots: [1, 2, 3], core: 5 },
  { key: 'T4', slots: [1, 2, 3, 4], core: 2 },
  { key: 'T5', slots: [1, 2], core: 2 },
  { key: 'T6', slots: [1, 2], core: 2 },
  { key: 'T7', slots: [1, 2, 3], core: 2 },
  { key: 'T8', slots: [1, 2], core: 2 },
  { key: 'T9', slots: [1, 2, 3], core: 2 },
  { key: 'T10', slots: [1, 2], core: 2 },
  { key: 'T11', slots: [1, 2], core: 2 },
  { key: 'T12', slots: [1, 2], core: 2 },
  { key: 'T15', slots: [1, 2], core: 2 },
  { key: 'T16', slots: [1, 2], core: 2 },
];
/* 사슬 가운데 슬롯은 앞·뒤 점퍼 둘을 받으므로 앞면 포트도 둘 필요하다(포트 하나엔 케이블
   하나) — 「다음으로」는 core, 「이전으로」는 core+1 로 슬롯마다 서로 다른 포트를 쓴다. */
for (const { key, slots, core } of BRIDGES) {
  const site = sites[key];
  const creates = [];
  for (let i = 0; i < slots.length - 1; i++) {
    creates.push({
      id: crypto.randomUUID(),
      aPortId: at(site.ofd, `슬롯 ${slots[i]}`, 'FIBER', core + 1),
      bPortId: at(site.ofd, `슬롯 ${slots[i + 1]}`, 'FIBER', core),
      categoryId: JUMPER,
      specParams: { lengthM: 3 },
    });
  }
  await call(`/substations/${site.substation.id}/commit`, 'PUT', { cables: { creates } });
  console.log(`[seed-topology] 통과 점퍼 — ${site.name} 슬롯 ${slots.join('-')} (코어 ${core})`);
}

// ── T1·T2 만 앞면 심선을 장비로 뽑는다 ──────────────────────────────────────
/* 슬롯 1·2 는 곧 T1–T2 구간(평행 두 본)이므로, 그 앞면 코어를 광단말 A·B 로 이으면
   「내 장비의 광 1」에서 추적을 걸었을 때 두 평행 구간이 각각 다른 장비 줄로 갈라져 보인다. */
for (const key of [...WITH_EQUIPMENT]) {
  const site = sites[key];
  const jumpers = [
    { id: crypto.randomUUID(), aPortId: at(site.ofd, '슬롯 1', 'FIBER', 1), bPortId: at(site.term, '광단말 A', 'FIBER', 1), categoryId: JUMPER, specParams: { lengthM: 15 } },
    { id: crypto.randomUUID(), aPortId: at(site.ofd, '슬롯 2', 'FIBER', 1), bPortId: at(site.term, '광단말 B', 'FIBER', 1), categoryId: JUMPER, specParams: { lengthM: 15 } },
  ];
  await call(`/substations/${site.substation.id}/commit`, 'PUT', { cables: { creates: jumpers } });
  console.log(`[seed-topology] 점퍼 — ${site.name} 앞면 슬롯1·2 심선을 광단말 A·B 로`);
}

console.log(`\n국 ${STATION_KEYS.length}개, 구간 케이블 ${SEGMENTS.length}본 — 이름은 모두 ${fullName('T*')}.`);
console.log(`${fullName('T1')} 의 광단말 A 포트에서 추적 → 「토폴로지」 를 눌러 확인하세요.`);
