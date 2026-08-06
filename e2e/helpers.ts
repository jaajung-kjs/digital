import { expect, type Page } from '@playwright/test';

/** 시드 관리자 계정 — 개발 DB 기준. */
export const ADMIN = { username: 'admin', password: 'admin123' };

export async function login(page: Page) {
  await page.goto('/');
  // 이미 로그인돼 있으면 로그인 화면이 뜨지 않는다.
  const password = page.locator('input[type=password]');
  if (await password.count()) {
    await page.locator('input').first().fill(ADMIN.username);
    await password.fill(ADMIN.password);
    await page.getByRole('button', { name: /접속|로그인/ }).click();
  }
  await expect(page.getByRole('link', { name: '자산 카탈로그' })).toBeVisible();
}

/** 조직 트리에서 노드를 고른다(트리 항목은 버튼이 아니라 행 전체가 클릭 대상이다). */
export async function selectOrgNode(page: Page, name: string) {
  await page.getByTestId('v2-org-tree').getByText(name, { exact: true }).click();
  await expect(page.getByTestId('v2-selected')).toHaveText(name);
}

/** 변전소 뷰 탭 전환. */
export async function switchView(page: Page, view: '현황' | '평면도' | '선번장' | '계통') {
  await page.getByRole('tab', { name: view, exact: true }).click();
}

/**
 * 캔버스 위에서 드래그로 영역을 그린다 — 배치 도구가 "드래그로 영역 지정" 방식이라
 * 단순 클릭으로는 자산이 놓이지 않는다.
 */
export async function dragOnCanvas(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const canvas = page.getByTestId('floorplan-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('평면도 캔버스를 찾지 못했습니다');
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 12 });
  await page.mouse.up();
}

/** 저장 대기 중인 변경을 커밋한다. */
export async function commitChanges(page: Page) {
  const save = page.getByRole('button', { name: /저장/ }).first();
  await expect(save).toBeVisible();
  await save.click();
}

/**
 * 평면도 캔버스에 그려진 자산을 클릭한다.
 *
 * 캔버스는 그림이라 셀렉터가 없다. 기본 뷰포트(zoom 100 · pan 0)에서는
 * `screenToWorld` 가 항등에 가까워 **월드 좌표 = 캔버스 상대 좌표**이므로,
 * 서버에서 자산 좌표를 받아 그 중심을 클릭하면 된다.
 * (테스트 때문에 앱 코드에 좌표 노출 훅을 심지 않기 위한 선택.)
 */
export async function clickAssetOnCanvas(page: Page, substationId: string, assetName: string) {
  const canvas = page.getByTestId('floorplan-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('평면도 캔버스를 찾지 못했습니다');

  const pos = await page.evaluate(
    async ([subId, name]) => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/v2/substations/${subId}/workingcopy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const a = (data.assets ?? []).find((x: { name: string }) => x.name === name);
      if (!a || a.x == null) return null;
      return { x: a.x + (a.width ?? 40) / 2, y: a.y + (a.height ?? 40) / 2 };
    },
    [substationId, assetName] as const,
  );
  if (!pos) throw new Error(`평면도에서 '${assetName}' 의 좌표를 찾지 못했습니다`);
  await page.mouse.click(box.x + pos.x, box.y + pos.y);
}

/** 현재 선택된 변전소의 id — 워킹카피 스토어가 아니라 URL/스토어 대신 API 목록에서 찾는다. */
export async function substationIdByName(page: Page, name: string): Promise<string> {
  const id = await page.evaluate(async (n) => {
    const token = localStorage.getItem('accessToken');
    const res = await fetch('/api/v2/org-tree', { headers: { Authorization: `Bearer ${token}` } });
    const tree = await res.json();
    for (const hq of tree.headquarters ?? [])
      for (const br of hq.branches ?? [])
        for (const sub of br.substations ?? []) if (sub.name === n) return sub.id as string;
    return null;
  }, name);
  if (!id) throw new Error(`변전소 '${name}' 를 찾지 못했습니다`);
  return id;
}

/**
 * 이 테스트가 만든 것만 되돌린다.
 *
 * 개발 DB 를 공유하므로 "전부 지우기" 는 위험하다 — 실행이 만든 자산·케이블의 id 만
 * 받아서 지운다. 중간에 실패해도 다음 실행이 깨지지 않게 하는 것이 목적이다.
 */
