import { expect, test, type Page } from '@playwright/test';
import { login, openStation, selectStation } from './helpers';

/**
 * ② 현황 한 바퀴 — 북춘천S/S 시드(`npm run db:next:seed`) 위에서.
 *
 * 품목별·랙별 현황 → 차단기 요약·편집 창 → 랙·설비 추가 → 잇기 → 국을 옮겨도 쌓이는 변경안 →
 * 평면도 배치 → 저장·새로고침 → 삭제 펼침(함께 지워지는 연결) → 차단기 갈래 → 품목 관리.
 *
 * 만든 것은 끝에 지운다. 지난 실패가 남긴 `E2E` 이름의 랙·설비는 시작할 때 먼저 걷는다.
 */

const STATION = '북춘천S/S';
const PANEL = '통신용 분전반';
const PREFIX = 'E2E';

const main = (page: Page) => page.getByTestId('v2-main');
const detail = (page: Page) => main(page).getByRole('complementary');
const saveButton = (page: Page) => page.getByRole('button', { name: '저장', exact: true });
const changeCount = async (page: Page) => {
  if ((await page.getByText(/^변경 \d+건 · /).count()) === 0) return 0;
  const text = await page.getByText(/^변경 \d+건 · /).innerText();
  return Number(/변경 (\d+)건/.exec(text)![1]);
};
const breakerEditor = (page: Page) => page.getByRole('dialog', { name: `차단기 — ${PANEL}` });

async function save(page: Page) {
  await expect(page.getByRole('alert')).toHaveCount(0); // 저장 바에 흠 문구가 없어야 한다
  const n = await changeCount(page);
  await saveButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: `변경 ${n}건을 저장했습니다` })).toBeVisible();
  await expect(saveButton(page)).toHaveCount(0);
}

async function openEquipment(page: Page, name: string) {
  await main(page).getByRole('row').filter({ hasText: name }).last().click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(name);
}


/** 차단기 편집 창을 연다 — 상세 패널 차단기 카드의 「편집」. */
async function openBreakers(page: Page) {
  await detail(page).getByRole('tab', { name: '정보' }).click();
  await detail(page).getByRole('button', { name: '편집', exact: true }).click();
  await expect(breakerEditor(page)).toBeVisible();
  return breakerEditor(page);
}

/**
 * 지난 실패가 남긴 E2E 랙·설비를 걷는다 — 랙별 표에서 이름으로 찾아 설비 먼저(연결은 함께 간다), 그다음 랙.
 * 남은 것이 없으면 아무것도 저장하지 않는다.
 */
async function sweepLeftovers(page: Page) {
  await main(page).getByRole('radio', { name: '랙별' }).click();
  // 검색은 쓰지 않는다 — 검색은 설비 행을 거르므로 빈 랙은 걸리지 않는다.
  const rows = main(page).getByRole('row').filter({ hasText: new RegExp(`^${PREFIX}`) });
  for (let guard = 0; guard < 20 && (await rows.count()) > 0; guard++) {
    // 설비 행(들여쓴 행)이 있으면 그것부터 — 맨 뒤 행이 늘 가장 안쪽이다.
    await rows.last().click();
    const isRack = (await detail(page).getByText(/^실장 설비 \d+/).count()) > 0;
    await detail(page).getByRole('button', { name: isRack ? '랙 삭제' : '설비 삭제' }).click();
    const confirm = page.getByRole('alertdialog', { name: isRack ? '랙 삭제' : '설비 삭제' });
    await confirm.getByRole('button', { name: '삭제' }).click();
    await expect(confirm).toHaveCount(0);
  }
  if ((await changeCount(page)) > 0) await save(page);
  await main(page).getByRole('radio', { name: '품목별' }).click();
}

