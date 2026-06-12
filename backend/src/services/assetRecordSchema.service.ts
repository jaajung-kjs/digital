import { Prisma } from '@prisma/client';

/**
 * 자산 소유 기록(점검/고장/사진 + 미래 무엇이든)의 구조를 **DB 스키마(Prisma DMMF)에서 자동 도출**한다.
 *
 * 손으로 정의하는 레지스트리가 없다 — DB 에 `asset → X` 관계(단일 belongs-to FK)가 생기면
 * 워킹카피·커밋·UI 가 그 테이블의 컬럼을 그대로 따라간다(자산DB중심). 연결점(Port)처럼 자산을
 * 여러 개 참조하거나(엣지) 자기참조인 것은 자동으로 제외된다.
 *
 * DB 스키마가 *못 주는* 표현 정보(한글 라벨/enum 표시색/사진 위젯)는 데이터모델이 아니므로
 * 여기 포함하지 않는다 — 프론트의 얇은 표현 설정이 recordType 키로 덮는다.
 */

const SKIP_FIELDS = new Set(['id', 'assetId', 'createdAt', 'updatedAt', 'createdById', 'updatedById']);
const TYPE_MAP: Record<string, AssetRecordField['type']> = {
  String: 'text',
  DateTime: 'date',
  Int: 'number',
  Float: 'number',
  Decimal: 'number',
  Boolean: 'bool',
};

export interface AssetRecordField {
  name: string;
  type: 'text' | 'date' | 'number' | 'bool' | 'enum';
  required: boolean;
  enumValues?: string[];
}

export interface AssetRecordModel {
  /** recordType 키 = DB 테이블명(스키마-구동 식별자). 예: 'inspection_logs'. */
  recordType: string;
  /** Prisma 모델명. 예: 'InspectionLog'. */
  model: string;
  /** prisma client 접근자(델리게이트). 예: 'inspectionLog'. */
  delegate: string;
  /** createdById/updatedById 감사 컬럼 보유 여부(커밋이 자동 채움). */
  hasAudit: boolean;
  /** updatedAt 컬럼 보유 여부 — OCC(낙관적 동시성) 적용 가능(사진은 없음). */
  hasVersion: boolean;
  fields: AssetRecordField[];
}

function build(): AssetRecordModel[] {
  const models = Prisma.dmmf.datamodel.models;
  const enums = Prisma.dmmf.datamodel.enums;
  const enumValues = (name: string) => enums.find((e) => e.name === name)?.values.map((v) => v.name) ?? [];

  const out: AssetRecordModel[] = [];
  for (const m of models) {
    if (m.name === 'Asset') continue; // 자기참조 제외
    const assetFks = m.fields.filter(
      (f) => f.kind === 'object' && f.type === 'Asset' && (f.relationFromFields?.length ?? 0) > 0,
    );
    if (assetFks.length !== 1) continue; // 단일 자산 소유만(케이블/광경로 같은 엣지 제외)

    const fields: AssetRecordField[] = m.fields
      .filter((f) => (f.kind === 'scalar' || f.kind === 'enum') && !SKIP_FIELDS.has(f.name))
      .map((f) => ({
        name: f.name,
        type: f.kind === 'enum' ? 'enum' : (TYPE_MAP[f.type] ?? 'text'),
        required: f.isRequired,
        ...(f.kind === 'enum' ? { enumValues: enumValues(f.type) } : {}),
      }));

    out.push({
      recordType: m.dbName ?? m.name,
      model: m.name,
      delegate: m.name.charAt(0).toLowerCase() + m.name.slice(1),
      hasAudit: m.fields.some((f) => f.name === 'createdById'),
      hasVersion: m.fields.some((f) => f.name === 'updatedAt'),
      fields,
    });
  }
  return out;
}

let cached: AssetRecordModel[] | null = null;

/** 자산 기록 모델 전부(DMMF 에서 1회 도출 후 캐시). */
export function getAssetRecordModels(): AssetRecordModel[] {
  if (!cached) cached = build();
  return cached;
}

/** recordType(테이블명) → 모델 메타. 커밋/워킹카피가 라우팅에 사용. */
export function getAssetRecordModel(recordType: string): AssetRecordModel | undefined {
  return getAssetRecordModels().find((m) => m.recordType === recordType);
}