export async function deleteEntities(
  page: Page,
  substationId: string,
  ids: { assets?: string[]; cables?: string[] },
) {
  await page.evaluate(
    async ([subId, assetIds, cableIds]) => {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const wc = await (await fetch(`/api/v2/substations/${subId}/workingcopy`, { headers })).json();
      const byId = new Map<string, string>();
      for (const a of wc.assets ?? []) byId.set(a.id, a.updatedAt);
      for (const c of wc.cables ?? []) byId.set(c.id, c.updatedAt);
      const live = (list: string[]) => list.filter((id) => byId.has(id));
      const assets = live(assetIds);
      const cables = live(cableIds);
      if (!assets.length && !cables.length) return;
      const baseVersions: Record<string, string> = {};
      for (const id of [...assets, ...cables]) baseVersions[id] = byId.get(id)!;
      const res = await fetch(`/api/v2/substations/${subId}/commit`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          baseVersions,
          assets: { creates: [], updates: [], deletes: assets },
          cables: { creates: [], updates: [], deletes: cables },
        }),
      });
      // 응답을 보지 않으면 커밋이 거절돼도 조용히 지나가고 잔재가 DB 에 쌓인다.
      if (!res.ok) throw new Error(`정리 커밋 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
    [substationId, ids.assets ?? [], ids.cables ?? []] as const,
  );
}

/** 현재 저장된 케이블 id 목록 — 테스트가 만든 것을 식별하는 데 쓴다. */
export async function currentCableIds(page: Page, substationId: string): Promise<string[]> {
  return page.evaluate(async (subId) => {
    const token = localStorage.getItem('accessToken');
    const wc = await (
      await fetch(`/api/v2/substations/${subId}/workingcopy`, { headers: { Authorization: `Bearer ${token}` } })
    ).json();
    return (wc.cables ?? []).map((c: { id: string }) => c.id);
  }, substationId);
}

/**
 * 이전 실행이 남긴 잔재를 치운다 — 테스트 **시작 시** 부른다.
 *
 * 정리를 마지막 단계에만 두면, 중간에 실패했을 때 잔재가 남아 다음 실행이 연달아
 * 깨진다(실제로 그렇게 됐다: 포트가 이미 점유돼 두 번째 끝점을 고를 수 없었다).
 * 지우는 대상은 이 테스트가 쓰는 것으로 한정한다 — 이름이 `E2E자산` 으로 시작하는
 * 자산과, 테스트가 잇는 두 장비(통합단말-1·SCADA RTU-1)에 걸린 케이블.
 */
export async function resetE2eLeftovers(page: Page, substationId: string, endpointAssetNames: string[]) {
  await page.evaluate(
    async ([subId, names]) => {
      const token = localStorage.getItem('accessToken');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const wc = await (await fetch(`/api/v2/substations/${subId}/workingcopy`, { headers })).json();

      const assets = (wc.assets ?? []) as { id: string; name: string; updatedAt: string; ports?: { id: string }[] }[];
      const targetPortIds = new Set(
        assets.filter((a) => names.includes(a.name)).flatMap((a) => (a.ports ?? []).map((p) => p.id)),
      );
      const deadAssets = assets.filter((a) => a.name.startsWith('E2E자산'));
      const deadCables = ((wc.cables ?? []) as { id: string; aPortId: string; bPortId: string; updatedAt: string }[])
        .filter((c) => targetPortIds.has(c.aPortId) || targetPortIds.has(c.bPortId));
      if (!deadAssets.length && !deadCables.length) return;

      const baseVersions: Record<string, string> = {};
      for (const a of deadAssets) baseVersions[a.id] = a.updatedAt;
      for (const c of deadCables) baseVersions[c.id] = c.updatedAt;
      const res = await fetch(`/api/v2/substations/${subId}/commit`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          baseVersions,
          assets: { creates: [], updates: [], deletes: deadAssets.map((a) => a.id) },
          cables: { creates: [], updates: [], deletes: deadCables.map((c) => c.id) },
        }),
      });
      if (!res.ok) throw new Error(`잔재 정리 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
    [substationId, endpointAssetNames] as const,
  );
}

/**
 * 이전 실행이 남긴 E2E 타입을 지운다.
 *
 * 타입 삭제는 그 타입을 쓰는 자산이 없어야 통과하므로, 자산 정리(resetE2eLeftovers) 뒤에
 * 부른다. 중간에 실패한 실행의 타입이 카탈로그에 계속 쌓이던 것을 막는다.
 */
export async function resetE2eTypes(page: Page) {
  await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken');
    const headers = { Authorization: `Bearer ${token}` };
    const cat = await (await fetch('/api/v2/catalog', { headers })).json();
    const dead = (cat.types ?? []).filter((t: { name: string }) => t.name.startsWith('E2E장비'));
    for (const t of dead) {
      const res = await fetch(`/api/v2/catalog/types/${t.id}`, { method: 'DELETE', headers });
      // 자산이 물려 있으면 409 가 정상이다 — 그 외 실패는 드러나야 한다.
      if (!res.ok && res.status !== 409) {
        throw new Error(`타입 정리 실패 ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
    }
  });
}
