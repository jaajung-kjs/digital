import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, openStation, selectStation } from './helpers';

/**
 * ⑥ 설계서 — 강원본부 직할 시드(`npm run db:next:seed`) 위에서. **아무것도 저장하지 않는다**(변경 취소로 원상).
 *
 * 완료 기준 6: 북춘천에서 (구)춘천으로 광선로 신설(긍장 2.5 km) + 양 끝 국에서 점퍼 연결 1개씩(상대 국은 조직 트리로
 * 옮겨 가서 — 변경안은 한 벌로 쌓인다) → 저장 바 「설계서」 → 광케이블 2,500 m 1줄 + 점퍼 2줄, 국별 두 묶음,
 * 재료비·공량 산출 → 인쇄 PDF 1장 → 변경 취소.
 * 둘째: 평면도에서 랙을 끌어 옮기면 랙 이설 1건, 그 안 설비는 이설로 세지 않는다.
 *
 * 저장하지 않으므로 남는 것이 없어야 하지만, 지난 실패가 E2E 선로를 저장해 두었으면 시작할 때 걷는다.
 */

const NORTH = '북춘천S/S';
const OLD = '(구)춘천S/S';
const PREFIX = 'E2E';
const LINE_NAME = `${PREFIX} 설계서 선로`;
/** 찍은 그림·PDF — 기본은 test-results, 검토 때는 `STAGE6_SHOTS` 로 다른 곳에. */
const SHOTS = process.env.STAGE6_SHOTS ?? 'test-results/stage6';

const main = (page: Page) => page.getByTestId('v2-main');
const saveButton = (page: Page) => page.getByRole('button', { name: '저장', exact: true });
const changeCount = async (page: Page) => {
  const bar = page.getByText(/^변경 \d+건 · /);
  if ((await bar.count()) === 0) return 0;
  const text = await bar.first().textContent({ timeout: 1_000 }).catch(() => null);
  const m = text ? /변경 (\d+)건/.exec(text) : null;
  return m ? Number(m[1]) : 0;
};
const blocks = (page: Page) => main(page).getByTestId('sheet-block');
const row = (block: Locator, no: number) => block.getByTestId(`sheet-row-${no}`);
const cell = (block: Locator, no: number, col: string) => row(block, no).locator(`[data-col="${col}"]`);
const design = (page: Page) => page.getByRole('dialog', { name: '설계서' });
/** 설계서 산출 내역의 본문 줄 — 「대상」 칸(둘째 칸)이 그 글자인 줄. */
const itemRows = (page: Page, target: string, within: Locator = design(page)) =>
  within.locator('tr').filter({ has: page.locator('td:nth-child(2)', { hasText: new RegExp(`^${target}$`) }) });

async function openSheet(page: Page) {
  await main(page).getByRole('tab', { name: '선번장' }).click();
  await expect(blocks(page).first()).toBeVisible();
}

/** 지난 실패가 저장해 둔 E2E 선로를 걷는다(북춘천 선번장). 없으면 저장하지 않는다. */
async function sweepLeftovers(page: Page) {
  const leftover = blocks(page).filter({ hasText: LINE_NAME });
  for (let guard = 0; guard < 5 && (await leftover.count()) > 0; guard++) {
    await leftover.first().getByRole('button', { name: '편집' }).click();
    const dialog = page.getByRole('dialog', { name: '광선로 편집' });
    await dialog.getByRole('button', { name: '광선로 삭제' }).click();
    await page.getByRole('alertdialog', { name: '광선로 삭제' }).getByRole('button', { name: '삭제' }).click();
    await expect(dialog).toHaveCount(0);
  }
  if ((await changeCount(page)) > 0) {
    await saveButton(page).click();
    await expect(page.getByRole('status').filter({ hasText: /변경 \d+건을 저장했습니다/ })).toBeVisible();
  }
}

