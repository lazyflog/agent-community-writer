import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT } from "./config";

const HISTORY_DIR = join(ROOT, "history");

export const HistoryEntrySchema = z.object({
  boardId: z.string(),
  boardLabel: z.string(),
  title: z.string(),
  body: z.string(),
  imageIds: z.array(z.string()).default([]),
  postedAt: z.string(),
});

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

const pathOf = (personaId: string) => join(HISTORY_DIR, `${personaId}.json`);

export const loadHistory = (personaId: string): HistoryEntry[] => {
  const path = pathOf(personaId);
  if (!existsSync(path)) return [];
  const result = z.array(HistoryEntrySchema).safeParse(JSON.parse(readFileSync(path, "utf-8")));
  if (!result.success) {
    console.warn(`   ⚠ 히스토리 형식 오류, 무시합니다: ${path}`);
    return [];
  }
  return result.data;
};

export const appendHistory = (personaId: string, entry: HistoryEntry, limit: number): HistoryEntry[] => {
  if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
  const next = [...loadHistory(personaId), entry].slice(-limit);
  writeFileSync(pathOf(personaId), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return next;
};
