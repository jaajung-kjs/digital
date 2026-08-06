import { test, expect } from '@playwright/test';
import {
  login,
  selectOrgNode,
  switchView,
  dragOnCanvas,
  clickAssetOnCanvas,
  substationIdByName,
  deleteEntities,
  currentCableIds,
  resetE2eLeftovers,
  resetE2eTypes,
  pickPortInPanel,
} from './helpers';

/**
 * 마스터 스펙의 검증 계획이 요구한 "한 줄기":
 *   타입 정의 → 배치 → 연결 → 추적 → 선번장 → 설계서
 *
 * 이 테스트가 없어서, 단계마다 "완료" 라고 부르면서 실제로는 브라우저에서 확인하지 않은
 * 상태가 반복됐다. 각 단계는 **눈에 보이는 결과**를 단언한다 — 클릭이 성공했다가 아니라
 * 그 클릭으로 화면에 무엇이 생겼는지를 본다.
 */

// 개발 DB 를 공유하므로 실행마다 고유한 이름을 쓴다(충돌·잔재 방지).
const RUN = String(Date.now()).slice(-6);
const TYPE_KEY = `E2E-${RUN}`;
const TYPE_NAME = `E2E장비 ${RUN}`;
const ASSET_NAME = `E2E자산 ${RUN}`;

/** 이 실행이 만든 것 — 마지막 정리 단계가 이것만 지운다. */
const created: { cables: string[] } = { cables: [] };

test.describe.configure({ mode: 'serial' });

// 이전 실행이 중간에 실패했을 수 있다 — 시작 전에 잔재부터 치운다.
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await login(page);
  await selectOrgNode(page, '문막변전소');
  const subId = await substationIdByName(page, '문막변전소');
  await resetE2eLeftovers(page, subId, ['통합단말-1', 'SCADA RTU-1']);
  await resetE2eTypes(page); // 자산을 지운 뒤라야 타입 삭제가 통과한다
  await page.close();
});

test('① 타입 정의 — 새 자산 타입을 만들면 목록에 나타난다', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: '자산 카탈로그' }).click();

  // 타입은 분류 안에 만든다 — 사이드바 머리줄의 + 는 '분류 추가'다.
  await page.getByRole('button', { name: '통신에 타입 추가' }).click();

  await page.getByRole('textbox', { name: '키' }).fill(TYPE_KEY);
  await page.getByRole('textbox', { name: '이름' }).fill(TYPE_NAME);
  await page.getByRole('checkbox', { name: '평면도에 배치 가능' }).check();

  await page.getByRole('button', { name: '저장', exact: true }).click();

  // 저장 결과는 "저장했다" 가 아니라 좌측 목록에 항목이 생겼는지로 확인한다.
  await expect(page.getByRole('button', { name: new RegExp(TYPE_NAME) })).toBeVisible();
});

test('② 배치 — 평면도에 드래그로 놓으면 현황에 자산이 생긴다', async ({ page }) => {
  await login(page);
  await selectOrgNode(page, '문막변전소');
  await switchView(page, '평면도');

  // 배치 도구바는 "[배치] 버튼 + 타입 Select" 다 — ①에서 배치 가능으로 만든 타입이
  // Select 에 나와야 한다.
  await page.getByRole('combobox', { name: '배치할 자산 타입' }).selectOption({ label: TYPE_NAME });
  await page.getByRole('button', { name: '배치', exact: true }).click();

  await dragOnCanvas(page, { x: 420, y: 300 }, { x: 520, y: 380 });

  // 영역을 그리면 이름을 묻는다 — 이름 없이는 추가가 잠긴다.
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('자산 추가')).toBeVisible();
  await modal.getByPlaceholder('자산 이름 입력').fill(ASSET_NAME);
  await modal.getByRole('button', { name: '추가', exact: true }).click();

  // 배치는 워킹카피 스테이징이므로 커밋해야 실제 자산이 된다.
  await page.getByRole('button', { name: /저장/ }).first().click();

  await switchView(page, '현황');
  await expect(page.getByRole('cell', { name: ASSET_NAME })).toBeVisible();
});

