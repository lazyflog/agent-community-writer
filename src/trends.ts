import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { generateObject, researchWithWebSearch } from "./claude";
import { type CommunityConfig, ROOT, todayIn } from "./config";

const TRENDS_PATH = join(ROOT, "context", "trends.json");

export const TrendsSchema = z.object({
  date: z.string(),
  categories: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      items: z.array(z.string()),
    }),
  ),
});

export type Trends = z.infer<typeof TrendsSchema>;

/** 웹 검색 → 구조화 2단계로 오늘의 트렌드를 수집해 context/trends.json 에 저장 */
export const collectTrends = async (config: CommunityConfig): Promise<Trends> => {
  const { categories, itemsPerCategory } = config.trends;
  if (categories.length === 0) throw new Error("config.trends.categories 가 비어 있습니다");

  const date = todayIn(config.timezone);

  const raw = await researchWithWebSearch(
    `오늘(${date}) 기준으로 다음 항목을 각각 웹 검색해서 핵심 내용을 요약해줘.

${categories.map((c, i) => `${i + 1}. [${c.label}] ${c.query}`).join("\n")}

각 항목마다 ${itemsPerCategory}개 안팎의 핵심 키워드나 짧은 문장으로 정리해줘.`,
  );
  if (raw.trim().length < 50) throw new Error("웹 검색 결과가 너무 짧습니다");

  const structured = await generateObject({
    system: "주어진 조사 결과를 지정된 스키마에 맞게 정리하는 시스템입니다. 원문에 없는 내용은 만들지 않습니다.",
    prompt: `아래 조사 결과를 카테고리별로 정리해줘. 각 항목은 30자 이내.

[카테고리]
${categories.map((c) => `- key: ${c.key} / label: ${c.label}`).join("\n")}

[조사 결과]
${raw}`,
    schema: z.object({
      categories: z.array(z.object({ key: z.string(), items: z.array(z.string()) })),
    }),
    effort: "low",
  });

  const trends: Trends = {
    date,
    categories: categories.map((c) => ({
      key: c.key,
      label: c.label,
      items: (structured.categories.find((s) => s.key === c.key)?.items ?? []).slice(0, itemsPerCategory),
    })),
  };

  mkdirSync(join(ROOT, "context"), { recursive: true });
  writeFileSync(TRENDS_PATH, `${JSON.stringify(trends, null, 2)}\n`, "utf-8");
  return trends;
};

/** 오늘 날짜의 트렌드만 반환 (없거나 지난 날짜면 null) */
export const loadTodayTrends = (config: CommunityConfig): Trends | null => {
  if (!existsSync(TRENDS_PATH)) return null;
  const result = TrendsSchema.safeParse(JSON.parse(readFileSync(TRENDS_PATH, "utf-8")));
  if (!result.success) return null;
  return result.data.date === todayIn(config.timezone) ? result.data : null;
};
