import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { readJson, ROOT } from "./config";

export const PersonaSchema = z.object({
  /** 내부 식별자 — 히스토리 파일명으로도 쓰인다 */
  id: z.string().regex(/^[\w-]+$/, "영문/숫자/_/- 만 사용할 수 있습니다"),
  /** 발행 대상 시스템의 사용자 ID (webhook payload로 전달) */
  externalUserId: z.union([z.string(), z.number()]).optional(),
  name: z.string(),
  age: z.number().int().positive(),
  gender: z.string().optional(),
  region: z.string(),
  job: z.string(),
  /** 말투·문체 */
  style: z.string(),
  interests: z.string(),
  /** 이 커뮤니티 주제와 관련된 정보 (예: 키우는 반려동물, 타는 차, 응원하는 팀) */
  communityProfile: z.string().optional(),
  /** expand-personas 로 생성되는 상세 설정 */
  details: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});

export type Persona = z.infer<typeof PersonaSchema>;

export const personasPath = (): string =>
  resolve(ROOT, process.env.PERSONAS_PATH || "personas/personas.json");

export const loadPersonas = (): Persona[] => {
  const path = personasPath();
  const result = z.array(PersonaSchema).min(1).safeParse(readJson(path));
  if (!result.success) {
    throw new Error(`페르소나 파일이 올바르지 않습니다 (${path}):\n${z.prettifyError(result.error)}`);
  }
  const ids = new Set<string>();
  for (const p of result.data) {
    if (ids.has(p.id)) throw new Error(`중복된 페르소나 id: ${p.id}`);
    ids.add(p.id);
  }
  return result.data;
};

export const savePersonas = (personas: Persona[]): void => {
  writeFileSync(personasPath(), `${JSON.stringify(personas, null, 2)}\n`, "utf-8");
};

/** 이미 이번 실행에서 쓴 페르소나는 가능하면 피해서 무작위로 고른다 */
export const pickPersona = (personas: Persona[], usedIds: Set<string>): Persona => {
  const fresh = personas.filter((p) => !usedIds.has(p.id));
  const pool = fresh.length > 0 ? fresh : personas;
  const persona = pool[Math.floor(Math.random() * pool.length)]!;
  usedIds.add(persona.id);
  return persona;
};

export const describePersona = (p: Persona): string => {
  const lines = [
    `- 이름: ${p.name} (${p.age}세${p.gender ? `, ${p.gender}` : ""}, ${p.region})`,
    `- 직업: ${p.job}`,
    `- 말투 스타일: ${p.style}`,
    `- 관심사: ${p.interests}`,
  ];
  if (p.communityProfile) lines.push(`- 커뮤니티 관련 정보: ${p.communityProfile}`);
  for (const [key, value] of Object.entries(p.details ?? {})) {
    lines.push(`- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
  }
  return lines.join("\n");
};
