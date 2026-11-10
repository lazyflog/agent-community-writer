import { z } from "zod";
import { generateObject } from "./claude";

/**
 * Unsplash 이미지 검색 + Claude 선택.
 *
 * Unsplash API 가이드라인에 따라
 *  - 사진 작가 출처(attribution)를 함께 반환하고
 *  - 실제로 사용하는 사진은 download_location 을 호출해 다운로드를 집계한다.
 * https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines
 */

export interface ImageCandidate {
  id: string;
  url: string;
  description: string;
  photographer: string;
  photographerUrl: string;
  downloadLocation: string;
}

const UnsplashSearchSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      description: z.string().nullable().optional(),
      alt_description: z.string().nullable().optional(),
      urls: z.object({ regular: z.string() }),
      links: z.object({ download_location: z.string() }),
      user: z.object({ name: z.string(), links: z.object({ html: z.string() }) }),
    }),
  ),
});

const UTM = "utm_source=agent-community-writer&utm_medium=referral";

export const searchUnsplash = async (keyword: string, perPage = 10): Promise<ImageCandidate[]> => {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return [];

  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", keyword);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("orientation", "landscape");

  const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
  if (!res.ok) throw new Error(`Unsplash 검색 실패: HTTP ${res.status}`);

  const data = UnsplashSearchSchema.parse(await res.json());
  return data.results.map((p) => ({
    id: p.id,
    url: p.urls.regular,
    description: p.alt_description ?? p.description ?? "",
    photographer: p.user.name,
    photographerUrl: `${p.user.links.html}?${UTM}`,
    downloadLocation: p.links.download_location,
  }));
};

const trackDownload = async (candidate: ImageCandidate): Promise<void> => {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return;
  try {
    await fetch(candidate.downloadLocation, { headers: { Authorization: `Client-ID ${accessKey}` } });
  } catch {
    // 집계 실패는 글 생성에 영향 주지 않음
  }
};

/** 이미지 설명(alt text)을 보고 글에 어울리는 사진을 고른다 */
export const selectImages = async (opts: {
  candidates: ImageCandidate[];
  usedIds: Set<string>;
  count: number;
  title: string;
  body: string;
}): Promise<ImageCandidate[]> => {
  const { candidates, usedIds, count } = opts;
  if (count === 0 || candidates.length === 0) return [];

  const fresh = candidates.filter((c) => !usedIds.has(c.id));
  const pool = fresh.length >= count ? fresh : candidates;

  let selected = pool.slice(0, count);
  if (pool.length > count) {
    try {
      const { indices } = await generateObject({
        system: "게시글에 어울리는 이미지를 고르는 시스템입니다.",
        prompt: `아래 게시글에 가장 어울리는 이미지 ${count}개를 골라 번호를 알려줘.

[제목] ${opts.title}
[본문] ${opts.body.slice(0, 300)}

[이미지 후보]
${pool.map((c, i) => `${i}. ${c.description || "(설명 없음)"}`).join("\n")}`,
        schema: z.object({ indices: z.array(z.number().int()) }),
        effort: "low",
      });
      const picked = [...new Set(indices)]
        .map((i) => pool[i])
        .filter((c): c is ImageCandidate => c !== undefined)
        .slice(0, count);
      if (picked.length > 0) selected = picked;
    } catch (e) {
      console.warn(`   ⚠ 이미지 선택 실패, 앞에서부터 사용: ${(e as Error).message}`);
    }
  }

  await Promise.all(selected.map(trackDownload));
  return selected;
};
