import { parseArgs } from "node:util";
import { z } from "zod";
import { generateObject } from "../claude";
import { loadPersonas, type Persona, savePersonas } from "../personas";

/**
 * 기본 정보만 있는 페르소나에 상세 설정(details)을 채운다.
 * 이미 details 가 있는 페르소나는 건너뛴다 (--force 로 덮어쓰기).
 */

const { values: args } = parseArgs({
  options: { force: { type: "boolean", default: false } },
});

const DetailsSchema = z.object({
  생활: z.string().describe("주거 형태, 함께 사는 사람, 하루 일과를 2~3문장으로"),
  성격: z.string().describe("성격과 대인 관계 스타일 2~3문장"),
  취미: z.array(z.string()).describe("구체적인 취미 3~5개"),
  "자주 쓰는 표현": z.array(z.string()).describe("말버릇이나 자주 쓰는 표현 3~5개"),
  "요즘 고민": z.string().describe("최근의 소소한 고민 1~2문장"),
});

const expand = async (p: Persona) =>
  generateObject({
    system: "가상의 인물 설정을 일관성 있게 확장하는 작가입니다. 실존 인물을 묘사하지 않습니다.",
    prompt: `다음 가상 인물의 설정을 구체적으로 확장해줘. 나이·직업·지역·말투와 모순되지 않게.

- 이름: ${p.name} (${p.age}세${p.gender ? `, ${p.gender}` : ""}, ${p.region})
- 직업: ${p.job}
- 말투: ${p.style}
- 관심사: ${p.interests}
${p.communityProfile ? `- 커뮤니티 관련 정보: ${p.communityProfile}` : ""}`,
    schema: DetailsSchema,
  });

const main = async () => {
  const personas = loadPersonas();
  let expanded = 0;

  for (const [i, p] of personas.entries()) {
    const tag = `[${i + 1}/${personas.length}] ${p.name} (${p.id})`;
    if (p.details && !args.force) {
      console.log(`   ${tag} — 건너뜀`);
      continue;
    }
    try {
      console.log(`   ${tag} — 확장 중...`);
      personas[i] = { ...p, details: await expand(p) };
      savePersonas(personas); // 중간에 실패해도 진행분 보존
      expanded++;
    } catch (e) {
      console.error(`   ❌ ${tag}: ${(e as Error).message}`);
    }
  }

  console.log(`\n✅ ${expanded}명 확장 완료`);
};

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}`);
  process.exit(1);
});
