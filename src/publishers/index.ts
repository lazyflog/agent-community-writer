import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../config";

export interface PublishImage {
  url: string;
  photographer: string;
  photographerUrl: string;
}

export interface PostPayload {
  boardId: string;
  personaId: string;
  externalUserId?: string | number;
  title: string;
  body: string;
  images: PublishImage[];
  /** AI 생성 여부 — 발행 측에서 라벨을 붙일 수 있도록 항상 전달 */
  aiGenerated: true;
  model: string;
  generatedAt: string;
}

export interface Publisher {
  readonly name: string;
  publish(post: PostPayload): Promise<string>;
}

/** 기본값: 아무 데도 보내지 않고 콘솔에 출력 */
const consolePublisher: Publisher = {
  name: "console",
  async publish(post) {
    console.log(`\n   ┌─ ${post.title}`);
    for (const line of post.body.split("\n")) console.log(`   │ ${line}`);
    for (const img of post.images) console.log(`   │ 🖼  ${img.url} (Photo by ${img.photographer})`);
    console.log("   └─");
    return "printed";
  },
};

/** output/ 디렉터리에 JSON 파일로 저장 */
const filePublisher: Publisher = {
  name: "file",
  async publish(post) {
    const dir = join(ROOT, "output");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${post.generatedAt.replace(/[:.]/g, "-")}_${post.boardId}_${post.personaId}.json`);
    writeFileSync(file, `${JSON.stringify(post, null, 2)}\n`, "utf-8");
    return file;
  },
};

/** 임의의 HTTP 엔드포인트로 POST. 엔드포인트는 반드시 인증을 요구하도록 구성할 것 */
const webhookPublisher = (): Publisher => {
  const url = process.env.WEBHOOK_URL;
  const token = process.env.WEBHOOK_TOKEN;
  if (!url) throw new Error("PUBLISHER=webhook 에는 WEBHOOK_URL 이 필요합니다");
  if (!token) throw new Error("PUBLISHER=webhook 에는 WEBHOOK_TOKEN 이 필요합니다 (인증 없는 엔드포인트 사용 금지)");

  return {
    name: "webhook",
    async publish(post) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
        body: JSON.stringify(post),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`webhook 응답 오류 HTTP ${res.status}: ${text.slice(0, 200)}`);
      return text.slice(0, 200);
    },
  };
};

export const createPublisher = (name = process.env.PUBLISHER || "console"): Publisher => {
  switch (name) {
    case "console":
      return consolePublisher;
    case "file":
      return filePublisher;
    case "webhook":
      return webhookPublisher();
    default:
      throw new Error(`알 수 없는 PUBLISHER: ${name} (console | file | webhook)`);
  }
};
