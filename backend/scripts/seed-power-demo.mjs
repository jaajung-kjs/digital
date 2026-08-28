/**
 * 시험용 **전원 계통** — 반(盤) 셋을 나무로 잇고 부하를 매단다.
 *
 * 계통 탭이 무엇을 보여 줘야 하는지는 실무 대장이 말한다(분전반 수용내역·전원계통도):
 * 소내전원반이 밖에서 받아 UPS·충전기를 먹이고, 충전기가 DC 48V 반을 먹이고, 그 반의
 * 회로 하나하나가 장비로 나간다. 개발 DB 에는 그 결선이 없어 화면을 눈으로 확인할 수 없었다.
 *
 * 화면이 하는 그대로 만든다: 설비 품목을 펴서 설비 + 부품을 만들고(구성 항목 고리까지),
 * 포트 id 를 여기서 붙여 커밋에 함께 보낸다 — 그래야 이어 둔 케이블이 같은 포트를 가리킨다.
 *
 *   node backend/scripts/seed-power-demo.mjs [--url http://localhost:3000] [--name 계통시험S/S]
 *   node backend/scripts/seed-power-demo.mjs --clean      # 만든 변전소를 통째로 지운다
 */
/* 값은 **어휘에서 가져온다** — 시드가 제 손으로 「AC 220V」 같은 것을 지어내면 목록에 없는
   값이 DB 에 눌러앉고, 화면은 그것을 지울 수 없어(적힌 사실이니까) 목록에 얹어 보여 준다.
   실제로 그렇게 돼서 전압 목록에 위상 없는 값이 하나 섞여 있었다. */
import { POWER_VOLTAGES } from '@twin/core';

/** 삼상 220V — 반과 반 사이(소내분전반 → 충전기·UPS). 대장의 「220V 3φ (60A FR-38sq)」. */
const AC_3P = POWER_VOLTAGES.find((v) => v.includes('220V 3'));
/** 단상 220V — 부하로 나가는 분기. */
const AC_1P = POWER_VOLTAGES.find((v) => v.includes('220V 1'));
/** 직류 48V — 충전기 아래. 직류에는 위상이 없다. */
const DC = POWER_VOLTAGES.find((v) => v.startsWith('DC 48'));

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);
const API = `${arg('url', 'http://localhost:3000')}/api/v2`;
const SUB_NAME = arg('name', '계통시험S/S');
/** 반마다 회로 열 개 — 실물 분전반이 그 언저리다(강릉 대장은 반당 10~15). */
const CIRCUITS = 10;
/** 이 시드가 만드는 설비 품목 이름 — `--clean` 도 이 이름으로 걷는다. */
const BOARD_SET = '분전반(시험)';

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
const branch = orgTree.headquarters.flatMap((h) => h.branches)[0];
if (!branch) throw new Error('지사가 없습니다 — 조직을 먼저 만드세요');
const existing = branch.substations.find((s) => s.name === SUB_NAME)
  ?? orgTree.headquarters.flatMap((h) => h.branches).flatMap((b) => b.substations).find((s) => s.name === SUB_NAME);

if (has('clean')) {
  /* 변전소가 없어도 **품목은 남아 있을 수 있다** — 지난번 실행이 중간에 멎었으면 그렇다.
     그때 그냥 돌아가면 다음 실행이 옛 구성을 그대로 다시 쓴다. */
  if (!existing) {
    const catalog0 = await call('/catalog');
    const stale = catalog0.assemblies.find((a) => a.name === BOARD_SET);
    if (stale) await call(`/catalog/assemblies/${stale.id}`, 'DELETE');
    console.log(`[seed-power] ${SUB_NAME} 없음 —${stale ? ` ${BOARD_SET} 만 지웠습니다.` : ' 지울 것이 없습니다.'}`);
    process.exit(0);
  }
  /* 케이블 → 자산 → 변전소 순서로 걷는다. 자산에 케이블이 물려 있으면 커밋이 막는다. */
  const wc = await call(`/substations/${existing.id}/workingcopy`);
  const baseVersions = Object.fromEntries([...wc.cables, ...wc.assets].map((r) => [r.id, r.updatedAt]));
  if (wc.cables.length) {
    await call(`/substations/${existing.id}/commit`, 'PUT', { cables: { deletes: wc.cables.map((c) => c.id) }, baseVersions });
  }
  if (wc.assets.length) {
    /* 자식부터 — 부모를 먼저 지우면 그 밑이 남는다. */
    const depth = (a) => (a.parentAssetId ? 1 : 0);
    const ids = [...wc.assets].sort((a, b) => depth(b) - depth(a)).map((a) => a.id);
    await call(`/substations/${existing.id}/commit`, 'PUT', { assets: { deletes: ids }, baseVersions });
  }
  if (wc.floors.length) {
    await call(`/substations/${existing.id}/commit`, 'PUT', {
      floors: { deletes: wc.floors.map((f) => f.id) },
      baseVersions: Object.fromEntries(wc.floors.map((f) => [f.id, f.updatedAt])),
    });
  }
  await call(`/org/substations/${existing.id}`, 'DELETE');
  /* 이 시드가 만든 설비 품목도 함께 걷는다 — 남겨 두면 다음 실행이 **옛 구성을 그대로
     다시 쓴다**(품목이 이미 있으면 만들지 않으므로). 실제로 그것 때문에 한 번 헤맸다. */
  const catalog = await call('/catalog');
  const mine = catalog.assemblies.find((a) => a.name === BOARD_SET);
  if (mine) await call(`/catalog/assemblies/${mine.id}`, 'DELETE');
  console.log(`[seed-power] ${SUB_NAME}${mine ? ` · ${BOARD_SET}` : ''} 를 지웠습니다.`);
  process.exit(0);
}

