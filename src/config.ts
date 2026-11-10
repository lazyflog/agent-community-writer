import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const BoardSchema = z.object({
  /** 발행 대상 시스템에서 쓰는 게시판 식별자 (예: FREE, INFO) */
  id: z.string().min(1),
  label: z.string().min(1),
  /** 게시판 성격 설명 — 프롬프트에 그대로 들어간다 */
  description: z.string().min(1),
  /** 첨부할 이미지 수 (0이면 이미지 없음) */
  images: z.number().int().min(0).max(10).default(0),
  /** 오늘의 트렌드 컨텍스트를 글감으로 쓸지 */
  useTrends: z.boolean().default(false),
  /** 한 번 실행할 때 이 게시판에 생성할 글 수 */
  postsPerRun: z.number().int().min(0).default(1),
  /** 게시판별 추가 작성 지침 */
  extraInstructions: z.string().optional(),
});

export const TrendCategorySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  /** 웹 검색으로 조사할 내용 */
  query: z.string().min(1),
});

export const CommunityConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  timezone: z.string().default("UTC"),
  boards: z.array(BoardSchema).min(1),
  trends: z
    .object({
      categories: z.array(TrendCategorySchema).default([]),
      itemsPerCategory: z.number().int().min(1).max(10).default(4),
    })
    .default({ categories: [], itemsPerCategory: 4 }),
  writing: z
    .object({
      minLength: z.number().int().min(0).default(200),
      maxLength: z.number().int().min(1).default(400),
      /** 글에서 피해야 할 표현 (평가 단계에서도 검사) */
      avoid: z.array(z.string()).default([]),
      /** 생성 → 평가 실패 시 재생성 횟수 */
      maxRetries: z.number().int().min(0).max(5).default(1),
    })
    .default({ minLength: 200, maxLength: 400, avoid: [], maxRetries: 1 }),
  disclosure: z
    .object({
      enabled: z.boolean().default(true),
      text: z.string().default("※ 이 글은 AI가 생성한 콘텐츠입니다."),
    })
    .default({ enabled: true, text: "※ 이 글은 AI가 생성한 콘텐츠입니다." }),
  history: z
    .object({
      /** 페르소나별로 기억할 최근 글 수 */
      limit: z.number().int().min(0).default(5),
    })
    .default({ limit: 5 }),
});

export type Board = z.infer<typeof BoardSchema>;
export type CommunityConfig = z.infer<typeof CommunityConfigSchema>;

export const ROOT = resolve(import.meta.dirname, "..");

export const readJson = (path: string): unknown => {
  if (!existsSync(path)) throw new Error(`파일을 찾을 수 없습니다: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
};

export const loadConfig = (): CommunityConfig => {
  const path = resolve(ROOT, process.env.COMMUNITY_CONFIG || "config/community.json");
  const result = CommunityConfigSchema.safeParse(readJson(path));
  if (!result.success) {
    throw new Error(`설정 파일이 올바르지 않습니다 (${path}):\n${z.prettifyError(result.error)}`);
  }
  return result.data;
};

/** 설정된 타임존 기준 YYYY-MM-DD */
export const todayIn = (timezone: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
