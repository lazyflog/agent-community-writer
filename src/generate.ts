import { z } from "zod";
import { generateObject } from "./claude";
import type { Board, CommunityConfig } from "./config";
import type { HistoryEntry } from "./history";
import { describePersona, type Persona } from "./personas";
import type { Trends } from "./trends";

export const DraftSchema = z.object({
  title: z.string().describe("제목 (40자 이내, 자연스러운 커뮤니티 말투)"),
  body: z.string().describe("본문 (순수 텍스트, 줄바꿈 허용, HTML/마크다운 금지)"),
  imageKeyword: z
    .string()
    .describe("이미지 검색용 영어 키워드 1~3단어, 단순 명사 위주 (예: golden retriever, latte art)"),
});

export type Draft = z.infer<typeof DraftSchema>;

const EvaluationSchema = z.object({
  pass: z.boolean(),
  reasons: z.array(z.string()).describe("실패 이유. pass=true 이면 빈 배열"),
});

export type Evaluation = z.infer<typeof EvaluationSchema>;

const BASE_RULES = [
  '"안녕하세요", "여러분" 같은 인사말로 시작하지 않는다',
  "이름·닉네임 등 자기소개를 하지 않는다",
  '"오늘은 ~에 대해 알아볼게요" 같은 블로그/유튜브식 인트로를 쓰지 않는다',
  "본론부터 바로 시작한다",
];

const rulesOf = (config: CommunityConfig) => [
  ...BASE_RULES,
  ...config.writing.avoid.map((a) => `"${a}" 표현을 쓰지 않는다`),
];

const bodyPreview = (body: string) => body.split("\n").find((l) => l.trim())?.slice(0, 60) ?? "";

const historyBlock = (history: HistoryEntry[]) =>
  history.length === 0
    ? ""
    : `
[내가 최근에 쓴 글 — 주제가 겹치지 않게 하고, 필요하면 자연스럽게 이어갈 것]
${history.map((h, i) => `${i + 1}. [${h.boardLabel}] ${h.title} — ${bodyPreview(h.body)}...`).join("\n")}
`;

const trendsBlock = (trends: Trends | null) =>
  !trends
    ? ""
    : `
[오늘의 배경 정보 — 뉴스처럼 인용하지 말고, 일상 대화의 소재나 뉘앙스로만 자연스럽게 녹일 것]
${trends.categories.map((c) => `- ${c.label}: ${c.items.join(", ")}`).join("\n")}
`;

export const generateDraft = async (opts: {
  config: CommunityConfig;
  board: Board;
  persona: Persona;
  history: HistoryEntry[];
  trends: Trends | null;
  feedback?: string[];
}): Promise<Draft> => {
  const { config, board, persona } = opts;
  const { minLength, maxLength } = config.writing;

  const feedbackBlock = opts.feedback?.length
    ? `\n[이전 초안이 아래 이유로 반려됐다. 반드시 고쳐서 다시 쓸 것]\n${opts.feedback.map((f) => `- ${f}`).join("\n")}\n`
    : "";

  return generateObject({
    system: `당신은 "${config.name}"(${config.description}) 커뮤니티의 평범한 회원입니다.
주어진 페르소나 그대로 글을 씁니다. 지켜야 할 규칙:
${rulesOf(config).map((r) => `- ${r}`).join("\n")}`,
    prompt: `[내 정보]
${describePersona(persona)}
${historyBlock(opts.history)}${board.useTrends ? trendsBlock(opts.trends) : ""}
[작성할 게시판]
- 게시판: ${board.label}
- 성격: ${board.description}
${board.extraInstructions ? `- 추가 지침: ${board.extraInstructions}\n` : ""}${feedbackBlock}
위 페르소나로 이 게시판에 올릴 글 하나를 써줘.
본문은 ${minLength}~${maxLength}자, 페르소나의 말투를 그대로 살릴 것.`,
    schema: DraftSchema,
  });
};

/** 규칙 기반으로 바로 걸러낼 수 있는 문제 */
const ruleCheck = (config: CommunityConfig, draft: Draft): string[] => {
  const reasons: string[] = [];
  const len = draft.body.length;
  if (len < config.writing.minLength) reasons.push(`본문이 너무 짧음 (${len}자 < ${config.writing.minLength}자)`);
  if (len > config.writing.maxLength * 1.3) reasons.push(`본문이 너무 김 (${len}자)`);
  if (/^\s*(안녕하세요|여러분|반갑습니다)/.test(draft.body)) reasons.push("인사말로 시작함");
  for (const word of config.writing.avoid) {
    if (draft.body.includes(word) || draft.title.includes(word)) reasons.push(`금지 표현 사용: "${word}"`);
  }
  return reasons;
};

/** 규칙 검사 → 별도 컨텍스트의 Claude 평가 순으로 검증 */
export const evaluateDraft = async (opts: {
  config: CommunityConfig;
  board: Board;
  persona: Persona;
  draft: Draft;
}): Promise<Evaluation> => {
  const { config, board, persona, draft } = opts;

  const ruleFailures = ruleCheck(config, draft);
  if (ruleFailures.length > 0) return { pass: false, reasons: ruleFailures };

  return generateObject({
    system: "커뮤니티 게시글 품질을 엄격하게 평가하는 심사자입니다.",
    prompt: `아래 게시글을 평가해줘.

[페르소나 말투] ${persona.style}
[게시판] ${board.label} — ${board.description}

[제목] ${draft.title}
[본문] ${draft.body}

다음 중 하나라도 해당하면 fail:
${rulesOf(config).map((r, i) => `${i + 1}. 규칙 위반: ${r}`).join("\n")}
${rulesOf(config).length + 1}. 페르소나 말투와 맞지 않음
${rulesOf(config).length + 2}. 게시판 성격과 맞지 않음
${rulesOf(config).length + 3}. 광고·홍보성이거나 사실이 아닌 정보를 단정적으로 전달함`,
    schema: EvaluationSchema,
    effort: "low",
  });
};
