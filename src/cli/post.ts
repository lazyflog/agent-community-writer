import { parseArgs } from "node:util";
import { MODEL } from "../claude";
import { type Board, type CommunityConfig, loadConfig } from "../config";
import { evaluateDraft, generateDraft, type Draft } from "../generate";
import { appendHistory, loadHistory } from "../history";
import { type ImageCandidate, searchUnsplash, selectImages } from "../images";
import { loadPersonas, type Persona, pickPersona } from "../personas";
import { createPublisher, type PostPayload, type Publisher } from "../publishers";
import { loadTodayTrends, type Trends } from "../trends";

const { values: args } = parseArgs({
  options: {
    board: { type: "string", short: "b" },
    count: { type: "string", short: "n" },
    "dry-run": { type: "boolean", default: false },
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const writeWithReview = async (ctx: {
  config: CommunityConfig;
  board: Board;
  persona: Persona;
  trends: Trends | null;
}): Promise<Draft> => {
  const history = loadHistory(ctx.persona.id);
  if (history.length > 0) console.log(`   📖 이전 글 ${history.length}개 참고`);

  let feedback: string[] | undefined;
  let draft: Draft | undefined;
  const attempts = ctx.config.writing.maxRetries + 1;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    draft = await generateDraft({ ...ctx, history, feedback });
    console.log(`   📝 [${attempt}/${attempts}] ${draft.title}`);

    const evaluation = await evaluateDraft({ ...ctx, draft });
    if (evaluation.pass) {
      console.log("   ✅ 품질 평가 통과");
      return draft;
    }
    console.warn(`   ⚠ 평가 실패: ${evaluation.reasons.join(" / ")}`);
    feedback = evaluation.reasons;
  }

  console.warn("   ⚠ 재시도 한도 초과 → 마지막 초안 사용");
  return draft!;
};

const attachImages = async (board: Board, persona: Persona, draft: Draft): Promise<ImageCandidate[]> => {
  if (board.images === 0) return [];
  if (!process.env.UNSPLASH_ACCESS_KEY) {
    console.warn("   ⚠ UNSPLASH_ACCESS_KEY 없음 → 이미지 생략");
    return [];
  }
  try {
    console.log(`   🔍 이미지 검색: "${draft.imageKeyword}"`);
    const candidates = await searchUnsplash(draft.imageKeyword);
    const usedIds = new Set(loadHistory(persona.id).flatMap((h) => h.imageIds));
    const selected = await selectImages({
      candidates,
      usedIds,
      count: board.images,
      title: draft.title,
      body: draft.body,
    });
    console.log(`   🖼  이미지 ${selected.length}개 선택`);
    return selected;
  } catch (e) {
    console.warn(`   ⚠ 이미지 처리 실패 → 생략: ${(e as Error).message}`);
    return [];
  }
};

const processPost = async (ctx: {
  config: CommunityConfig;
  board: Board;
  persona: Persona;
  trends: Trends | null;
  publisher: Publisher;
  dryRun: boolean;
}) => {
  const { config, board, persona } = ctx;
  console.log(`\n   👤 ${persona.name} (${persona.age}세, ${persona.job}) — ${persona.id}`);

  const draft = await writeWithReview(ctx);
  const images = await attachImages(board, persona, draft);

  const body = config.disclosure.enabled ? `${draft.body}\n\n${config.disclosure.text}` : draft.body;
  const payload: PostPayload = {
    boardId: board.id,
    personaId: persona.id,
    externalUserId: persona.externalUserId,
    title: draft.title,
    body,
    images: images.map(({ url, photographer, photographerUrl }) => ({ url, photographer, photographerUrl })),
    aiGenerated: true,
    model: MODEL,
    generatedAt: new Date().toISOString(),
  };

  const result = await ctx.publisher.publish(payload);
  console.log(`   📤 [${ctx.publisher.name}] ${result}`);

  if (!ctx.dryRun) {
    appendHistory(
      persona.id,
      {
        boardId: board.id,
        boardLabel: board.label,
        title: draft.title,
        body: draft.body,
        imageIds: images.map((i) => i.id),
        postedAt: payload.generatedAt,
      },
      config.history.limit,
    );
  }
};

const main = async () => {
  const config = loadConfig();
  const personas = loadPersonas();
  const dryRun = args["dry-run"] ?? false;
  const publisher = createPublisher(dryRun ? "console" : undefined);
  const trends = loadTodayTrends(config);

  const boards = args.board ? config.boards.filter((b) => b.id === args.board) : config.boards;
  if (boards.length === 0) throw new Error(`게시판을 찾을 수 없습니다: ${args.board}`);

  const countOverride = args.count ? Number.parseInt(args.count, 10) : undefined;
  if (countOverride !== undefined && !(countOverride >= 0)) throw new Error(`--count 값이 올바르지 않습니다: ${args.count}`);

  console.log("=".repeat(50));
  console.log(`🤖 ${config.name} — 글 생성 시작`);
  console.log(`   모델: ${MODEL} | 발행: ${publisher.name}${dryRun ? " (dry-run)" : ""}`);
  console.log(`   페르소나 ${personas.length}명 | 트렌드: ${trends ? trends.date : "없음"}`);
  console.log("=".repeat(50));

  const usedPersonaIds = new Set<string>();
  let ok = 0;
  let failed = 0;

  for (const board of boards) {
    const count = countOverride ?? board.postsPerRun;
    if (count === 0) continue;
    console.log(`\n📂 ${board.label} (${board.id}) — ${count}개`);

    for (let i = 0; i < count; i++) {
      try {
        const persona = pickPersona(personas, usedPersonaIds);
        await processPost({ config, board, persona, trends, publisher, dryRun });
        ok++;
      } catch (e) {
        failed++;
        console.error(`   ❌ ${(e as Error).message}`);
      }
      await sleep(1000);
    }
  }

  console.log(`\n✨ 완료 — 성공 ${ok} / 실패 ${failed}`);
  if (ok === 0 && failed > 0) process.exitCode = 1;
};

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}`);
  process.exit(1);
});
