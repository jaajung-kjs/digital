import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, openStation } from './helpers';

/**
 * ④ 전원 계통 한 바퀴 — (구)춘천S/S 시드(`jikhalInventory.ts` 의 차단기·연결) 위에서.
 *
 * 차단기 대장에서 통신용 분전반 블록 머리의 입력 전원(소내전원반 차단기 4) → 예비 차단기 7 을 부하 설비(PoE 스위치)에
 * 연결·저장 → 부하 칸 이름 → 계통도에서 그 부하가 분전반 아래에 → 교류/직류 거르기 → 상세 패널에서 전원 계통으로
 * (차단기 카드 머리 · 연결 탭 「입력 전원」, 뒤로 가기) → 연결 삭제·저장.
 *
 * 만든 연결은 상대 포트 `E2E-…` 로 표시하고 끝에 삭제한다. 지난 실패가 남긴 것은 시작할 때 먼저 걷는다.
 */

const STATION = '(구)춘천S/S';
const PANEL = '통신용 분전반';
const LOAD = 'PoE 스위치';
const PREFIX = 'E2E';
const PORT = `${PREFIX}-AC`;
/** 시드 — 통신용 분전반 차단기 7 은 SPARE · 교류 · 30A, 부하 없음. 차단기 20 은 직류 → PIA. */
const SPARE_NO = 7;

const main = (page: Page) => page.getByTestId('v2-main');
const detail = (page: Page) => main(page).getByRole('complementary');
const saveButton = (page: Page) => page.getByRole('button', { name: '저장', exact: true });
const changeCount = async (page: Page) => {
  if ((await page.getByText(/^변경 \d+건 · /).count()) === 0) return 0;
  const text = await page.getByText(/^변경 \d+건 · /).innerText();
  return Number(/변경 (\d+)건/.exec(text)![1]);
};

async function save(page: Page) {
  await expect(page.getByRole('alert')).toHaveCount(0);
  const n = await changeCount(page);
  await saveButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: `변경 ${n}건을 저장했습니다` })).toBeVisible();
  await expect(saveButton(page)).toHaveCount(0);
}

const blocks = (page: Page) => main(page).getByTestId('ledger-block');
const blockOf = (page: Page, name: string) => main(page).locator(`[data-testid="ledger-block"][aria-label="${name}"]`);
const row = (block: Locator, no: number) => block.getByTestId(`ledger-row-${no}`);
const cell = (block: Locator, no: number, col: string) => row(block, no).locator(`[data-col="${col}"]`);
const treeRows = (page: Page) => main(page).getByRole('tree', { name: '계통도' }).getByTestId('tree-breaker');

async function openPower(page: Page) {
  await main(page).getByRole('tab', { name: '전원 계통' }).click();
  await main(page).getByRole('radio', { name: '차단기 대장' }).click(); // 보기(power)는 주소에 남는다 — 대장으로
  await expect(blocks(page).first()).toBeVisible();
}

/** 연결 탭에서 포트(이 설비 쪽 표기)가 E2E 인 연결을 삭제한다 — 변경안으로 남는다. */
async function dropE2ELinks(page: Page) {
  await detail(page).getByRole('tab', { name: '연결' }).click();
  const mine = detail(page).getByTestId('link-near').filter({ hasText: PREFIX });
  for (let guard = 0; guard < 5 && (await mine.count()) > 0; guard++) {
    const line = mine.first().locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await line.hover();
    await line.getByRole('button', { name: '연결 삭제' }).click();
    /* 설비 상세의 연결 삭제도 선번장처럼 묻는다(삭제 확인 규칙). */
    await page.getByRole('alertdialog', { name: '연결 삭제' }).getByRole('button', { name: '삭제' }).click();
  }
  await expect(mine).toHaveCount(0);
}

/** 지난 실패가 남긴 E2E 연결(대장의 포트 칸이 E2E)을 걷는다 — 부하 설비 상세의 연결 탭에서. 없으면 저장하지 않는다. */
async function sweepLeftovers(page: Page) {
  const ports = main(page).locator('[data-testid="ledger-block"] [data-col="port"]').filter({ hasText: PREFIX });
  for (let guard = 0; guard < 5 && (await ports.count()) > 0; guard++) {
    await ports.first().locator('xpath=..').locator('[data-col="load"] button').click();
    await dropE2ELinks(page);
    await detail(page).getByRole('tab', { name: '정보' }).click();
  }
  if ((await changeCount(page)) > 0) await save(page);
}

