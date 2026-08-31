/**
 * 토폴로지 시험 시드 — **그림이 어긋날 만한 모양을 다 만든다.**
 *
 * 링 하나만 있는 자료로는 배치가 옳은지 알 수 없다. 실제로 옛 구현이 무너진 자리가
 * 「마디를 공유하는 링 둘」과 「구간을 공유하는 링 둘」이었고, 그 둘을 그리려다 레이아웃이
 * 978줄이 됐다. 지금 배치는 「바깥 테두리를 원으로 놓으면 공유 구간이 저절로 현이 된다」로
 * 그 일을 대신하므로, 그 가정이 맞는지 눈으로 확인할 자료가 있어야 한다.
 *
 * 마디는 **장비**다(경로슬롯이 아니다 — `isMultiCorePort` 로 갈린다). 그래서 국 하나 =
 * OFD 설비(경로슬롯 몇) + 광단말 장비 하나이고, 장비의 광 포트를 서쪽·동쪽 슬롯에 나눠
 * 빼면 그 장비가 곧 그 국의 통과 지점이 된다 — 중간 국에 앞면↔앞면 통과 점퍼를 따로 놓을
 * 필요가 없다(2026-08-31: 옛 버전은 마디가 국이던 시절의 우회를 그대로 남겨 패치 위주로
 * 읽혔다). 국 사이는 OPGW(구간 케이블) 한 본.
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

/**
 * 국별 「이 슬롯이 이 국의 몇 번째 방향인가」 — `SEGMENTS` 를 등장 차례대로 훑어 만든다.
 * 장비의 광 포트 번호(코어)는 이 차례를 그대로 따른다: 국 하나가 이 목록에 n 번 나오면
 * 그 장비는 광 포트를 n 개 뺀다. 슬롯 번호가 국마다 안 겹치므로(위 배정) 국 안에서
 * 같은 슬롯이 두 번 나오는 일도 없다.
 */
const directionsByStation = {};
for (const [aKey, aSlot, bKey, bSlot] of SEGMENTS) {
  for (const [key, slot] of [[aKey, aSlot], [bKey, bSlot]]) {
    (directionsByStation[key] ??= []).push(slot);
  }
}

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

/**
 * 설비 품목 하나를 펴서 설비 + 부품 — 포트 id 를 여기서 붙인다(화면이 하는 그대로).
 * `itemNames` 를 주면 그 이름의 부품만 편다 — 송변전광단말장치처럼 부품이 많은 설비에서
 * 광 경로에 안 쓰는 전원반·스위치까지 다 놓으면 그 부품들도 「다심 없는 자산」이라 마디로
 * 잡혀(포트가 광이 아니라 전원·네트워크뿐이어도 `isMultiCorePort` 는 그 매체를 안 따진다)
 * 국마다 안 닿는 마디가 여럿씩 늘어난다. 화면도 부품을 하나씩 나중에 더 놓을 수 있으므로
 * (부품 추가) 일부만 펴는 것 자체는 화면이 못 만드는 자료가 아니다.
 */