test('② 현황 한 바퀴 — 북춘천에서 변경안을 쌓아 저장하고 지운다', async ({ page }) => {
  // 1. 로그인 → 강원본부 › 직할 › 북춘천S/S, 지난 잔재 걷기
  await login(page);
  await openStation(page, '강원본부', '직할', STATION);
  await sweepLeftovers(page);
  expect(await changeCount(page)).toBe(0);

  // 2. 품목별 — 송변전광단말장치·분전반 행, 개수 1 이상. 도구줄에 상태 거르개는 Select 하나
  await expect(main(page).getByRole('radio', { name: '품목별' })).toBeChecked();
  await expect(main(page).getByRole('combobox', { name: '상태' })).toHaveValue('');
  for (const typeName of ['송변전광단말장치', '분전반']) {
    const row = main(page).getByRole('row', { name: new RegExp(`^${typeName} 펼치기 `) });
    await expect(row).toBeVisible();
    expect(Number(await row.getByRole('cell').nth(1).innerText())).toBeGreaterThanOrEqual(1);
  }

  // 3. 랙별 — 「통신용 분전반」 은 일체형(랙 하나에 같은 이름 설비 하나)이라 행 하나. 상세에 차단기 요약, 편집 창에 같은 수
  await main(page).getByRole('radio', { name: '랙별' }).click();
  const panelRows = main(page).getByRole('row').filter({ hasText: PANEL });
  await expect(panelRows).toHaveCount(1);
  await expect(panelRows).toContainText('분전반 · 분전반함'); // 설비 품목 · 랙 품목
  await panelRows.click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
  const header = await detail(page).getByText(/^차단기 \d+$/).innerText();
  const breakers = Number(header.replace('차단기 ', ''));
  expect(breakers).toBeGreaterThan(2);
  let editor = await openBreakers(page);
  await expect(editor.getByTestId('circuit-no')).toHaveCount(breakers);

  //    차단기 추가 → 끝에 빈 줄 하나(편집 창이 그 줄로 연다) → 「차단기 n 지우기」 → 원래 수. 제자리로 돌아왔으니 변경 0건
  await editor.getByRole('button', { name: '차단기 추가' }).click();
  await expect(editor.getByTestId('circuit-no')).toHaveCount(breakers + 1);
  await expect(editor.getByTestId(`circuit-row-${breakers + 1}`)).toHaveAttribute('aria-current', 'true');
  await editor.getByRole('button', { name: `차단기 ${breakers + 1} 삭제` }).click();
  await expect(editor.getByTestId('circuit-no')).toHaveCount(breakers);
  await expect(editor.getByText('수정한 내용은 상단 「저장」을 눌러야 반영됩니다')).toBeVisible();
  await editor.getByRole('button', { name: '완료' }).click();
  await expect(editor).toHaveCount(0);
  expect(await changeCount(page)).toBe(0);
  //    차단기가 있는 설비에는 정보 카드 끝 「차단기 추가」도 ⋯ 메뉴도 없다 — 더하는 길은 차단기 카드 머리의 「차단기 추가」 하나
  await expect(detail(page).getByRole('button', { name: '더 보기' })).toHaveCount(0);
  await expect(detail(page).getByRole('button', { name: '차단기 추가' })).toHaveCount(1);

  // 4. 랙 추가 → 설비 추가(개수 칸 없음)
  await main(page).getByRole('button', { name: '랙 추가' }).click();
  let dialog = page.getByRole('dialog', { name: '랙 추가' });
  await dialog.getByRole('textbox', { name: '이름' }).fill('E2E랙');
  await dialog.getByRole('combobox', { name: '랙 품목' }).selectOption({ label: '19인치 통신랙' });
  await dialog.getByRole('button', { name: '추가' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('E2E랙');
  await expect(detail(page).getByText('실장 설비 0')).toBeVisible();

  await main(page).getByRole('button', { name: '설비 추가' }).first().click();
  dialog = page.getByRole('dialog', { name: '설비 추가' });
  await expect(dialog.getByRole('spinbutton')).toHaveCount(0);
  await expect(dialog.getByText(/개수|수량/)).toHaveCount(0);
  await dialog.getByRole('textbox', { name: '이름' }).fill('E2E L3');
  await dialog.getByRole('combobox', { name: '설비 품목' }).selectOption({ label: 'L3 스위치' });
  await dialog.getByRole('combobox', { name: '랙' }).selectOption({ label: 'E2E랙' });
  await dialog.getByRole('button', { name: '추가' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('E2E L3');

  // 5. 잇기 — 분전반 차단기 2, F-CV. 연결 목록은 두 줄: 상대 끝(진하게) · 케이블
  await detail(page).getByRole('tab', { name: '연결' }).click();
  await detail(page).getByRole('button', { name: '연결 추가', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '연결 추가' });
  await dialog.getByRole('textbox', { name: '접속 설비 검색' }).fill('분전반');
  const breaker2 = dialog.getByRole('button', { name: `${PANEL} 차단기 2`, exact: true });
  await breaker2.click();
  await expect(breaker2).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('combobox', { name: '케이블 품목' }).selectOption({ label: 'F-CV 전력케이블' });
  await dialog.getByRole('button', { name: '연결', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const links = detail(page).getByRole('tabpanel', { name: '연결' });
  await expect(links.getByTestId('link-far')).toHaveText(`${PANEL} 차단기 2`);
  await expect(links.getByTestId('link-near')).toHaveText('F-CV 전력케이블');

  // 6. 국을 옮겼다 돌아와도 변경안이 그대로
  const before = await changeCount(page);
  expect(before).toBeGreaterThanOrEqual(3);
  await selectStation(page, '춘천H/P');
  expect(await changeCount(page)).toBe(before);
  await selectStation(page, STATION);
  expect(await changeCount(page)).toBe(before);

  // 7. 평면도 — 첫 층에 E2E랙 끌어 놓기(랙 이름은 랙 안에 그린다 — 캔버스라 글자는 못 본다)
  await main(page).getByRole('tab', { name: '평면도' }).click();
  await expect(main(page).getByRole('button', { name: '도면' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: '층 관리' })).toBeVisible();
  await main(page).getByRole('combobox', { name: '배치할 랙' }).selectOption({ label: 'E2E랙' });
  await main(page).getByRole('button', { name: '배치', exact: true }).click();
  const canvas = page.getByTestId('rackplan-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 120, { steps: 10 });
  await page.mouse.up();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('E2E랙');
  await expect(detail(page).getByText('미배치')).toHaveCount(0);
  await expect(main(page).getByRole('combobox', { name: '배치할 랙' }).getByRole('option', { name: 'E2E랙' })).toHaveCount(0);

  // 8. 저장 → 새로고침 → 남아 있다
  await save(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: STATION })).toBeVisible();
  await main(page).getByRole('tab', { name: '현황' }).click();
  await main(page).getByRole('radio', { name: '랙별' }).click();
  await expect(main(page).getByRole('row').filter({ hasText: 'E2E랙' })).toHaveCount(1);
  await openEquipment(page, 'E2E L3');
  await detail(page).getByRole('tab', { name: '연결' }).click();
  await expect(detail(page).getByTestId('link-far')).toHaveText(`${PANEL} 차단기 2`);

  // 9. E2E L3 지우기 — 연결 1건이 함께 간다(확인 문구에 적힌다)
  await detail(page).getByRole('tab', { name: '정보' }).click();
  await detail(page).getByRole('button', { name: '설비 삭제' }).click();
  const confirm = page.getByRole('alertdialog', { name: '설비 삭제' });
  await expect(confirm).toContainText('함께 삭제됩니다 — 연결 1.');
  await confirm.getByRole('button', { name: '삭제' }).click();
  expect(await changeCount(page)).toBe(2); // 설비 + 연결
  await save(page);
  await expect(main(page).getByRole('row').filter({ hasText: 'E2E L3' })).toHaveCount(0);
  //    분전반 차단기 2 는 다시 비었다 — 편집 창의 연결 칸에 「잇기」가 돌아온다
  await openEquipment(page, PANEL);
  editor = await openBreakers(page);
  await expect(editor.getByTestId('circuit-row-2').getByRole('button', { name: '연결', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: '완료' }).click();

  // 정리 — 빈 E2E랙도 지워 다시 돌릴 수 있게
  await main(page).getByRole('row').filter({ hasText: 'E2E랙' }).click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('E2E랙');
  await detail(page).getByRole('button', { name: '랙 삭제' }).click();
  const rackConfirm = page.getByRole('alertdialog', { name: '랙 삭제' });
  await rackConfirm.getByRole('button', { name: '삭제' }).click();
  await expect(rackConfirm).toHaveCount(0);
  expect(await changeCount(page)).toBe(1);
  await save(page);
  await expect(main(page).getByRole('row').filter({ hasText: 'E2E랙' })).toHaveCount(0);

  // 10. 차단기 갈래를 교류로 — 말(교류)을 고르고 값(AC)이 저장된다(예전에는 「교류」를 실어 400).
  //     교류가 아닌 첫 차단기를 고쳐 저장하고, 원래 값으로 되돌려 다시 저장한다(다시 돌릴 수 있게).
  await openEquipment(page, PANEL);
  editor = await openBreakers(page);
  const currents = editor.getByRole('button', { name: '교류/직류 수정' });
  const texts = await currents.allInnerTexts();
  const idx = texts.findIndex((t) => t.trim() !== '교류');
  expect(idx).toBeGreaterThanOrEqual(0);
  const original = texts[idx]!.trim();
  await currents.nth(idx).click();
  await editor.getByRole('combobox', { name: '교류/직류' }).selectOption({ label: '교류' });
  await expect(currents.nth(idx)).toHaveText('교류');
  expect(await changeCount(page)).toBe(1);
  await editor.getByRole('button', { name: '완료' }).click();
  await save(page);
  await page.reload();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(PANEL);
  editor = await openBreakers(page);
  await expect(editor.getByRole('button', { name: '교류/직류 수정' }).nth(idx)).toHaveText('교류');
  await editor.getByRole('button', { name: '교류/직류 수정' }).nth(idx).click();
  await editor.getByRole('combobox', { name: '교류/직류' }).selectOption({ label: original });
  await editor.getByRole('button', { name: '완료' }).click();
  await save(page);

  // 11. 품목 관리 — 메뉴 하나, 왼쪽 목록에서 고른다. 케이블 품목 17행, 설비 품목에 L3 스위치. 키 열은 없다
  const nav = page.getByRole('navigation', { name: '주요 메뉴' });
  await expect(nav.getByRole('button')).toHaveText(['설비 현황', '품목 관리', '기준정보']);
  await nav.getByRole('button', { name: '품목 관리' }).click();
  await page.getByRole('button', { name: /^케이블 품목\s*\d+$/ }).click();
  await expect(page.getByRole('button', { name: /^케이블 품목\s*\d+$/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('table').getByRole('rowgroup').nth(1).getByRole('row')).toHaveCount(17);
  await expect(page.getByRole('columnheader', { name: '키' })).toHaveCount(0);
  await page.getByRole('button', { name: /^설비 품목\s*\d+$/ }).click();
  await expect(page.getByRole('button', { name: /^설비 품목\s*\d+$/ })).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('row').filter({ hasText: 'L3 스위치' })).toHaveCount(1);

  // 12. 기준정보 — 노임단가 · 제비율 · 올린 기록 탭
  await nav.getByRole('button', { name: '기준정보' }).click();
  await expect(page.getByRole('tab')).toHaveText(['노임단가', '제비율', '등록 이력']);
});