test('④ 전원 계통 한 바퀴 — (구)춘천 분전반의 예비 차단기에 부하를 연결하고 대장·계통도·상세에서 본다', async ({ page }) => {
  // 1. 로그인 → 강원본부 › 직할 › (구)춘천S/S → 전원 계통(차단기 대장), 지난 잔재 걷기
  await login(page);
  await openStation(page, '강원본부', '직할', STATION);
  await openPower(page);
  await expect(main(page).getByRole('radio', { name: '차단기 대장' })).toBeChecked();
  await sweepLeftovers(page);
  expect(await changeCount(page)).toBe(0);

  // 2. 분전반 블록 머리 — 차단기 22, 입력 전원은 소내전원반 차단기 4(교류). 충전기·UPS 출력에서 받는 입력도 교류/직류별로 선다.
  //    교류·직류를 함께 받으니 차단기는 모선으로 묶인다 — 교류 모선(1–12) · 직류 모선(13–22)
  const panel = blockOf(page, PANEL);
  await expect(panel).toHaveCount(1);
  const panelId = (await panel.getAttribute('data-equipment'))!;
  const head = panel.getByTestId('ledger-block-head');
  await expect(head).toContainText(`${PANEL}· 차단기 22`);
  await expect(head).toContainText('교류 입력: 소내전원반 차단기 4');
  await expect(head).toContainText('직류 입력: 충전기 #2 차단기 1');
  const busHeads = panel.getByTestId('ledger-bus-head');
  await expect(busHeads).toHaveCount(2);
  await expect(busHeads.nth(0)).toContainText('교류 모선 · 입력: 소내전원반 차단기 4');
  await expect(busHeads.nth(1)).toHaveText('직류 모선 · 입력: 충전기 #2 차단기 1');
  //    시드 부하 — 차단기 1 → 충전기 #2, 20(직류) → PIA. 7 은 예비
  await expect(cell(panel, 1, 'load')).toHaveText('충전기 #2');
  await expect(cell(panel, 20, 'load')).toHaveText('PIA');
  await expect(cell(panel, 20, 'current')).toHaveText('직류');
  await expect(cell(panel, SPARE_NO, 'label')).toHaveText('SPARE');
  await expect(cell(panel, SPARE_NO, 'load')).toContainText('—'); // 부하 없음은 「—」(편집 창과 같은 꼴)

  // 3. 예비 차단기 7 → 「연결」 → 부하 설비 PoE 스위치(상대 포트 E2E-AC · F-CV · 5 m) → 저장
  await row(panel, SPARE_NO).hover();
  await cell(panel, SPARE_NO, 'load').getByRole('button', { name: '연결', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '연결 추가' });
  await expect(dialog).toContainText(`기준 설비: ${PANEL} 차단기 ${SPARE_NO}`);
  await dialog.getByRole('textbox', { name: '접속 설비 검색' }).fill('PoE');
  await dialog.getByRole('button', { name: LOAD, exact: true }).click();
  await dialog.getByRole('textbox', { name: '상대 포트' }).fill(PORT);
  await dialog.getByRole('combobox', { name: '케이블 품목' }).selectOption({ label: 'F-CV 전력케이블' });
  await dialog.getByRole('textbox', { name: '길이' }).fill('5');
  await dialog.getByRole('button', { name: '연결', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => changeCount(page)).toBe(1);
  await save(page);

  // 4. 부하 칸 = 그 설비 이름, 포트 · 전원케이블 · 길이가 같은 줄에
  await expect(cell(panel, SPARE_NO, 'load')).toHaveText(LOAD);
  await expect(cell(panel, SPARE_NO, 'port')).toHaveText(PORT);
  await expect(cell(panel, SPARE_NO, 'cable')).toHaveText('F-CV 전력케이블');
  await expect(cell(panel, SPARE_NO, 'length')).toHaveText('5');

  // 5. 계통도 — 그 부하가 분전반 아래(소내전원반 → 차단기 4 → 통신용 분전반 → 차단기 7 → PoE 스위치)
  await main(page).getByRole('radio', { name: '계통도' }).click();
  await expect(page).toHaveURL(/[?&]power=tree/);
  const panelRow = main(page).locator(`[data-testid="tree-breaker"][data-anchor="${panelId}"][data-bus="AC"]`);
  await expect(panelRow).toHaveCount(1);
  await expect(panelRow).toContainText(`차단기 4 · A.C L18`);
  await expect(panelRow).toContainText(PANEL);
  await expect(panelRow.getByTestId('tree-bus')).toHaveText('교류 모선');
  const panelKey = (await panelRow.getAttribute('data-key'))!;
  const panelLevel = Number(await panelRow.getAttribute('aria-level'));
  const loadRow = treeRows(page).filter({ hasText: `차단기 ${SPARE_NO} · SPARE · 30 A · 교류` }).filter({ hasText: LOAD });
  await expect(loadRow).toHaveCount(1);
  await expect(loadRow).toHaveAttribute('data-key', `${panelKey}/${SPARE_NO}`);
  await expect(loadRow).toHaveAttribute('aria-level', String(panelLevel + 1));
  //    입력 전원 미지정 — 흐린 말(경고 아님)
  await expect(main(page).getByTestId('tree-equipment').filter({ hasText: '소내전원반' })).toContainText('입력 전원 미지정');
  //    충전기 #2 직류 차단기 1 → 분전반 직류 모선(순환이 아니다) — 그 아래에 직류 부하(PIA)
  const dcBus = treeRows(page).filter({ hasText: '차단기 1 · SID-125 1 · 직류' });
  await expect(dcBus.getByTestId('tree-bus')).toHaveText('직류 모선');
  await expect(dcBus.getByText('상위 설비 공급')).toHaveCount(0);
  await expect(dcBus).toHaveAttribute('data-bus', 'DC');
  const dcKey = (await dcBus.getAttribute('data-key'))!;
  await expect(treeRows(page).filter({ hasText: '차단기 20 · PIA' })).toHaveAttribute('data-key', `${dcKey}/20`);
  //    UPS 교류 출력 → 분전반 교류 모선 — 같은 교류 모선으로 다시 공급되는 계통은 흐린 「상위 설비 공급」
  await expect(treeRows(page).filter({ hasText: '소형 UPS 1' }).getByText('상위 설비 공급')).toBeVisible();

  // 6. 교류/직류 거르기 — 직류면 PoE(교류) 줄이 빠지고 PIA(직류)가 서며, 교류면 그 반대
  const filter = main(page).getByRole('combobox', { name: '교류/직류' });
  const piaRow = treeRows(page).filter({ hasText: '차단기 20 · PIA' });
  await filter.selectOption({ label: '직류' });
  await expect(loadRow).toHaveCount(0);
  await expect(piaRow).toHaveCount(1);
  await filter.selectOption({ label: '교류' });
  await expect(loadRow).toHaveCount(1);
  await expect(piaRow).toHaveCount(0);
  await filter.selectOption({ label: '교류/직류 전체' });
  await expect(loadRow).toHaveCount(1);
  await expect(piaRow).toHaveCount(1);

  // 7. 상세 패널에서 전원 계통으로 — 현황에서 분전반을 열고 차단기 카드 머리의 「차단기 대장에서 보기」
  await main(page).getByRole('tab', { name: '현황' }).click();
  await main(page).getByRole('radio', { name: '랙별' }).click();
  await main(page).getByRole('row').filter({ hasText: PANEL }).last().click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
  const breakerCard = detail(page).locator('[data-detail-head]', { hasText: /^차단기22/ }).locator('xpath=..');
  await breakerCard.getByRole('button', { name: '차단기 대장에서 보기' }).click();
  const focused = blocks(page).and(page.locator('[aria-current="true"]'));
  const landed = async () => {
    await expect(main(page).getByRole('tab', { name: '전원 계통' })).toHaveAttribute('aria-selected', 'true');
    await expect(main(page).getByRole('radio', { name: '차단기 대장' })).toBeChecked(); // 계통도에서 왔어도 블록이 있는 대장으로
    await expect(focused).toHaveCount(1);
    await expect(focused).toHaveAttribute('aria-label', PANEL);
    await expect(focused.getByTestId('ledger-block-head')).toBeInViewport();
    await expect(detail(page).getByText(PANEL, { exact: true }).first()).toBeVisible(); // 상세는 그대로 선다(보던 탭 그대로)
    //    이미 그 블록을 보고 있으면 길을 두지 않는다
    await expect(detail(page).getByRole('button', { name: '차단기 대장에서 보기' })).toHaveCount(0);
  };
  await landed();
  //    뒤로 가기는 떠나 온 현황 상세로
  await page.goBack();
  await expect(main(page).getByRole('tab', { name: '현황' })).toHaveAttribute('aria-selected', 'true');
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);

  //    연결 탭 「입력 전원」 묶음 머리 — 같은 길
  await detail(page).getByRole('tab', { name: '연결' }).click();
  const feeds = detail(page).getByRole('region', { name: '입력 전원' });
  await expect(feeds.getByTestId('link-far').filter({ hasText: '소내전원반 차단기 4' })).toHaveCount(1);
  await expect(detail(page).getByRole('region', { name: '부하' }).getByRole('button', { name: '차단기 대장에서 보기' })).toHaveCount(0);
  await feeds.getByRole('button', { name: '차단기 대장에서 보기' }).click();
  await landed();
  await page.goBack();
  await expect(main(page).getByRole('tab', { name: '현황' })).toHaveAttribute('aria-selected', 'true');

  // 8. 정리 — 대장에서 부하 이름을 눌러 그 설비 상세 → 연결 탭에서 E2E 연결 삭제 → 차단기 7 은 다시 예비 → 저장
  await openPower(page);
  await cell(panel, SPARE_NO, 'load').getByRole('button', { name: LOAD }).click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(LOAD);
  await dropE2ELinks(page);
  await expect(cell(panel, SPARE_NO, 'load')).toContainText('—'); // 부하 없음은 「—」(편집 창과 같은 꼴)
  /* 포트는 레일이 서면 부하 칸 뒤로 병합되거나(§1.7-e2) 블록 안에서 비면 열째 숨는다 — 줄 전체에 남지 않았는지 본다. */
  await expect(panel.getByTestId(`ledger-row-${SPARE_NO}`)).not.toContainText(PREFIX);
  await expect.poll(() => changeCount(page)).toBe(1);
  await save(page);
  await expect(main(page).locator('[data-testid="ledger-block"] [data-col="port"]').filter({ hasText: PREFIX })).toHaveCount(0);
});
