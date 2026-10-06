import { expect, test, type Page } from '@playwright/test';
import { login, openStation, selectStation } from './helpers';

/**
 * ② 현황 한 바퀴 — 북춘천S/S 시드(`npm run db:next:seed`) 위에서.
 *
 * 품목별·랙별 현황 → 회로 표 → 랙·설비 추가 → 잇기 → 국을 옮겨도 쌓이는 변경안 →
 * 평면도 배치 → 저장·새로고침 → 삭제 펼침(함께 지워지는 연결) → 품목 관리.
 *
 * 시드를 새로 깐 DB 를 전제로 한다. 끝에 만든 랙을 지워 다시 돌릴 수 있게 둔다.
 */

const STATION = '북춘천S/S';

const main = (page: Page) => page.getByTestId('v2-main');
const detail = (page: Page) => main(page).getByRole('complementary');
const saveButton = (page: Page) => page.getByRole('button', { name: '저장', exact: true });
const changeCount = async (page: Page) => {
  const text = await page.getByText(/^변경 \d+건 · /).innerText();
  return Number(/변경 (\d+)건/.exec(text)![1]);
};

async function save(page: Page) {
  await expect(page.getByRole('alert')).toHaveCount(0); // 저장 바에 흠 문구가 없어야 한다
  const n = await changeCount(page);
  await saveButton(page).click();
  await expect(page.getByRole('status').filter({ hasText: `변경 ${n}건을 저장했습니다` })).toBeVisible();
  await expect(saveButton(page)).toHaveCount(0);
}

async function openEquipment(page: Page, name: string) {
  // 랙별에서 같은 이름의 랙 행이 앞에 온다 — 설비 행은 그 아래(마지막)다.
  await main(page).getByRole('row').filter({ hasText: name }).last().click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue(name);
}