/** 새 선로 블록의 코어 1 자국 칸에서 「연결」 → 접속 설비 · 광점퍼코드 · 길이. */
async function jumper(page: Page, block: Locator, equipment: string, lengthM: string) {
  await row(block, 1).hover();
  await cell(block, 1, 'near').getByRole('button', { name: '연결', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '연결 추가' });
  await expect(dialog).toContainText(`기준 코어: ${LINE_NAME} 코어 1`);
  await dialog.getByRole('textbox', { name: '접속 설비 검색' }).fill(equipment);
  await dialog.getByRole('button', { name: equipment, exact: true }).click();
  await dialog.getByRole('combobox', { name: '케이블 품목' }).selectOption({ label: '광점퍼코드' });
  await dialog.getByRole('textbox', { name: '길이(m)' }).fill(lengthM);
  await dialog.getByRole('button', { name: '연결', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cell(block, 1, 'near')).toContainText(equipment);
}

/** 변경 취소 — 묻는 상자에서 한 번 더. 바가 사라지면 원상이다(저장 없음). */
async function revertAll(page: Page) {
  await page.getByRole('button', { name: '변경 취소' }).click();
  await page.getByRole('alertdialog', { name: '변경 취소' }).getByRole('button', { name: '변경 취소' }).click();
  await expect.poll(() => changeCount(page)).toBe(0);
  await expect(saveButton(page)).toHaveCount(0);
}

test('⑥ 설계서 — 두 국에 걸친 광선로 신설 + 양 끝 점퍼가 설계서 한 부(국별 두 묶음)', async ({ page }) => {
  // 1. 북춘천 선번장, 지난 잔재 걷기
  await login(page);
  await openStation(page, '강원본부', '직할', NORTH);
  await openSheet(page);
  await sweepLeftovers(page);
  expect(await changeCount(page)).toBe(0);

  // 2. 광선로 추가 — 상대국 (구)춘천 · 광케이블 · 12심 · 긍장 2.5 km · 자국 OFD 슬롯 9
  await main(page).getByRole('button', { name: '광선로 추가' }).click();
  const lineDialog = page.getByRole('dialog', { name: '광선로 추가' });
  await lineDialog.getByRole('textbox', { name: '상대국 검색' }).fill('(구)춘천');
  await lineDialog.getByRole('button', { name: /^\(구\)춘천S\/S/ }).click();
  await lineDialog.getByRole('combobox', { name: '케이블 품목' }).selectOption({ label: '광케이블' });
  await lineDialog.getByRole('textbox', { name: '코어 수' }).fill('12');
  await lineDialog.getByRole('textbox', { name: '선로명' }).fill(LINE_NAME);
  await lineDialog.getByRole('textbox', { name: '긍장' }).fill('2.5');
  await lineDialog.getByRole('combobox', { name: '자국 접속 설비' }).selectOption({ label: 'OFD' });
  await lineDialog.getByRole('textbox', { name: '자국 슬롯' }).fill('9');
  await lineDialog.getByRole('button', { name: '추가', exact: true }).click();
  await expect(lineDialog).toHaveCount(0);
  const northBlock = blocks(page).filter({ hasText: LINE_NAME });
  await expect(northBlock).toHaveCount(1);

  // 3. 북춘천 끝 점퍼 — 코어 1 → L2 스위치 · 광점퍼코드 3 m
  await jumper(page, northBlock, 'L2 스위치', '3');

  // 4. 조직 트리로 (구)춘천에 옮겨 간다 — 변경안은 그대로. 대국 쪽 블록 코어 1 → PoE 스위치 · 광점퍼코드 5 m
  const before = await changeCount(page);
  expect(before).toBe(2);
  await selectStation(page, OLD);
  expect(await changeCount(page)).toBe(before);
  await openSheet(page);
  const oldBlock = blocks(page).filter({ hasText: LINE_NAME });
  await expect(oldBlock).toHaveCount(1);
  await expect(oldBlock).toHaveAttribute('data-side', 'B');
  await jumper(page, oldBlock, 'PoE 스위치', '5');
  await expect.poll(() => changeCount(page)).toBe(3);
  await expect(page.getByText(/^변경 3건 · /)).toContainText(NORTH);
  await expect(page.getByText(/^변경 3건 · /)).toContainText(OLD);

  // 5. 저장하지 않고 「설계서」 — 광선로 1줄(2,500 m) + 케이블 2줄, 국별 두 묶음, 재료비·공량
  for (const vp of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(vp);
    await page.getByRole('button', { name: '설계서', exact: true }).click();
    await expect(design(page)).toBeVisible();
    const groups = design(page).getByTestId('design-group');
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0).locator('th').first()).toContainText(OLD); // 가나다순 — 「(」가 앞
    await expect(groups.nth(1).locator('th').first()).toContainText(NORTH);

    const line = itemRows(page, '광선로');
    await expect(line).toHaveCount(1);
    await expect(line).toContainText('신설');
    await expect(line).toContainText(LINE_NAME);
    await expect(line).toContainText('광케이블');
    await expect(line.locator('td').nth(4)).toHaveText('2,500'); // 수량
    await expect(line.locator('td').nth(5)).toHaveText('m');
    await expect(itemRows(page, '광선로', groups.nth(1))).toHaveCount(1); // 대표 국(A 끝 북춘천)에만
    // B 끝 (구)춘천 묶음에는 수량 없이 어디에 실렸는지만
    await expect(groups.nth(0).getByTestId('design-ref')).toHaveText(`광선로 ${LINE_NAME} · ${NORTH} 묶음에 포함`);

    const jumpers = itemRows(page, '케이블');
    await expect(jumpers).toHaveCount(2);
    for (const j of await jumpers.all()) {
      await expect(j).toContainText('신설');
      await expect(j).toContainText('광점퍼코드');
    }
    await expect(itemRows(page, '케이블', groups.nth(0)).filter({ hasText: 'PoE 스위치' })).toHaveCount(1);
    await expect(itemRows(page, '케이블', groups.nth(1)).filter({ hasText: 'L2 스위치' })).toHaveCount(1);
    await expect(itemRows(page, '랙')).toHaveCount(0);
    await expect(itemRows(page, '설비')).toHaveCount(0);

    // 재료비 = 2,500 m × 3,400 + (3 + 5) m × 2,100 · 공량 = 2,500 × 0.06 + 8 × 0.04 (시드 품목 단가·공량)
    await expect(design(page).getByTestId('design-material-total')).toHaveText('8,516,800');
    await expect(design(page).getByTestId('design-mandays-total')).toHaveText('150.320');
    await expect(design(page).getByText('합계 3건')).toBeVisible();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${SHOTS}/t4-design-${vp.width}.png` });

    // 인쇄본 — A4 PDF 한 장(1440 에서만). 「인쇄」 단추가 <html> 에 인쇄 표시를 단다(브라우저 인쇄 상자는 막는다)
    if (vp.width === 1440) {
      await page.evaluate(() => { window.print = () => {}; });
      await design(page).getByRole('button', { name: '인쇄' }).click();
      await expect(page.locator('html')).toHaveClass(/design-printing/);
      await page.emulateMedia({ media: 'print' });
      await page.pdf({ path: `${SHOTS}/t4-print.pdf`, format: 'A4', preferCSSPageSize: true });
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await expect(page.locator('html')).not.toHaveClass(/design-printing/);
    }
    await design(page).getByRole('button', { name: '닫기' }).last().click();
    await expect(design(page)).toHaveCount(0);
  }

  // 6. 변경 취소 — 원상(저장 없음). 선번장에서 그 선로가 사라진다
  await revertAll(page);
  await expect(blocks(page).filter({ hasText: LINE_NAME })).toHaveCount(0);
});

test('⑥ 설계서 — 평면도에서 랙을 끌어 옮기면 랙 이설 1건, 안 설비는 이설이 아니다', async ({ page }) => {
  await login(page);
  await openStation(page, '강원본부', '직할', NORTH);
  expect(await changeCount(page)).toBe(0);

  // 평면도 — 시드에서 놓인 랙은 OFD 하나(안에 설비 OFD). 평면도는 놓인 랙에 맞춰 열리므로 판 한가운데가 그 랙이다
  await main(page).getByRole('tab', { name: '평면도' }).click();
  const canvas = page.getByTestId('rackplan-canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(500); // 맞춰 그려질 때까지
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => changeCount(page)).toBe(1);

  await page.getByRole('button', { name: '설계서', exact: true }).click();
  await expect(design(page)).toBeVisible();
  const racks = itemRows(page, '랙');
  await expect(racks).toHaveCount(1);
  await expect(racks).toContainText('이설');
  await expect(racks).toContainText('OFD');
  await expect(itemRows(page, '설비')).toHaveCount(0);
  await expect(design(page).getByText('합계 1건')).toBeVisible();
  await expect(design(page).getByTestId('design-group')).toHaveCount(0); // 국 하나 — 묶음 머리 없음
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${SHOTS}/t4-relocate.png` });
  await design(page).getByRole('button', { name: '닫기' }).last().click();

  await revertAll(page);
});
