import { CABLE_MEDIA } from '@twin/core';
import { z } from 'zod';

const mediumKeys = CABLE_MEDIA.map((m) => m.key) as [string, ...string[]];
/* 품셈 — null = 「안 적었다」, 0 = 「품이 안 든다」. 둘은 설계서에서 다르게 보인다. */
const manDays = z.number().min(0).nullable().optional();
const labor = {
  laborCode: z.string().trim().min(1).nullable().optional(),
  unitPrice: z.number().int().min(0).nullable().optional(),
  installManDays: manDays,
  removeManDays: manDays,
};

export const catalogBodies = {
  categories: z.object({ key: z.string().trim().min(1), name: z.string().trim().min(1), sortOrder: z.number().int().optional() }),
  'rack-types': z.object({ key: z.string().trim().min(1), name: z.string().trim().min(1), sortOrder: z.number().int().optional(), ...labor, relocateManDays: manDays }),
  'equipment-types': z.object({
    key: z.string().trim().min(1), name: z.string().trim().min(1), categoryId: z.string().uuid(),
    sortOrder: z.number().int().optional(), ...labor, relocateManDays: manDays,
  }),
  'cable-types': z.object({
    key: z.string().trim().min(1), name: z.string().trim().min(1), medium: z.enum(mediumKeys),
    sortOrder: z.number().int().optional(), ...labor,
  }),
} as const;

export type CatalogKind = keyof typeof catalogBodies;
export const CATALOG_KINDS = Object.keys(catalogBodies) as CatalogKind[];

/** 고치기 — key 는 받지 않는다(종류를 가리키는 이름이 바뀌면 시드 고르기가 어긋난다). */
export const catalogPatches = {
  categories: catalogBodies.categories.omit({ key: true }).partial(),
  'rack-types': catalogBodies['rack-types'].omit({ key: true }).partial(),
  'equipment-types': catalogBodies['equipment-types'].omit({ key: true }).partial(),
  'cable-types': catalogBodies['cable-types'].omit({ key: true }).partial(),
} as const;
