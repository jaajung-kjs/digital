/**
 * v2 기준정보 라우트 — 설계에 쓰는 **바깥에서 오는 표**를 서버에 한 판씩 올린다.
 *
 * 왜 서버에 두나: 노임단가는 전원이 같은 값을 써야 한다. 각자 파일을 들고 있으면 사람마다
 * 다른 설계서가 나온다. 관리자가 반기에 한 번 올리면 그걸로 끝이다.
 *
 * 왜 판을 쌓아 두나: 작년 설계서를 다시 열었을 때 그때 값으로 재현돼야 한다. 새 판을 올려도
 * 이전 판은 지우지 않고 「적용 중」만 갈아 끼운다.
 *
 * 카탈로그는 이 판을 가리키지 않는다 — **직종 코드**만 들고 있고 단가는 적용 중인 판에서
 * 읽는다(`hwpWage.ts` 머리말 참고).
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import type { Prisma } from '../generated/next-client/index.js';
import { authenticate, adminOnly } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';
import { readWageHwp, HwpFormatError, type WageReport } from './standards/hwpWage.js';
import { readOverheadXlsx, OverheadFormatError } from './standards/overheadXlsx.js';

export const standardsRouter = Router();
standardsRouter.use(authenticate);

/** 임금실태조사 보고서는 200KB 안팎이다 — 넉넉히 잡아도 이만하면 된다. */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// 원본 파일은 보관하지 않는다 — 파싱 결과(payload)가 우리가 쓰는 전부다.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  defParamCharset: 'utf8',
});

function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new HttpError(413, 'FILE_TOO_LARGE', '기준정보 파일은 20MB 이하만 업로드할 수 있습니다')
          : new HttpError(400, 'UPLOAD_FAILED', '파일을 읽지 못했습니다'),
      );
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

/**
 * 「2026.1.1」 → Date. 보고서 표기를 그대로 두되 정렬은 날짜로 한다.
 *
 * 문자열 정렬은 못 쓴다 — `2026.1.1` 과 `2026.10.1` 이 뒤집힌다.
 */
