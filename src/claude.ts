import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * Claude API 공용 래퍼.
 *
 * - 인증: ANTHROPIC_API_KEY (또는 SDK가 지원하는 다른 자격 증명)
 * - 모델: CLAUDE_MODEL (기본 claude-opus-5-5)
 * - 정책상 거절(refusal) 시 서버 측 fallback 모델로 자동 재시도하도록
 *   `fallbacks: "default"`를 켜 둔다. 지원하지 않는 모델에서는 무시된다.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

const parseEffort = (value: string | undefined): Effort => {
  if (value && (EFFORTS as readonly string[]).includes(value)) return value as Effort;
  return "medium";
};

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const DEFAULT_EFFORT = parseEffort(process.env.CLAUDE_EFFORT);
const BETAS = ["server-side-fallback-2026-07-01"];
const MAX_TOKENS = 16_000;
const MAX_CONTINUATIONS = 5;

let client: Anthropic | undefined;
const getClient = (): Anthropic => (client ??= new Anthropic());

export class ClaudeRefusalError extends Error {
  constructor(category: string | null | undefined) {
    super(`Claude가 요청을 거절했습니다 (category: ${category ?? "unknown"})`);
    this.name = "ClaudeRefusalError";
  }
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]): string =>
  content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

/**
 * 구조화 출력(JSON 스키마 강제)으로 결과를 받는다.
 * 응답이 스키마를 만족하지 않으면 예외를 던진다.
 */
export async function generateObject<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
}): Promise<z.infer<S>> {
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: BETAS,
    fallbacks: "default",
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: {
      effort: opts.effort ?? DEFAULT_EFFORT,
      format: betaZodOutputFormat(opts.schema),
    },
  });

  if (res.stop_reason === "refusal") throw new ClaudeRefusalError(res.stop_details?.category);
  if (res.parsed_output == null) {
    throw new Error(`구조화 출력 파싱 실패 (stop_reason: ${res.stop_reason})`);
  }
  return res.parsed_output as z.infer<S>;
}

/**
 * 서버 측 웹 검색 도구를 써서 자유 텍스트로 조사 결과를 받는다.
 * 서버 루프가 길어져 `pause_turn`으로 멈추면 이어서 요청한다.
 */
export async function researchWithWebSearch(
  prompt: string,
  { maxUses = 8, effort }: { maxUses?: number; effort?: Effort } = {},
): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let text = "";

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const res = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: effort ?? DEFAULT_EFFORT },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxUses }],
      messages,
    });

    if (res.stop_reason === "refusal") throw new ClaudeRefusalError(res.stop_details?.category);
    text += textOf(res.content);

    if (res.stop_reason !== "pause_turn") return text;
    messages.push({ role: "assistant", content: res.content });
  }

  return text;
}