function place(assembly, name, floorId, x, y, itemNames) {
  const equipmentId = crypto.randomUUID();
  const creates = [{ id: equipmentId, name, assemblyId: assembly.id, floorId, x, y, width: 70, height: 70 }];
  /** `부품이름|그룹|번호` → 포트 id */
  const ports = new Map();
  const items = itemNames ? assembly.items.filter((it) => itemNames.includes(it.name)) : assembly.items;
  for (const item of items) {
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
  // 모든 국에 광단말 장비를 둔다 — 장비가 곧 그 국의 통과 지점이라 빠지면 링이 끊긴다.
  const term = place(termAssembly, '송광치', floor.id, 200, 40, ['광단말 A']);
  const assetCreates = [...ofd.creates, ...term.creates];
  await call(`/substations/${substation.id}/commit`, 'PUT', { assets: { creates: assetCreates } });
  sites[key] = { key, name, substation, ofd, term };
  console.log(`[seed-topology] ${name} — OFD(슬롯 4) · 광단말 A`);
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

// ── 국마다 장비의 광 포트를 방향 슬롯으로 뽑는다 ────────────────────────────
/* 장비가 곧 통과 지점이다 — 국 안에서 슬롯끼리 잇는 통과 점퍼가 따로 필요 없다(파일 머리
   주석 참고). 방향(=이 국이 잇는 이웃)마다 광단말 A 의 광 포트를 하나씩 그 슬롯의 코어 1
   앞면에 꽂는다. 코어 1 은 어느 슬롯이든 이 점퍼 하나만 쓰므로(슬롯이 국마다 안 겹치듯
   방향도 슬롯마다 하나) 국 사이에서 겹칠 일이 없다. */
for (const key of STATION_KEYS) {
  const site = sites[key];
  const slots = directionsByStation[key] ?? [];
  const creates = slots.map((slot, i) => ({
    id: crypto.randomUUID(),
    aPortId: at(site.ofd, `슬롯 ${slot}`, 'FIBER', 1),
    bPortId: at(site.term, '광단말 A', 'FIBER', i + 1),
    categoryId: JUMPER,
    specParams: { lengthM: 15 },
  }));
  await call(`/substations/${site.substation.id}/commit`, 'PUT', { cables: { creates } });
  console.log(`[seed-topology] 점퍼 — ${site.name} 슬롯 ${slots.join('·')} 앞면을 광단말 A 광 1~${slots.length} 로`);
}

// ── T3 만 급행 심선 — 장비가 안 쓰는 코어로 국을 그냥 통과시킨다 ────────────
/* 장비는 코어 1 만 썼다(위 루프). 코어 2 로 T3 의 서쪽(T2 쪽, 슬롯1)과 동쪽(T4 쪽, 슬롯2)
   앞면을 직접 잇는다 — 장비를 안 거치므로 이 코어로 추적하면 T3 의 광단말 A 는 마디
   목록에도 안 잡히고 T2·T4 가(간접적으로, 그 사이 어느 장비도 없이) 그대로 이어진다. */
{
  const t3 = sites['T3'];
  await call(`/substations/${t3.substation.id}/commit`, 'PUT', {
    cables: { creates: [{
      id: crypto.randomUUID(),
      aPortId: at(t3.ofd, '슬롯 1', 'FIBER', 2),
      bPortId: at(t3.ofd, '슬롯 2', 'FIBER', 2),
      categoryId: JUMPER,
      specParams: { lengthM: 3 },
    }] },
  });
  console.log(`[seed-topology] 급행 심선 — ${t3.name} 슬롯1↔슬롯2 코어2(장비를 안 거친다)`);

  /* 그 급행 심선의 **양끝을 장비에 물린다** — T2 광단말 A ↔ (T3 를 그냥 지나) ↔ T4 광단말 A.
     이래야 사용자가 말한 모양이 된다: 「1번 광단말 A 가 3번 광단말 A 와 사실상 직결인데,
     가운데 2번 국을 경유한다」. 양끝이 장비여야 그림에 T2↔T4 줄 하나로 서고, 그 줄에
     「T3(패치)」가 적힌다. 양끝을 안 물리면 어느 장비에도 안 닿는 캄캄한 심선일 뿐이다.

     쓰는 포트: T2 는 방향이 셋(슬롯1·2·3)이라 광 1~3 을 썼으므로 광 4, T4 는 방향이
     넷이라 광 5. 슬롯은 각자 T3 를 보는 방향(T2 는 슬롯 3, T4 는 슬롯 1)의 코어 2. */
  const t2 = sites['T2'];
  const t4 = sites['T4'];
  await call(`/substations/${t2.substation.id}/commit`, 'PUT', {
    cables: { creates: [{
      id: crypto.randomUUID(),
      aPortId: at(t2.ofd, '슬롯 3', 'FIBER', 2),
      bPortId: at(t2.term, '광단말 A', 'FIBER', 4),
      categoryId: JUMPER,
      specParams: { lengthM: 15 },
    }] },
  });
  await call(`/substations/${t4.substation.id}/commit`, 'PUT', {
    cables: { creates: [{
      id: crypto.randomUUID(),
      aPortId: at(t4.ofd, '슬롯 1', 'FIBER', 2),
      bPortId: at(t4.term, '광단말 A', 'FIBER', 5),
      categoryId: JUMPER,
      specParams: { lengthM: 15 },
    }] },
  });
  console.log('[seed-topology] 급행 양끝 — T2 광단말 A 광 4 ⇄ (T3 패치) ⇄ T4 광단말 A 광 5');
}

// ── T1 만 장비에 안 닿는 포트 — 성단은 됐지만 갈 곳이 없다 ──────────────────
/* 슬롯 4 는 T1 의 어느 방향에도 안 쓰였다(방향 셋은 슬롯1·2·3). 그 앞면 코어1 을 슬롯1의
   빈 코어(2)에 점퍼로 잇는다 — 케이블이 있어야 화면에 「추적」 버튼이 뜨므로 빈 포트가
   아니라 성단된 포트로 남겨야 한다. 슬롯1 은 이미 링에 걸려 있으므로 `/reach` 는(자산
   단위로 걷어) 이 포트에서 열어도 그 계통 장비를 그대로 보여 주지만, 이 포트 자신의
   코어(슬롯1 코어2 → 슬롯4 코어1)는 그 어느 쪽도 장비로 안 나가 정규화가 실패한다. */
{
  const t1 = sites['T1'];
  await call(`/substations/${t1.substation.id}/commit`, 'PUT', {
    cables: { creates: [{
      id: crypto.randomUUID(),
      aPortId: at(t1.ofd, '슬롯 1', 'FIBER', 2),
      bPortId: at(t1.ofd, '슬롯 4', 'FIBER', 1),
      categoryId: JUMPER,
      specParams: { lengthM: 3 },
    }] },
  });
  console.log(`[seed-topology] 성단만 된 포트 — ${t1.name} 슬롯4 광1(슬롯1 코어2 로 성단, 장비엔 안 닿음)`);
}

console.log(`\n국 ${STATION_KEYS.length}개, 구간 케이블 ${SEGMENTS.length}본 — 이름은 모두 ${fullName('T*')}.`);
console.log(`${fullName('T1')} 의 광단말 A 광1 포트에서 추적 → 「토폴로지」 를 눌러 확인하세요.`);
console.log(`장비에 안 닿는 포트 확인: ${fullName('T1')} 의 OFD 슬롯4 광1 포트.`);
