/**
 * 시험용 현장 데이터 — **실제 결선**으로 변전소 둘을 채우고 OPGW 로 잇는다.
 *
 * 개발 중 손으로 만들던 데이터가 「슬롯 → 슬롯」처럼 실물에 없는 결선이라, 대국 자리에 슬롯
 * 이름이 떠서 화면이 무엇을 말하는지 알 수 없었다. 실물의 결선은 두 겹이다:
 *
 *   구내 : 경로슬롯의 **장비쪽 성단** → 광단말의 광 포트 (점퍼 한 가닥씩)
 *   구간 : 경로슬롯의 **OPGW**       → 상대 변전소 경로슬롯의 OPGW (한 가닥에 24심)
 *
 * 그래야 대국이 「광단말 A · 광 1」·「신탄진 OFD · OPGW」처럼 읽히고, 원격 대국이 어떻게
 * 표시되는지도 확인할 수 있다.
 *
 * 화면이 하는 그대로 만든다: 설비 종류를 펴서 설비 + 부품을 만들고, 포트는 명세대로 만들되
 * **id 를 여기서 붙여** 커밋에 함께 보낸다(그래야 이어 둔 케이블이 같은 포트를 가리킨다).
 *
 *   node backend/scripts/seed-demo.mjs [--url http://localhost:3000] [--user admin] [--pass admin123]
 */
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const API = `${arg('url', 'http://localhost:3000')}/api/v2`;

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: arg('user', 'admin'), password: arg('pass', 'admin123') }),
  });
  if (!r.ok) throw new Error(`로그인 실패 ${r.status}`);
  return (await r.json()).accessToken;
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

tok = await login();

const catalog = await call('/catalog');
const assemblyByKey = Object.fromEntries(catalog.assemblies.map((a) => [a.key, a]));
const typeById = Object.fromEntries(catalog.types.map((t) => [t.id, t]));

/**
 * 설비 종류 하나를 펴서 설비 + 부품을 만든다 — 포트 id 는 여기서 붙인다.
 *
 * @returns creates(커밋 바디)와 `부품이름 포트이름` → 포트 id 맵(케이블을 이을 때 쓴다).
 */
function place(key, name, floorId, x) {
  const asm = assemblyByKey[key];
  const equipmentId = crypto.randomUUID();
  const creates = [{ id: equipmentId, name, assemblyId: asm.id, floorId, x, y: 40, width: 70, height: 70 }];
  const ports = new Map();

  for (const item of asm.items) {
    const templates = [...typeById[item.typeId].portTemplates].sort((a, b) => a.sortOrder - b.sortOrder);
    const portIds = {};
    for (const tpl of templates) {
      const count = item.portCounts?.[tpl.group] ?? tpl.count;
      for (let i = 1; i <= count; i++) {
        const id = crypto.randomUUID();
        portIds[`${tpl.group}:${i}`] = id;
        ports.set(`${item.name} ${tpl.namePattern.replace('{n}', String(i))}`, id);
      }
    }
    creates.push({
      id: crypto.randomUUID(),
      name: item.name,
      typeId: item.typeId,
      parentAssetId: equipmentId,
      col: item.col,
      row: item.row,
      colSpan: item.colSpan,
      rowSpan: item.rowSpan,
      portIds,
      ...(item.portCounts ? { portCounts: item.portCounts } : {}),
      ...(item.portPositions ? { portPositions: item.portPositions } : {}),
    });
  }
  return { creates, ports };
}

/** 케이블 종류를 이름으로 찾는다 — 매체가 맞아야 이어진다(광 포트끼리는 광 그룹으로만). */
const categoryByName = Object.fromEntries(
  catalog.cableGroups.flatMap((g) => g.categories.map((c) => [c.name, c.id])),
);
const JUMPER = categoryByName['광점퍼코드'];
const OPGW = categoryByName['OPGW(광복합가공지선)'];

/** 변전소 하나를 채운다 — OFD 와 송광치를 놓고 구내 점퍼로 잇는다. */
async function fillSubstation(substationId, floorId, ofdName) {
  const ofd = place('OFD', ofdName, floorId, 40);
  const opt = place('OPT-SET', '송광치 A', floorId, 160);
  await call(`/substations/${substationId}/commit`, 'PUT', {
    assets: { creates: [...ofd.creates, ...opt.creates] },
  });

  // 구내: 경로슬롯 1 의 장비쪽 성단 1~12 → 광단말 A 의 광 1~12
  const jumpers = Array.from({ length: 12 }, (_, i) => ({
    id: crypto.randomUUID(),
    aPortId: ofd.ports.get(`슬롯 1 장비 ${i + 1}`),
    bPortId: opt.ports.get(`광단말 A 광 ${i + 1}`),
    categoryId: JUMPER,
    specParams: { lengthM: 3 },
  }));
  await call(`/substations/${substationId}/commit`, 'PUT', { cables: { creates: jumpers } });
  return { ofd, opt, jumpers: jumpers.length };
}

/** 조직을 갖춘다 — 시드는 카탈로그만 넣고 조직은 넣지 않는다. */
async function ensureOrg() {
  let { headquarters } = await call('/org-tree');
  if (headquarters.length === 0) {
    const hq = await call('/org/headquarters', 'POST', { name: '대전전력지사' });
    await call('/org/branches', 'POST', { headquartersId: hq.id, name: '중부지사' });
    ({ headquarters } = await call('/org-tree'));
  }
  const branch = headquarters[0].branches[0];
  const out = [];
  for (const name of ['신탄진변전소', '판암변전소']) {
    let ss = branch.substations.find((s) => s.name === name);
    if (!ss) ss = await call('/org/substations', 'POST', { branchId: branch.id, name });
    const wc = await call(`/substations/${ss.id}/workingcopy`);
    const floor = wc.floors[0] ?? (await call('/org/floors', 'POST', { substationId: ss.id, name: '1층' }));
    out.push({ id: ss.id, name, floorId: floor.id, assetCount: wc.assets.length });
  }
  return out;
}

const [local, remote] = await ensureOrg();
if (local.assetCount > 0 || remote.assetCount > 0) {
  console.log('[seed-demo] 이미 자산이 있습니다 — 그대로 둡니다.');
  process.exit(0);
}

const a = await fillSubstation(local.id, local.floorId, '신탄진 OFD');
const b = await fillSubstation(remote.id, remote.floorId, '판암 OFD');

/* 구간: 두 변전소의 경로슬롯을 OPGW 한 가닥으로 잇는다.
   다심 포트라 24심이 이 한 가닥에 실린다 — 심선마다 케이블을 만들지 않는다(공량이 부풀지 않게).
   끝점 하나만 이 변전소의 것이어도 이어진다 — 구간 케이블은 원래 두 국에 걸친다. */
await call(`/substations/${local.id}/commit`, 'PUT', {
  cables: {
    creates: [{
      id: crypto.randomUUID(),
      aPortId: a.ofd.ports.get('슬롯 1 OPGW'),
      bPortId: b.ofd.ports.get('슬롯 1 OPGW'),
      categoryId: OPGW,
      name: '신탄진 ↔ 판암 OPGW',
      specParams: { lengthM: 8400 },
    }],
  },
});

console.log(
  `[seed-demo] ${local.name}·${remote.name} 각 설비 2대 · 구내 점퍼 ${a.jumpers + b.jumpers}가닥 · 구간 OPGW 1가닥(24심)`,
);