function parseEffective(label: string): Date {
  const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(label.trim());
  if (!m) throw new HttpError(422, 'BAD_FORMAT', `기준일을 읽지 못했습니다: ${label}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** 지금 카탈로그가 쓰는 직종 값들 — 코드일 수도, 아직 승격 전 이름일 수도 있다. */
async function usedLaborValues(): Promise<Map<string, number>> {
  const [rackTypes, equipmentTypes, cableTypes] = await Promise.all([
    nextDb.rackType.groupBy({ by: ['laborCode'], _count: { _all: true } }),
    nextDb.equipmentType.groupBy({ by: ['laborCode'], _count: { _all: true } }),
    nextDb.cableType.groupBy({ by: ['laborCode'], _count: { _all: true } }),
  ]);
  const out = new Map<string, number>();
  for (const row of [...rackTypes, ...equipmentTypes, ...cableTypes]) {
    if (!row.laborCode) continue;
    out.set(row.laborCode, (out.get(row.laborCode) ?? 0) + row._count._all);
  }
  return out;
}

/**
 * 올린 표를 지금 카탈로그에 맞춰 본다.
 *
 * - `promote`: 아직 **이름**으로 들어 있는 값 중 표에서 코드를 찾은 것 → 등록하면서 코드로 승격
 * - `orphans`: 코드도 이름도 표에 없는 값 → 그대로 두면 설계서에서 「미등록」으로 나온다
 */
function matchCatalog(report: WageReport, used: Map<string, number>) {
  const byCode = new Map(report.rows.map((r) => [r.code, r]));
  const byName = new Map(report.rows.map((r) => [r.name, r]));

  const promote: { from: string; toCode: string; toName: string; count: number }[] = [];
  const orphans: { value: string; count: number }[] = [];
  for (const [value, count] of used) {
    if (byCode.has(value)) continue; // 이미 코드이고 표에도 있다
    const hit = byName.get(value);
    if (hit) promote.push({ from: value, toCode: hit.code, toName: hit.name, count });
    else orphans.push({ value, count });
  }
  return { promote, orphans };
}

/** POST /v2/standards/wage/preview — 파일을 읽어 보여만 준다(저장하지 않는다). */
standardsRouter.post('/standards/wage/preview', adminOnly, uploadSingle, async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'NO_FILE', '파일이 없습니다');
    let report: WageReport;
    try {
      report = readWageHwp(req.file.buffer);
    } catch (e) {
      if (e instanceof HwpFormatError) throw new HttpError(422, 'BAD_FORMAT', e.message);
      throw e;
    }
    res.json({
      effective: report.half,
      sourceName: req.file.originalname,
      dates: report.dates,
      rows: report.rows,
      markerNotes: report.markerNotes,
      /** 이 파일이 채우는 칸 수 — 회차 × 직종 중 값이 있는 것만. */
      cellCount: report.rows.reduce((n, r) => n + r.values.length, 0),
      ...matchCatalog(report, await usedLaborValues()),
    });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /v2/standards/wage — 등록하고 바로 적용한다.
 *
 * 미리보기와 같은 파일을 다시 받는다(파싱 결과를 클라이언트가 돌려주게 하지 않는다 — 그러면
 * 화면이 값을 고쳐 보낼 수 있다). 승격은 **같은 트랜잭션**에서 한다.
 */
standardsRouter.post('/standards/wage', adminOnly, uploadSingle, async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'NO_FILE', '파일이 없습니다');
    let report: WageReport;
    try {
      report = readWageHwp(req.file.buffer);
    } catch (e) {
      if (e instanceof HwpFormatError) throw new HttpError(422, 'BAD_FORMAT', e.message);
      throw e;
    }

    const { promote } = matchCatalog(report, await usedLaborValues());
    const created = await nextDb.$transaction(async (tx) => {
      /* 노임은 **판을 갈아 끼우지 않는다** — 값은 `LaborRate` 가 갖고, 여기 남는 것은
         「누가 언제 어느 파일을 올렸나」뿐이다. `active` 를 켜면 화면에 「적용」 버튼이 뜨는데,
         눌러도 단가는 하나도 바뀌지 않는다(거짓말이 된다). */
      const row = await tx.laborStandard.create({
        data: {
          kind: 'wage',
          effective: report.half,
          sourceName: req.file!.originalname,
          /* 값은 `LaborRate` 가 갖는다 — 여기에는 판을 되짚을 것만 남긴다. */
          payload: { dates: report.dates } as unknown as Prisma.InputJsonValue,
          uploadedBy: req.user?.username ?? 'unknown',
        },
      });

      /* 값이 있는 칸만 넣는다. 같은 (직종, 기준일)을 다시 올리면 덮어쓰고, 다른 회차 파일을
         올리면 빈 곳만 채운다 — 오래된 보고서를 나중에 올려도 최신을 밀어내지 않는다. */
      for (const r of report.rows) {
        for (const v of r.values) {
          const effectiveOn = parseEffective(v.date);
          const data = {
            effectiveLabel: v.date,
            name: r.name,
            sector: r.sector,
            wage: Math.round(v.wage),
            marker: r.marker,
            /* 각주는 **그 회차 문장**이다 — 판에서 읽으면 옛 값에 새 설명이 붙는다. */
            markerNote: r.marker ? (report.markerNotes[r.marker] ?? null) : null,
            sourceId: row.id,
          };
          await tx.laborRate.upsert({
            where: { code_effectiveOn: { code: r.code, effectiveOn } },
            update: data,
            create: { code: r.code, effectiveOn, ...data },
          });
        }
      }
      /* 이름으로 들어 있던 값을 코드로 올린다 — 시드가 넣은 「통신내선공」이 여기서 1086 이
         된다. 이 한 번이 지나면 이름이 바뀌어도 카탈로그는 그대로다. */
      for (const p of promote) {
        await tx.rackType.updateMany({ where: { laborCode: p.from }, data: { laborCode: p.toCode } });
        await tx.equipmentType.updateMany({ where: { laborCode: p.from }, data: { laborCode: p.toCode } });
        await tx.cableType.updateMany({ where: { laborCode: p.from }, data: { laborCode: p.toCode } });
      }
      return row;
    });
    res.status(201).json({ id: created.id, effective: created.effective, promoted: promote.length });
  } catch (e) {
    next(e);
  }
});

// ── 제비율 ───────────────────────────────────────────────────────────────────

/** 파일을 읽어 표로 펼친다 — 미리보기와 등록이 같은 길을 쓴다. */
async function parseOverhead(buffer: Buffer) {
  try {
    return await readOverheadXlsx(buffer);
  } catch (e) {
    if (e instanceof OverheadFormatError) throw new HttpError(422, 'BAD_FORMAT', e.message);
    throw e;
  }
}

/** POST /v2/standards/overhead/preview — 읽어 보여만 준다. */
standardsRouter.post('/standards/overhead/preview', adminOnly, uploadSingle, async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'NO_FILE', '파일이 없습니다');
    const table = await parseOverhead(req.file.buffer);
    res.json({ ...table, sourceName: req.file.originalname });
  } catch (e) {
    next(e);
  }
});

/** POST /v2/standards/overhead — 등록하고 바로 적용한다. */
standardsRouter.post('/standards/overhead', adminOnly, uploadSingle, async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'NO_FILE', '파일이 없습니다');
    const table = await parseOverhead(req.file.buffer);
    const created = await nextDb.$transaction(async (tx) => {
      await tx.laborStandard.updateMany({ where: { kind: 'overhead', active: true }, data: { active: false } });
      return tx.laborStandard.create({
        data: {
          kind: 'overhead',
          effective: table.effective,
          sourceName: req.file!.originalname,
          payload: table as unknown as Prisma.InputJsonValue,
          active: true,
          uploadedBy: req.user?.username ?? 'unknown',
        },
      });
    });
    res.status(201).json({ id: created.id, effective: created.effective });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /v2/standards/wages — 임포트된 직종 노임을 **회차별로 펼쳐** 돌려준다.
 *
 * 카탈로그에는 코드마다 최신 값 하나만 싣는다(모든 화면이 그것만 쓰므로). 여기서는 무엇이
 * 들어왔는지·추이가 어떤지 보려는 것이라 회차를 다 준다 — 기준정보 탭만 부른다.
 */
standardsRouter.get('/standards/wages', async (_req, res, next) => {
  try {
    const rows = await nextDb.laborRate.findMany({ orderBy: [{ code: 'asc' }, { effectiveOn: 'desc' }] });
    /* 열은 **실제로 들어온 회차**다 — 최신이 왼쪽. */
    const seen = new Map<string, Date>();
    for (const r of rows) if (!seen.has(r.effectiveLabel)) seen.set(r.effectiveLabel, r.effectiveOn);
    const dates = [...seen.entries()].sort((a, b) => b[1].getTime() - a[1].getTime()).map(([label]) => label);

    const byCode = new Map<string, { code: string; name: string; sector: string; marker: string; markerNote: string | null; wages: Record<string, number> }>();
    for (const r of rows) {
      /* 이름·각주는 **가장 최근 행**의 것을 쓴다(행은 최신순이라 첫 번째). */
      const cur = byCode.get(r.code);
      if (!cur) {
        byCode.set(r.code, { code: r.code, name: r.name, sector: r.sector, marker: r.marker, markerNote: r.markerNote, wages: { [r.effectiveLabel]: r.wage } });
      } else {
        cur.wages[r.effectiveLabel] = r.wage;
      }
    }
    res.json({ dates, rows: [...byCode.values()] });
  } catch (e) {
    next(e);
  }
});

/** GET /v2/standards — 올려 둔 판 목록(내용은 빼고). 어느 것이 적용 중인지 보인다. */
standardsRouter.get('/standards', async (_req, res, next) => {
  try {
    const rows = await nextDb.laborStandard.findMany({
      orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, kind: true, effective: true, sourceName: true, active: true, uploadedBy: true, createdAt: true },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** POST /v2/standards/:id/activate — 이 판을 적용한다(같은 종류의 다른 판은 내린다). */
standardsRouter.post('/standards/:id/activate', adminOnly, async (req, res, next) => {
  try {
    const id = req.params.id;
    const row = await nextDb.laborStandard.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', '기준정보를 찾을 수 없습니다');
    if (row.kind === 'wage') {
      throw new HttpError(409, 'NOT_VERSIONED', '노임단가는 일괄 교체하지 않습니다 — 직종별로 가장 최근 값이 적용됩니다');
    }
    await nextDb.$transaction([
      nextDb.laborStandard.updateMany({ where: { kind: row.kind, active: true }, data: { active: false } }),
      nextDb.laborStandard.update({ where: { id }, data: { active: true } }),
    ]);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
