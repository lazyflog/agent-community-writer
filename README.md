# agent-community-writer

Claude로 **페르소나 기반 커뮤니티 게시글**을 생성하는 TypeScript 템플릿입니다.

> 이 프로젝트는 Anthropic의 공식 프로젝트가 아니며 Anthropic과 제휴 관계가 없습니다. Claude는 Anthropic의 상표입니다.
> *Not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.*

> Persona-driven community post generator powered by Claude. Generates posts in each persona's voice, self-reviews them, optionally weaves in today's trends and Unsplash images, then hands them to a pluggable publisher (console / file / webhook).

```
페르소나 + 게시판 설정 + 최근 글 히스토리 + 오늘의 트렌드
            │
            ▼
   ┌──────────────────┐   반려 시 피드백 반영해 재생성
   │  초안 생성 (Claude) │◀──────────────┐
   └────────┬─────────┘                │
            ▼                          │
   ┌──────────────────┐   fail         │
   │ 규칙 검사 → Claude 평가 │────────────┘
   └────────┬─────────┘
            ▼ pass
   이미지 검색(Unsplash) → Claude가 글에 맞는 사진 선택
            ▼
   AI 생성 표기 추가 → Publisher (console | file | webhook)
            ▼
   페르소나별 히스토리 저장 (다음 글의 맥락으로 사용)
```

## ⚠️ 사용 원칙

이 프로젝트는 **본인이 운영하는 커뮤니티의 초기 콘텐츠(seed), 데모, 테스트 데이터**를 만들기 위한 도구입니다.

- 다른 사람이 운영하는 플랫폼에 가상 계정으로 글을 올리는 데 쓰지 마세요. 대부분의 서비스 약관 위반이며 스팸입니다.
- 생성된 글에는 기본으로 **AI 생성 표기**가 붙습니다(`disclosure.enabled`). webhook payload에는 항상 `aiGenerated: true`가 들어갑니다.
- 페르소나는 **가상 인물**이어야 합니다. 실존 인물을 흉내 내지 마세요.

## 주요 기능

- **페르소나 말투 재현**: 이름·나이·직업·말투·관심사, 그리고 `expand-personas`로 늘린 상세 설정을 바탕으로 글을 씁니다.
- **자체 품질 검수**: 규칙 검사(길이, 인사말, 금지 표현)를 먼저 하고, 별도 컨텍스트의 Claude가 평가합니다. 반려되면 이유를 피드백으로 넣어 다시 생성합니다.
- **연속성**: 페르소나별 최근 글을 기억해서 주제가 겹치지 않게 합니다.
- **트렌드 반영**: 서버 측 웹 검색 도구로 오늘의 이슈를 모아 두고, 뉴스처럼 인용하지 않고 일상 대화의 소재로만 씁니다.
- **이미지**: Unsplash 후보 이미지의 설명을 보고 Claude가 어울리는 사진을 고릅니다. 작가 출처 정보와 다운로드 집계는 Unsplash 가이드라인을 따릅니다.
- **구조화 출력**: 모든 Claude 응답은 Zod 스키마로 강제·검증합니다. JSON 파싱 땜질이 필요 없습니다.
- **발행 대상 교체 가능**: 기본값은 콘솔 출력입니다. 파일 저장이나 webhook으로 바꿀 수 있습니다.

## 빠른 시작

```bash
git clone https://github.com/<you>/agent-community-writer.git
cd agent-community-writer
npm install
cp .env.example .env   # ANTHROPIC_API_KEY 입력
```

```bash
# 발행 없이 콘솔에 출력만 (히스토리도 저장 안 함)
npm run post -- --dry-run

# 특정 게시판에 2개만
npm run post -- --board FREE --count 2 --dry-run

# 오늘의 트렌드 수집 → context/trends.json
npm run trends

# 페르소나 상세 설정 자동 확장
npm run expand-personas
```

`.env` 파일은 자동으로 읽힙니다 (Node.js 22 이상 필요).

## 설정

### `config/community.json`

| 필드 | 설명 |
|---|---|
| `name`, `description` | 커뮤니티 이름과 성격. 시스템 프롬프트에 들어갑니다 |
| `timezone` | 트렌드 날짜 기준 타임존 |
| `boards[]` | `id`, `label`, `description`, `images`(첨부 수), `useTrends`, `postsPerRun`, `extraInstructions` |
| `trends.categories[]` | 웹 검색으로 조사할 주제 (`key`, `label`, `query`) |
| `writing` | `minLength`, `maxLength`, `avoid`(금지 표현), `maxRetries` |
| `disclosure` | AI 생성 표기 사용 여부와 문구 |
| `history.limit` | 페르소나별로 기억할 최근 글 수 |

