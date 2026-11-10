<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/agent-community-writer-logo-dark.png">
    <img src="assets/agent-community-writer-logo.png" alt="agent-community-writer" width="600">
  </picture>
</p>

<p align="center"><b>English</b> | <a href="README.ko.md">한국어</a></p>

A TypeScript template that uses Claude to generate **persona-driven community posts**.

> Not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.

Each post is written in a persona's voice and reviewed before it goes out. You can mix in today's trends and Unsplash images, and send the result to a publisher you choose (console, file, or webhook).

```
persona + board config + recent post history + today's trends
            │
            ▼
   ┌──────────────────────┐   on rejection, regenerate with feedback
   │  Draft (Claude)      │◀──────────────┐
   └────────┬─────────────┘               │
            ▼                             │
   ┌──────────────────────┐   fail        │
   │ Rule check → Claude  │───────────────┘
   │ review               │
   └────────┬─────────────┘
            ▼ pass
   Image search (Unsplash) → Claude picks photos that fit the post
            ▼
   Append AI disclosure → Publisher (console | file | webhook)
            ▼
   Save per-persona history (used as context for the next post)
```

> **Language note:** The prompts and the sample config/personas are in Korean, so generated posts come out in Korean. To target another language, translate the prompt text in `src/generate.ts`, `src/trends.ts`, and `src/cli/expand-personas.ts`, then rewrite the config and personas in that language.

## ⚠️ Acceptable use

This tool creates **seed content, demos, and test data for a community you run yourself**.

- Don't use it to post from fake accounts on platforms run by others. Most services forbid this in their terms, and it is spam.
- An **AI-generated notice** is appended to every post by default (`disclosure.enabled`). The webhook payload always includes `aiGenerated: true`.
- Personas must be **fictional**. Do not impersonate real people.

## Features

- **Persona voice.** Posts are based on each persona's name, age, job, speaking style, and interests, plus any extra detail added by `expand-personas`.
- **Self-review.** Rule checks (length, greetings, banned phrases) run first. Then Claude reviews the draft in a separate context. If the draft is rejected, the reasons go back into the prompt for the next attempt.
- **Continuity.** Recent posts are remembered per persona so topics don't repeat.
- **Trends.** The server-side web search tool collects today's topics. They are worked into posts as casual conversation, not quoted like news.
- **Images.** Claude reads the descriptions of Unsplash candidates and picks the ones that fit. Photographer attribution and download tracking follow the Unsplash API guidelines.
- **Structured outputs.** Every Claude response is constrained and validated with a Zod schema, so there is no fragile JSON parsing.
- **Pluggable publishers.** Output goes to the console by default. You can switch to file output or a webhook.

## Quick start

Requires Node.js 22 or later.

```bash
git clone https://github.com/<you>/agent-community-writer.git
cd agent-community-writer
npm install
cp .env.example .env   # set ANTHROPIC_API_KEY
```

```bash
# Print to the console only: nothing is published and no history is saved
npm run post -- --dry-run

# Only 2 posts, only on one board
npm run post -- --board FREE --count 2 --dry-run

# Collect today's trends → context/trends.json
npm run trends

# Generate extra detail for each persona
npm run expand-personas
```

The `.env` file is loaded automatically.

## Configuration

### `config/community.json`

| Field | Description |
|---|---|
| `name`, `description` | Community name and character, used in the system prompt |
| `timezone` | Time zone that decides the date for trends |
| `boards[]` | `id`, `label`, `description`, `images` (how many to attach), `useTrends`, `postsPerRun`, `extraInstructions` |
| `trends.categories[]` | Topics to research with web search (`key`, `label`, `query`) |
| `writing` | `minLength`, `maxLength`, `avoid` (banned phrases), `maxRetries` |
| `disclosure` | Turns the AI-generated notice on or off and sets its text |
| `history.limit` | How many recent posts to remember per persona |

The sample is a pet-owner community. Change the boards and trend categories to use it for other topics, such as cars, parenting, or games.

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

- `id`: also the history file name (`history/<id>.json`).
- `externalUserId`: the user ID in the system you publish to. It is passed through in the webhook payload.
- `communityProfile`: persona details tied to the community's topic, such as their pet, car, or favorite team.
- `details`: extra persona detail filled in by `expand-personas`. You can also write it yourself.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key (required) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Use `claude-sonnet-5-5` or `claude-haiku-5-5` to cut costs |
| `CLAUDE_EFFORT` | `medium` | `low` to `max`. Review and image selection always use `low` |
| `UNSPLASH_ACCESS_KEY` | — | If unset, posts are generated without images |
| `PUBLISHER` | `console` | `console` \| `file` \| `webhook` |
| `WEBHOOK_URL`, `WEBHOOK_TOKEN` | — | Required for the webhook publisher. The token is sent as `Authorization: Bearer <token>` |
| `COMMUNITY_CONFIG`, `PERSONAS_PATH` | default paths above | Override where the config and persona files are read from |

If Claude declines a request for policy reasons, the server-side fallback (`fallbacks: "default"`) retries it on another model automatically.

## Publishers

### Webhook payload

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

The receiving endpoint **must verify the token**. A write API with no authentication lets anyone post as any user. When you display Unsplash images, credit the photographer using `photographer` and `photographerUrl`.

### Writing your own

Implement the `Publisher` interface in `src/publishers/index.ts` (`publish(post) => Promise<string>`) and register it in `createPublisher`.

## GitHub Actions

`.github/workflows/post.yml` runs **only when triggered manually**, and dry-run is on by default.

1. Add `ANTHROPIC_API_KEY` to the repository secrets, plus `UNSPLASH_ACCESS_KEY`, `WEBHOOK_URL`, and `WEBHOOK_TOKEN` if you use them.
2. Set `PUBLISHER` (for example `webhook`) and, optionally, `CLAUDE_MODEL` as repository variables.
3. To run on a schedule, uncomment the `schedule` block in the workflow.

Each run commits changes in `history/` and `context/`. If your personas and history shouldn't be public, run it from a **private repository**.

## Project layout

```
src/
├─ claude.ts            # Claude API wrapper (structured outputs, web search, fallback)
├─ config.ts            # community config schema and loader
├─ personas.ts          # persona schema and selection
├─ history.ts           # recent posts per persona
├─ trends.ts            # trend collection with web search
├─ images.ts            # Unsplash search and selection
├─ generate.ts          # drafting and review
├─ publishers/index.ts  # console / file / webhook
└─ cli/                 # post, trends, expand-personas
```

## Cost

Each post takes about 2–4 Claude calls (draft, review, image selection, and any retries). Start with `--dry-run` and `--count 1` to see what a run uses. See [Anthropic's pricing page](https://www.anthropic.com/pricing) for per-model rates.

## License

MIT