test('③ 연결 — 케이블을 이으면 저장 대기 변경이 생긴다', async ({ page }) => {
  await login(page);
  await selectOrgNode(page, '문막변전소');
  const subId = await substationIdByName(page, '문막변전소');
  await switchView(page, '평면도');

  // 케이블 도구를 켜고 네트워크 종류를 고른다.
  await page.getByRole('button', { name: '케이블', exact: true }).click();
  await page.getByRole('combobox', { name: '케이블 종류' }).selectOption({ label: 'UTP/S-FTP케이블' });

  // 평면도에 놓인 자산(통신랙 A)을 클릭하면 그 자산과 **자손**의 빈 포트가 뜬다.
  // 랙 자체에는 포트가 없고, 안에 든 통합단말/SCADA RTU 가 네트워크 포트를 갖는다.
  // 랙을 클릭하면 랙 자신(포트 없음)과 자손 장비들의 포트가 함께 뜬다.
  // 어느 장비의 포트인지 이름으로 지정한다 — "첫 항목"을 두 번 고르면 자기 자신에게
  // 케이블을 잇는 무의미한 연결이 된다(실제로 그렇게 만들어졌다).
  /* 포트 선택은 우측 패널의 매트릭스다 — 타일 라벨은 "포트 1 미연결" 처럼 상태를 포함한다.
     어느 장비의 포트인지는 카드 제목으로 갈린다(랙을 누르면 자손 장비들이 카드로 나열된다). */
  await clickAssetOnCanvas(page, subId, '통신랙 A');
  await pickPortInPanel(page, '통합단말-1', '포트 1');

  await clickAssetOnCanvas(page, subId, '통신랙 A');
  await pickPortInPanel(page, 'SCADA RTU-1', '포트 1');

  // 케이블이 스테이징되면 저장 바가 뜬다 — "클릭했다" 가 아니라 이 결과를 본다.
  await expect(page.getByRole('button', { name: /저장/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /저장/ }).first().click();

  /* 저장이 **끝난 뒤에** 케이블 id 를 읽는다.
     예전에는 버튼을 누른 직후 읽어서 커밋 전 상태(케이블 없음)를 잡았고, 그래서 정리
     단계가 지울 대상을 못 받아 케이블이 DB 에 계속 쌓였다 — 테스트는 통과하는데
     뒷정리만 조용히 실패하는 상태였다. 저장 완료 알림을 신호로 쓴다. */
  await expect(page.getByRole('status')).toBeVisible();
  created.cables = await currentCableIds(page, subId);

  // 커밋 후 연결 탭에서 실제로 케이블이 보여야 한다.
  await switchView(page, '현황');
  await page.getByRole('row', { name: /통합단말/ }).first().click();
  await page.getByRole('tab', { name: /포트/ }).click();
  // 포트 1 의 대국이 SCADA RTU-1 로 보여야 한다 — 케이블이 실제로 붙었다는 증거.
  await expect(page.getByText('SCADA RTU-1').first()).toBeVisible();
});

test('④ 추적 — 연결된 포트에서 추적하면 경로가 나온다', async ({ page }) => {
  await login(page);
  await selectOrgNode(page, '문막변전소');
  await switchView(page, '현황');

  await page.getByRole('row', { name: /통합단말/ }).first().click();
  await page.getByRole('tab', { name: /포트/ }).click();

  /* 포트는 매트릭스 타일이므로 먼저 포트를 고른다 — 타일에는 번호와 상태만 있고
     대국·추적은 고른 포트의 상세에 있다. ③이 이은 케이블 덕분에 [추적] 이 있어야 한다. */
  await page.getByRole('button', { name: /포트 1 (양측|편도)/ }).first().click();
  await page.getByRole('button', { name: '추적' }).click();

  // 결과는 "눌렸다" 가 아니라 경로 카드가 뜨는지로 본다.
  await expect(page.getByText('추적 경로')).toBeVisible();
  await expect(page.getByRole('listitem').first()).toBeVisible();
});

test('⑤ 선번장 — 광 함체의 코어 표가 뜬다', async ({ page }) => {
  await login(page);
  await selectOrgNode(page, '문막변전소');
  await switchView(page, '선번장');

  await expect(page.getByRole('columnheader', { name: '코어' })).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toBeVisible();
});

test('⑥ 설계서 — 변경 공량 미리보기가 열린다', async ({ page }) => {
  await login(page);
  await selectOrgNode(page, '문막변전소');

  await page.getByRole('button', { name: '설계서' }).click();
  await expect(page.getByText('설계서 — 공량 미리보기')).toBeVisible();
});

test('정리 — 이 실행이 만든 자산·케이블·타입을 지운다', async ({ page }) => {
  await login(page);
  await selectOrgNode(page, '문막변전소');
  const subId = await substationIdByName(page, '문막변전소');

  const assetIds = await page.evaluate(
    async ([id, name]) => {
      const token = localStorage.getItem('accessToken');
      const wc = await (
        await fetch(`/api/v2/substations/${id}/workingcopy`, { headers: { Authorization: `Bearer ${token}` } })
      ).json();
      return (wc.assets ?? []).filter((a: { name: string }) => a.name === name).map((a: { id: string }) => a.id);
    },
    [subId, ASSET_NAME] as const,
  );
  await deleteEntities(page, subId, { assets: assetIds, cables: created.cables });

  // 자산이 사라져야 타입 삭제가 통과한다.
  await page.getByRole('link', { name: '자산 카탈로그' }).click();
  const typeBtn = page.getByRole('button', { name: new RegExp(TYPE_NAME) });
  if (!(await typeBtn.count())) return;
  await typeBtn.click();
  const del = page.getByRole('button', { name: '타입 삭제' });
  if (await del.count()) {
    await del.click();
    const confirm = page.getByRole('button', { name: '삭제', exact: true });
    if (await confirm.count()) await confirm.click();
  }
  await expect(page.getByRole('button', { name: new RegExp(TYPE_NAME) })).toHaveCount(0);
});