const catalog = await call('/catalog');
const typeById = Object.fromEntries(catalog.types.map((t) => [t.id, t]));
const typeByKey = Object.fromEntries(catalog.types.map((t) => [t.key, t]));
const assemblyByName = Object.fromEntries(catalog.assemblies.map((a) => [a.name, a]));

/** 반 셋을 담은 설비 품목 — 없으면 만든다(있으면 그대로 쓴다). */
const boardAssembly = assemblyByName[BOARD_SET] ?? await (async () => {
  /* 반도 **교류 판과 직류 판이 다른 품목**이다 — 충전기 아래는 직류다(포트의 갈래가 그것을
     말하고, 교류 회로에 직류 부하를 물리면 연결 검증이 막는다). */
  const ac = typeByKey['PWR-AC'];
  const dc = typeByKey['PWR-DC'];
  if (!ac || !dc) throw new Error('전원(AC)·전원(DC) 장비 품목이 없습니다');
  const item = (name, row, type, outGroup) => ({
    id: `tmp-${name}`, typeId: type.id, name,
    col: 0, row, colSpan: 4, rowSpan: 1,
    /* 회로 수는 **품목이 아니라 이 판의 것**이다 — 같은 종류라도 10구 판과 13구 판이 있다. */
    portCounts: { [outGroup]: CIRCUITS }, portPositions: {},
  });
  return call('/catalog/assemblies', 'POST', {
    name: BOARD_SET,
    categoryId: catalog.assemblies[0].categoryId,
    sortOrder: catalog.assemblies.length,
    laborCode: null, unitPrice: null, installManDays: null, removeManDays: null, relocateManDays: null,
    items: [
      item('소내전원반', 0, ac, 'POWER-OUT-AC'),
      item('UPS', 1, ac, 'POWER-OUT-AC'),
      item('DC 48V', 2, dc, 'POWER-OUT-DC'),
    ],
  });
})();

/** 설비 품목 하나를 펴서 설비 + 부품 — 포트 id 를 여기서 붙인다. */
function place(assembly, name, floorId, x, y) {
  const equipmentId = crypto.randomUUID();
  const creates = [{ id: equipmentId, name, assemblyId: assembly.id, floorId, x, y, width: 70, height: 70 }];
  const ports = new Map();
  /** 이 설비가 가진 전원 입력들 — 부하로 쓸 자리다. */
  const powerIns = [];
  for (const item of assembly.items) {
    const templates = [...typeById[item.typeId].portTemplates].sort((a, b) => a.sortOrder - b.sortOrder);
    const portIds = {};
    for (const tpl of templates) {
      const count = item.portCounts?.[tpl.group] ?? tpl.count;
      for (let i = 1; i <= count; i++) {
        const id = crypto.randomUUID();
        portIds[`${tpl.group}:${i}`] = id;
        /* 자리로 찾는다(부품 · 그룹 · 번호) — 이름 패턴은 품목마다 달라서(「출력 {n}」·
           「전원 출력 {n}」) 글자로 찾으면 품목 하나만 바뀌어도 시드가 조용히 깨진다. */
        ports.set(`${item.name}|${tpl.group}|${i}`, id);
          if (tpl.medium === 'power' && tpl.direction === 'IN') powerIns.push({ id, variant: tpl.variant ?? null });
      }
    }
    creates.push({
      id: crypto.randomUUID(), name: item.name, typeId: item.typeId, parentAssetId: equipmentId,
      // 놓인 부품은 **구성의 어느 항목에서 나왔는지**를 들고 간다(화면이 그렇게 보낸다).
      assemblyItemId: item.id,
      col: item.col, row: item.row, colSpan: item.colSpan, rowSpan: item.rowSpan,
      portIds,
      ...(item.portCounts ? { portCounts: item.portCounts } : {}),
      ...(item.portPositions ? { portPositions: item.portPositions } : {}),
    });
  }
  return { creates, ports, powerIns, id: equipmentId };
}

