import { expect, test, type Locator, type Page } from '@playwright/test';
import { login, openStation, selectStation } from './helpers';

/**
 * ③ 선번장 한 바퀴 — 북춘천S/S 시드(`npm run db:next:seed`) 위에서.
 *
 * 블록 머리·코어 3 용도가 시드값(엑셀) → 빈 코어 잇기·저장 → 측정 일괄 입력 → 최근 측정 칸 →
 * 광선로 추가(다른 국 · 12심)·저장 → 상대 국 선번장에 같은 선로(대국 쪽 블록) → 지우고 저장 →
 * 상세 패널 「광선로 슬롯」에서 선번장 블록으로 · 슬롯 수 고치기.
 *
 * 만든 것은 끝에 지운다. 지난 실패가 남긴 `E2E` 흔적(선로명·연결 표기·측정자)은 시작할 때 먼저 걷는다.
 */

const STATION = '북춘천S/S';
const PEER = '화천S/S';
const PREFIX = 'E2E';
const LINE_NAME = `${PREFIX} 선번장 선로`;
/** 시드 블록 — 슬롯 3(154kV 북춘천화천HP T/L) 코어 11·12 는 비어 있다(연결·용도·측정 없음). */
const SLOT3_LINE = '154kV 북춘천화천HP T/L';

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

const blocks = (page: Page) => main(page).getByTestId('sheet-block');
const blockOf = (page: Page, text: string) => blocks(page).filter({ has: page.getByTestId('sheet-block-head').filter({ hasText: text }) });
const row = (block: Locator, no: number) => block.getByTestId(`sheet-row-${no}`);
const cell = (block: Locator, no: number, col: string) => row(block, no).locator(`[data-col="${col}"]`);

async function openSheet(page: Page) {
  await main(page).getByRole('tab', { name: '선번장' }).click();
  await expect(blocks(page).first()).toBeVisible();
}

/** 코어 측정 이력 상자에서 측정자가 E2E 인 줄을 지운다 — 저장 전 변경안으로 남는다. */
async function dropE2EMeasurements(page: Page, block: Locator, no: number) {
  await row(block, no).getByRole('button', { name: `코어 ${no} 측정 이력` }).click();
  const dialog = page.getByRole('dialog', { name: new RegExp(`^코어 ${no} — `) });
  await expect(dialog).toBeVisible();
  const mine = dialog.getByTestId('history-near').getByRole('row').filter({ hasText: PREFIX });
  for (let guard = 0; guard < 10 && (await mine.count()) > 0; guard++) {
    await mine.first().getByRole('button', { name: '측정 삭제' }).click();
    const confirm = page.getByRole('alertdialog', { name: '측정 삭제' });
    await confirm.getByRole('button', { name: '삭제' }).click();
    await expect(confirm).toHaveCount(0);
  }
  await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
}

/** 지난 실패가 남긴 E2E 흔적을 걷는다 — E2E 광선로, 표기 E2E 인 연결, 측정자 E2E 인 측정. 없으면 저장하지 않는다. */
async function sweepLeftovers(page: Page) {
  const leftover = blocks(page).filter({ hasText: LINE_NAME });
  for (let guard = 0; guard < 5 && (await leftover.count()) > 0; guard++) {
    await leftover.first().getByRole('button', { name: '편집' }).click();
    const dialog = page.getByRole('dialog', { name: '광선로 편집' });
    await dialog.getByRole('button', { name: '광선로 삭제' }).click();
    await page.getByRole('alertdialog', { name: '광선로 삭제' }).getByRole('button', { name: '삭제' }).click();
    await expect(dialog).toHaveCount(0);
  }
  const slot3 = blockOf(page, SLOT3_LINE);
  for (const no of [11, 12]) {
    const near = cell(slot3, no, 'near');
    if ((await near.innerText()).includes(PREFIX)) {
      await row(slot3, no).hover();
      await near.getByRole('button', { name: '연결 삭제' }).click();
      await page.getByRole('alertdialog', { name: '연결 삭제' }).getByRole('button', { name: '삭제' }).click();
    }
    if ((await cell(slot3, no, 'measuredOn').innerText()).trim() !== '—') await dropE2EMeasurements(page, slot3, no);
  }
  if ((await changeCount(page)) > 0) await save(page);
}