예시는 반려동물 커뮤니티입니다. 게시판과 트렌드 카테고리만 바꾸면 자동차·육아·게임 등 다른 주제에도 그대로 쓸 수 있습니다.

### `personas/personas.json`

```json
{
  "id": "sample-01",
  "externalUserId": 1001,
  "name": "한서윤",
  "age": 29,
  "region": "서울 성동구",
  "job": "UX 디자이너",
  "style": "차분하고 꼼꼼한 말투, 문장을 짧게 끊어 씀",
  "interests": "반려동물 용품 디자인, 동네 산책 코스 찾기",
  "communityProfile": "3살 코리안숏헤어 고양이 '보리'와 둘이 산다"
}
```

- `id`: 히스토리 파일명으로 쓰입니다 (`history/<id>.json`).
- `externalUserId`: 발행 대상 시스템의 사용자 ID입니다. webhook payload로 전달됩니다.
- `details`: `expand-personas`가 채우는 상세 설정입니다. 직접 써도 됩니다.

### 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API 키 (필수) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | 비용을 줄이려면 `claude-sonnet-5-5`, `claude-haiku-5-5` |
| `CLAUDE_EFFORT` | `medium` | `low` ~ `max`. 평가·이미지 선택은 항상 `low` |
| `UNSPLASH_ACCESS_KEY` | — | 없으면 이미지 없이 진행 |
| `PUBLISHER` | `console` | `console` \| `file` \| `webhook` |
| `WEBHOOK_URL`, `WEBHOOK_TOKEN` | — | webhook 사용 시 필수. `Authorization: Bearer <token>`으로 전송 |
| `COMMUNITY_CONFIG`, `PERSONAS_PATH` | 위 기본 경로 | 설정·페르소나 파일 경로 재정의 |

정책상 거절(refusal)이 나오면 서버 측 fallback(`fallbacks: "default"`)이 다른 모델로 자동 재시도합니다.

## Publisher

### webhook payload

```json
{
  "boardId": "FREE",
  "personaId": "sample-01",
  "externalUserId": 1001,
  "title": "...",
  "body": "...\n\n※ 이 글은 AI가 생성한 콘텐츠입니다.",
  "images": [{ "url": "...", "photographer": "...", "photographerUrl": "..." }],
  "aiGenerated": true,
  "model": "claude-opus-5-5",
  "generatedAt": "2026-11-10T03:00:00.000Z"
}
```

받는 쪽 엔드포인트는 **반드시 토큰을 검증**해야 합니다. 인증 없는 글쓰기 API를 열어 두면 누구나 임의의 사용자로 글을 쓸 수 있습니다. Unsplash 이미지를 게시할 때는 `photographer`/`photographerUrl`로 출처를 표시하세요.

### 직접 추가하기

`src/publishers/index.ts`의 `Publisher` 인터페이스(`publish(post) => Promise<string>`)를 구현해서 `createPublisher`에 등록하면 됩니다.

## GitHub Actions

`.github/workflows/post.yml`은 **수동 실행만** 켜져 있고, 기본값이 dry-run입니다.

1. 저장소 Secrets에 `ANTHROPIC_API_KEY` (필요하면 `UNSPLASH_ACCESS_KEY`, `WEBHOOK_URL`, `WEBHOOK_TOKEN`)를 등록합니다.
2. Variables에 `PUBLISHER`(예: `webhook`)와 `CLAUDE_MODEL`(선택)을 설정합니다.
3. 자동 실행이 필요하면 워크플로의 `schedule` 주석을 해제합니다.

실행 후 `history/`, `context/` 변경분이 커밋됩니다. 페르소나와 히스토리가 공개되면 곤란하다면 **private 저장소**에서 운영하세요.

## 구조

```
src/
├─ claude.ts            # Claude API 래퍼 (구조화 출력, 웹 검색, fallback)
├─ config.ts            # 커뮤니티 설정 스키마/로더
├─ personas.ts          # 페르소나 스키마/선택
├─ history.ts           # 페르소나별 최근 글
├─ trends.ts            # 웹 검색 기반 트렌드 수집
├─ images.ts            # Unsplash 검색 + 선택
├─ generate.ts          # 초안 생성 + 평가
├─ publishers/index.ts  # console / file / webhook
└─ cli/                 # post, trends, expand-personas
```

## 비용

글 1개당 Claude 호출은 대략 2~4회(생성, 평가, 이미지 선택, 재시도)입니다. 먼저 `--dry-run`과 `--count 1`로 사용량을 확인하세요. 모델별 단가는 [Anthropic 가격 페이지](https://www.anthropic.com/pricing)에서 볼 수 있습니다.

## License

MIT