const substation = existing ?? await call('/org/substations', 'POST', { branchId: branch.id, name: SUB_NAME });
const wc0 = await call(`/substations/${substation.id}/workingcopy`);
if (wc0.assets.length > 0) {
  console.log(`[seed-power] ${SUB_NAME} 에 이미 자산이 있습니다 — 그대로 둡니다(--clean 으로 비우세요).`);
  process.exit(0);
}
/* 층도 **저장으로** 만든다 — 자산과 같은 문(커밋)이다. */
let floor = wc0.floors[0];
if (!floor) {
  floor = { id: crypto.randomUUID(), name: '1층' };
  await call(`/substations/${substation.id}/commit`, 'PUT', {
    floors: { creates: [{ id: floor.id, name: floor.name, sortOrder: 0 }] },
  });
}

/* 반 셋 + 충전기 한 대 + 부하가 될 설비들. 부하는 실물처럼 **여러 대에 흩어져** 있어야
   계통 표에서 「이 회로가 어디로 나가는가」가 국 전체를 가리키는지 확인할 수 있다. */
const boards = place(boardAssembly, '분전반', floor.id, 40, 40);
const charger = place(assemblyByName['전원설비'], '충전기반', floor.id, 140, 40);
const LOAD_SETS = 6;
const loads = Array.from({ length: LOAD_SETS }, (_, i) =>
  place(assemblyByName['송변전광단말장치'], `송광치 #${i + 1}`, floor.id, 240 + i * 100, 40));

await call(`/substations/${substation.id}/commit`, 'PUT', {
  assets: { creates: [boards, charger, ...loads].flatMap((p) => p.creates) },
});

/** 전원 케이블 종류 — 이름이 아니라 **매체가 전원인 그룹**에서 고른다. */
const powerGroup = catalog.cableGroups.find((g) => g.key === 'power');
const POWER_CABLE = powerGroup.categories[0].id;

const wire = (aPortId, bPortId, voltage) => ({
  id: crypto.randomUUID(), aPortId, bPortId, categoryId: POWER_CABLE,
  specParams: { voltage, lengthM: 5 },
});

/** 부하가 될 포트들 — 여러 설비의 전원 입력을 차례로 꺼내 쓴다. */
/* 부하도 **갈래를 가려서** 집는다 — 직류 회로에 교류 입력을 물릴 수 없다(연결 검증이 막는다). */
const loadPorts = loads.flatMap((l) => l.powerIns);
const used = new Set();
const takeLoad = (variant) => {
  const hit = loadPorts.find((p) => !used.has(p.id) && p.variant === variant);
  if (!hit) throw new Error(`부하로 쓸 ${variant} 전원 입력이 모자랍니다 — 부하 설비를 더 놓으세요`);
  used.add(hit.id);
  return hit.id;
};
/** 반의 회로/입력 — 부품 · 그룹 · 번호로 짚는다. */
const at = (placed, part, group, i = 1) => {
  const id = placed.ports.get(`${part}|${group}|${i}`);
  if (!id) throw new Error(`포트를 찾을 수 없습니다: ${part} ${group} ${i}`);
  return id;
};

const cables = [
  /* 소내전원반 : 밖에서 받는다(입력 미결선) → UPS·충전기를 먹이고 남는 회로는 부하로. */
  wire(at(boards, '소내전원반', 'POWER-OUT-AC', 1), at(boards, 'UPS', 'POWER-IN-AC'), AC_3P),
  wire(at(boards, '소내전원반', 'POWER-OUT-AC', 2), at(charger, '충전기', 'POWER-IN-AC'), AC_3P),
  ...[3, 4, 5, 6].map((n) => wire(at(boards, '소내전원반', 'POWER-OUT-AC', n), takeLoad('AC'), AC_1P)),

  /* UPS : 열 회로 중 일곱을 쓴다 — 나머지는 예비(SPARE)로 남는다. */
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => wire(at(boards, 'UPS', 'POWER-OUT-AC', n), takeLoad('AC'), AC_1P)),

  /* DC 48V : **충전기에서 받는다** — 대장의 「#1 충전기 : DC 48V #1」 그 줄이다. */
  wire(at(charger, '충전기', 'POWER-OUT-DC', 1), at(boards, 'DC 48V', 'POWER-IN-DC'), DC),
  ...Array.from({ length: CIRCUITS }, (_, i) =>
    wire(at(boards, 'DC 48V', 'POWER-OUT-DC', i + 1), takeLoad('DC'), DC)),
];

await call(`/substations/${substation.id}/commit`, 'PUT', { cables: { creates: cables } });

console.log(
  `[seed-power] ${SUB_NAME}: 반 3개(각 ${CIRCUITS}회로) · 충전기반 · 부하 설비 ${loads.length}대 · 전원케이블 ${cables.length}가닥\n` +
  `             소내전원반 → UPS·충전기 / 충전기 → DC 48V → 부하 ${CIRCUITS}회로`,
);