test('③ 선번장 한 바퀴 — 북춘천에서 잇고 재고, 광선로를 더해 상대 국에서 보고 지운다', async ({ page }) => {
  // 1. 로그인 → 강원본부 › 직할 › 북춘천S/S → 선번장, 지난 잔재 걷기
  await login(page);
  await openStation(page, '강원본부', '직할', STATION);
  await openSheet(page);
  await sweepLeftovers(page);
  expect(await changeCount(page)).toBe(0);

  // 2. 블록 머리 — 시드(엑셀 북춘천 시트)의 상대국·선로명. 첫 블록은 (구)춘천 쪽 슬롯 1, 둘째는 춘천H/P 쪽 슬롯 2
  const heads = main(page).getByTestId('sheet-block-head');
  await expect(heads.nth(0)).toContainText('OFD · 슬롯 1 · 어댑터 1–24');
  await expect(heads.nth(0)).toContainText('↔ (구)춘천S/S');
  await expect(heads.nth(0)).toContainText('154kV 춘천분기T/L / 154kV 춘천-북춘천T/L');
  await expect(heads.nth(1)).toContainText('OFD · 슬롯 2 · 어댑터 1–24');
  await expect(heads.nth(1)).toContainText('↔ 춘천H/P');
  await expect(heads.nth(1)).toContainText('154kV 춘천수력T/L');
  //    코어 3 용도 — 북춘천 끝의 값(WEST). (구)춘천 끝은 EAST 라 상대 끝 용도로만(title) 선다
  const first = blocks(page).nth(0);
  await expect(cell(first, 3, 'purpose')).toHaveText('소형광 · PTP(춘천-북춘천) WEST');
  await expect(cell(first, 3, 'purpose')).toHaveAttribute('title', /대국 측 용도: 소형광 · PTP\(춘천-북춘천\) EAST/);
  await expect(cell(first, 1, 'status')).toHaveText('단선');
  await expect(cell(first, 21, 'status')).toHaveText('사용불가');
  //    대국 연결은 읽기 전용 — 잇기·지우기 단추가 없다
  await expect(cell(first, 3, 'far').getByRole('button')).toHaveCount(0);

  // 3. 빈 코어 잇기 — 슬롯 3 코어 11 → 같은 국 L2 스위치(표기 E2E-FX) · 광점퍼코드 → 저장 → 자국 연결 이름
  const slot3 = blockOf(page, SLOT3_LINE);
  await expect(cell(slot3, 11, 'near')).not.toContainText(PREFIX);
  await row(slot3, 11).hover();
  await cell(slot3, 11, 'near').getByRole('button', { name: '연결', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '연결 추가' });
  await expect(dialog).toContainText(`자국 측 코어: ${SLOT3_LINE} 코어 11`);
  await dialog.getByRole('textbox', { name: '상대 단자 검색' }).fill('L2 스위치');
  await dialog.getByRole('button', { name: 'L2 스위치', exact: true }).click();
  await dialog.getByRole('textbox', { name: '상대 단자 표기' }).fill(`${PREFIX}-FX`);
  await dialog.getByRole('combobox', { name: '케이블 품목' }).selectOption({ label: '광점퍼코드' });
  await dialog.getByRole('button', { name: '연결', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cell(slot3, 11, 'near')).toHaveText(`L2 스위치 ${PREFIX}-FX`);
  await expect.poll(() => changeCount(page)).toBe(1);
  await save(page);
  await expect(cell(slot3, 11, 'near')).toHaveText(`L2 스위치 ${PREFIX}-FX`);

  // 4. 측정 일괄 입력 — 코어 11·12 두 줄만(빈 줄은 측정을 만들지 않는다) → 최근 측정 칸
  await slot3.getByRole('button', { name: '측정 입력' }).click();
  dialog = page.getByRole('dialog', { name: new RegExp('^측정 입력 — ') });
  await expect(dialog).toBeVisible();
  const measuredOn = await dialog.getByRole('textbox', { name: '측정일' }).inputValue();
  expect(measuredOn).not.toBe('');
  await dialog.getByRole('textbox', { name: '측정자' }).fill(PREFIX);
  await dialog.getByLabel('코어 11 1310 nm 손실').fill('-2.5');
  await dialog.getByLabel('코어 11 1550 nm 손실').fill('-1.75');
  await dialog.getByLabel('코어 11 1550 nm 거리').fill('8.35');
  await dialog.getByLabel('코어 12 1310 nm 손실').fill('-2.61');
  await dialog.getByLabel('코어 12 1310 nm 거리').fill('8.34');
  await dialog.getByRole('button', { name: '등록' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cell(slot3, 11, 'loss1310')).toHaveText('-2.5');
  await expect(cell(slot3, 11, 'loss1550')).toHaveText('-1.75');
  await expect(cell(slot3, 11, 'dist')).toHaveText('8.35'); // 1550 거리가 있으면 그것
  await expect(cell(slot3, 12, 'loss1310')).toHaveText('-2.61');
  await expect(cell(slot3, 12, 'dist')).toHaveText('8.34(1310)'); // 1550 이 없으면 1310 거리 — 물러섰다고 적는다
  await expect(cell(slot3, 11, 'measuredOn')).not.toHaveText('—');
  await expect(cell(slot3, 13, 'measuredOn')).toHaveText('—'); // 빈 줄은 측정이 없다
  await expect.poll(() => changeCount(page)).toBe(2);
  await save(page);

  // 5. 광선로 추가 — 상대국 화천S/S · OPGW · 12심 · 이쪽 OFD 슬롯 9 → 저장
  await main(page).getByRole('button', { name: '광선로 추가' }).click();
  dialog = page.getByRole('dialog', { name: '광선로 추가' });
  await dialog.getByRole('textbox', { name: '상대국 검색' }).fill('화천');
  await dialog.getByRole('button', { name: new RegExp(`^${PEER.replace('/', '\\/')}`) }).click();
  await dialog.getByRole('combobox', { name: '케이블 품목' }).selectOption({ label: 'OPGW(광복합가공지선)' });
  await dialog.getByRole('textbox', { name: '코어 수' }).fill('12');
  await dialog.getByRole('textbox', { name: '선로명' }).fill(LINE_NAME);
  await dialog.getByRole('combobox', { name: '자국 측 단자 설비' }).selectOption({ label: 'OFD' });
  await dialog.getByRole('textbox', { name: '자국 측 슬롯' }).fill('9');
  await dialog.getByRole('button', { name: '추가', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const added = blocks(page).filter({ hasText: LINE_NAME });
  await expect(added).toHaveCount(1);
  await expect(added).toHaveAttribute('aria-current', 'true'); // 닫으면 그 블록으로
  await expect(added.getByTestId('sheet-block-head')).toContainText('OFD · 슬롯 9 · 어댑터 1–12');
  await expect(added.getByTestId('sheet-block-head')).toContainText(`↔ ${PEER}`);
  await expect(added.locator('tbody tr')).toHaveCount(12);
  await save(page);

  // 6. 상대 국을 열면 그 국 선번장에 같은 선로 — 대국 쪽(B) 블록, 단자 미지정, 12심
  await selectStation(page, PEER);
  await openSheet(page);
  const peerBlock = blocks(page).filter({ hasText: LINE_NAME });
  await expect(peerBlock).toHaveCount(1);
  await expect(peerBlock).toHaveAttribute('data-side', 'B');
  await expect(peerBlock.getByTestId('sheet-block-head')).toContainText('단자 미지정');
  await expect(peerBlock.getByTestId('sheet-block-head')).toContainText(`↔ ${STATION}`);
  await expect(peerBlock.locator('tbody tr')).toHaveCount(12);

  // 7. 지우고 저장 — 상대 국에서 지워도 한 선로다(북춘천에서도 사라진다)
  await peerBlock.getByRole('button', { name: '편집' }).click();
  dialog = page.getByRole('dialog', { name: '광선로 편집' });
  await dialog.getByRole('button', { name: '광선로 삭제' }).click();
  const ask = page.getByRole('alertdialog', { name: '광선로 삭제' });
  await expect(ask).toContainText('코어 12');
  await ask.getByRole('button', { name: '삭제' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(blocks(page).filter({ hasText: LINE_NAME })).toHaveCount(0);
  await save(page);
  await selectStation(page, STATION);
  await openSheet(page);
  await expect(blocks(page).filter({ hasText: LINE_NAME })).toHaveCount(0);

  // 8. 상세 패널 「광선로 슬롯」 — OFD 를 열고 슬롯 줄을 누르면 선번장의 그 블록
  await main(page).getByRole('tab', { name: '현황' }).click();
  await main(page).getByRole('radio', { name: '랙별' }).click();
  await main(page).getByRole('row').filter({ hasText: /^OFD/ }).last().click();
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('OFD');
  const slots = detail(page).getByText('광선로 슬롯').locator('xpath=../..');
  await expect(slots.getByRole('button', { name: /^슬롯 \d+ · / })).toHaveCount(3);
  //    슬롯 수 — 카드 머리에서 고치면 「빈 슬롯」이 따라온다. 실행 취소로 물린다(저장하지 않는다)
  const before = await changeCount(page);
  const countButton = slots.getByRole('button', { name: '슬롯 수 수정' });
  const original = Number((await countButton.innerText()).trim()) || 3; // 시드 OFD 는 8, 비었으면(—) 3 에서
  const next = original + 1;
  await countButton.click();
  const countBox = slots.getByLabel('슬롯 수', { exact: true });
  await countBox.fill(String(next));
  await countBox.press('Enter');
  await expect(countButton).toHaveText(String(next));
  await expect(slots.getByText(`빈 슬롯 ${next - 3}`)).toBeVisible();
  await expect.poll(() => changeCount(page)).toBe(before + 1);
  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect.poll(() => changeCount(page)).toBe(before);
  await expect(countButton).not.toHaveText(String(next));

  //    슬롯 줄 → 선번장의 그 블록. 상세는 닫힌다(12열 표가 우선) — 초점 블록이 화면 안에
  await slots.getByRole('button', { name: `슬롯 3 · ${SLOT3_LINE} · 24심` }).click();
  await expect(main(page).getByRole('tab', { name: '선번장' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/[?&]line=[^&]+&side=A/);
  const focused = blocks(page).and(page.locator('[aria-current="true"]'));
  await expect(focused).toHaveCount(1);
  await expect(focused.getByTestId('sheet-block-head')).toContainText(SLOT3_LINE);
  await expect(focused).toBeInViewport();
  await expect(detail(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]eq=/);
  //    되돌아가는 길 둘 — 뒤로 가기는 떠나 온 OFD 상세로, 블록 머리의 단자 이름도 그 설비 상세로(현황)
  await page.goBack();
  await expect(main(page).getByRole('tab', { name: '현황' })).toHaveAttribute('aria-selected', 'true');
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('OFD');
  await page.goForward();
  await expect(focused.getByTestId('sheet-block-head')).toContainText(SLOT3_LINE);
  await focused.getByTestId('sheet-block-head').getByRole('button', { name: 'OFD', exact: true }).click();
  await expect(main(page).getByRole('tab', { name: '현황' })).toHaveAttribute('aria-selected', 'true');
  await expect(detail(page).getByRole('textbox', { name: '이름' })).toHaveValue('OFD');
  await page.goBack();
  await expect(main(page).getByRole('tab', { name: '선번장' })).toHaveAttribute('aria-selected', 'true');


  // 9. 정리 — 코어 11 연결·코어 11·12 측정을 걷고 저장
  const sheet3 = blockOf(page, SLOT3_LINE);
  await row(sheet3, 11).hover();
  await cell(sheet3, 11, 'near').getByRole('button', { name: '연결 삭제' }).click();
  await page.getByRole('alertdialog', { name: '연결 삭제' }).getByRole('button', { name: '삭제' }).click();
  await dropE2EMeasurements(page, sheet3, 11);
  await dropE2EMeasurements(page, sheet3, 12);
  await expect(cell(sheet3, 11, 'measuredOn')).toHaveText('—');
  await expect(cell(sheet3, 12, 'measuredOn')).toHaveText('—');
  await expect.poll(() => changeCount(page)).toBe(3);
  await save(page);
  await expect(cell(sheet3, 11, 'near').getByRole('button', { name: '연결', exact: true })).toBeAttached();
});