test('② 현황 한 바퀴 — 북춘천에서 변경안을 쌓아 저장하고 지운다', async ({ page }) => {
  // 1. 로그인
  await login(page);

  // 2. 강원본부 › 직할 › 북춘천S/S — 품목별에 송변전광단말장치·분전반 행, 개수 1 이상
  await openStation(page, '강원본부', '직할', STATION);
  await expect(main(page).getByRole('radio', { name: '품목별' })).toBeChecked();
  for (const typeName of ['송변전광단말장치', '분전반']) {
    const row = main(page).getByRole('row', { name: new RegExp(`^${typeName} 펼치기 `) });
    await expect(row).toBeVisible();
    expect(Number(await row.getByRole('cell').nth(1).innerText())).toBeGreaterThanOrEqual(1);
  }

  // 3. 랙별 — 「통신용 분전반」 랙 아래 같은 이름 설비, 상세 회로 표 39행
  await main(page).getByRole('radio', { name: '랙별' }).click();
  const panelRows = main(page).getByRole('row').filter({ hasText: '통신용 분전반' });
  await expect(panelRows).toHaveCount(2); // 랙 행 + 설비 행
  await expect(panelRows.first()).toContainText('분전반함'); // 랙 행(랙 품목)
  await panelRows.nth(1).click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('통신용 분전반');
  await expect(detail(page).getByTestId('circuit-no')).toHaveCount(39);

  // 4. 랙 추가 → 설비 추가
  await main(page).getByRole('button', { name: '랙 추가' }).click();
  let dialog = page.getByRole('dialog', { name: '랙 추가' });
  await dialog.getByRole('textbox', { name: '이름' }).fill('E2E랙');
  await dialog.getByRole('combobox', { name: '랙 품목' }).selectOption({ label: '19인치 통신랙' });
  await dialog.getByRole('button', { name: '추가' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('E2E랙');

  await main(page).getByRole('button', { name: '설비 추가' }).first().click();
  dialog = page.getByRole('dialog', { name: '설비 추가' });
  await dialog.getByRole('textbox', { name: '이름' }).fill('E2E L3');
  await dialog.getByRole('combobox', { name: '설비 품목' }).selectOption({ label: 'L3 스위치' });
  await dialog.getByRole('combobox', { name: '랙' }).selectOption({ label: 'E2E랙' });
  await dialog.getByRole('button', { name: '추가' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('E2E L3');

  // 5. 잇기 — 분전반 회로 2, F-CV
  await detail(page).getByRole('tab', { name: '연결' }).click();
  await detail(page).getByRole('button', { name: '잇기' }).click();
  dialog = page.getByRole('dialog', { name: '잇기' });
  await dialog.getByRole('textbox', { name: '반대쪽 끝 검색' }).fill('분전반');
  const circuit2 = dialog.getByRole('button', { name: '통신용 분전반 회로 2', exact: true });
  await circuit2.click();
  await expect(circuit2).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('combobox', { name: '케이블 품목' }).selectOption({ label: 'F-CV 전력케이블' });
  await dialog.getByRole('button', { name: '잇기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(detail(page).getByRole('tabpanel', { name: '연결' })).toContainText('통신용 분전반 회로 2');

  // 6. 국을 옮겼다 돌아와도 변경안이 그대로
  const before = await changeCount(page);
  expect(before).toBeGreaterThanOrEqual(3);
  await selectStation(page, '춘천H/P');
  expect(await changeCount(page)).toBe(before);
  await selectStation(page, STATION);
  expect(await changeCount(page)).toBe(before);

  // 7. 평면도 — 3층에 E2E랙 끌어 놓기
  await main(page).getByRole('tab', { name: '평면도' }).click();
  await main(page).getByRole('tab', { name: '3층' }).click();
  await main(page).getByRole('combobox', { name: '배치할 랙' }).selectOption({ label: 'E2E랙' });
  await main(page).getByRole('button', { name: '배치', exact: true }).click();
  const canvas = page.getByTestId('rackplan-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 120, { steps: 10 });
  await page.mouse.up();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('E2E랙');
  await expect(detail(page)).toContainText(/배치\s*3층/);
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
  await expect(detail(page).getByRole('tabpanel', { name: '연결' })).toContainText('통신용 분전반 회로 2');

  // 9. E2E L3 지우기 — 연결 1건이 함께 간다
  await detail(page).getByRole('tab', { name: '정보' }).click();
  await detail(page).getByRole('button', { name: '삭제' }).click();
  const confirm = page.getByRole('alertdialog', { name: '설비 삭제' });
  await expect(confirm).toContainText('연결 1건');
  await confirm.getByRole('button', { name: '삭제' }).click();
  expect(await changeCount(page)).toBe(2); // 설비 + 연결
  await save(page);
  await expect(main(page).getByRole('row').filter({ hasText: 'E2E L3' })).toHaveCount(0);
  // 분전반 회로 2 는 다시 비었다 — 회로 표의 연결 칸에 「잇기」가 돌아온다
  await openEquipment(page, '통신용 분전반');
  const circuitRow2 = detail(page).getByRole('row').filter({ has: page.getByTestId('circuit-no').getByText('2', { exact: true }) });
  await expect(circuitRow2.getByRole('button', { name: '잇기' })).toBeVisible();

  // 정리 — 빈 E2E랙도 지워 다시 돌릴 수 있게
  await main(page).getByRole('row').filter({ hasText: 'E2E랙' }).click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('E2E랙');
  await detail(page).getByRole('button', { name: '삭제' }).click();
  const rackConfirm = page.getByRole('alertdialog', { name: '랙 삭제' });
  await rackConfirm.getByRole('button', { name: '삭제' }).click();
  await expect(rackConfirm).toHaveCount(0);
  expect(await changeCount(page)).toBe(1);
  await save(page);
  await expect(main(page).getByRole('row').filter({ hasText: 'E2E랙' })).toHaveCount(0);

  // 10. 회로 갈래를 교류로 — 말(교류)을 고르고 값(AC)이 저장된다(예전에는 「교류」를 실어 400).
  //     교류가 아닌 첫 회로를 고쳐 저장하고, 원래 값으로 되돌려 다시 저장한다(다시 돌릴 수 있게).
  await openEquipment(page, '통신용 분전반');
  const currents = detail(page).getByRole('button', { name: '갈래 고치기' });
  const texts = await currents.allInnerTexts();
  const idx = texts.findIndex((t) => t.trim() !== '교류');
  expect(idx).toBeGreaterThanOrEqual(0);
  const original = texts[idx]!.trim();
  await currents.nth(idx).click();
  await detail(page).getByRole('combobox', { name: '갈래' }).selectOption({ label: '교류' });
  await expect(currents.nth(idx)).toHaveText('교류');
  expect(await changeCount(page)).toBe(1);
  await save(page);
  await page.reload();
  await expect(detail(page).getByRole('button', { name: '갈래 고치기' }).nth(idx)).toHaveText('교류');
  await detail(page).getByRole('button', { name: '갈래 고치기' }).nth(idx).click();
  await detail(page).getByRole('combobox', { name: '갈래' }).selectOption({ label: original });
  await save(page);

  // 11. 품목 관리 — 케이블 품목 17행, 설비 품목에 L3 스위치
  const nav = page.getByRole('navigation', { name: '주요 메뉴' });
  await nav.getByRole('button', { name: '케이블 품목' }).click();
  await expect(page.getByRole('heading', { name: '케이블 품목', level: 1 })).toBeVisible();
  await expect(page.getByRole('table').getByRole('rowgroup').nth(1).getByRole('row')).toHaveCount(17);
  await nav.getByRole('button', { name: '설비 품목' }).click();
  await expect(page.getByRole('tab', { name: /^설비 품목/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('row').filter({ hasText: 'L3 스위치' })).toHaveCount(1);
});
