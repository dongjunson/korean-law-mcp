#!/usr/bin/env node

/**
 * 법조인용 챗 서비스 (Phase 1)
 *
 * 별도 Express 인스턴스 — 기존 MCP HTTP 서버와 독립.
 * 실행: node build/chat/server.js [--port 8080] [--env-file path/to/.env]
 *
 * 환경변수 (`.env` 자동 로드 — 프로젝트 루트 또는 --env-file):
 *   ANTHROPIC_API_KEY   (필수) Claude API 키
 *   LAW_OC              (필수) 법제처 OC 코드
 *   CHAT_PORT           기본 8080
 *   CHAT_MODEL          기본 claude-sonnet-4-6
 *   CHAT_BODY_LIMIT     기본 200kb
 *   CHAT_ENV_FILE       .env 경로 오버라이드 (--env-file 인자와 동일)
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import { config as dotenvConfig } from "dotenv"
import express from "express"
import { LawApiClient } from "../lib/api-client.js"
import { initToolExecutor } from "./tool-executor.js"
import { runChat } from "./agent-loop.js"
import type { ChatRequestBody, ChatResponseBody } from "./types.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// build/chat/server.js → project root
const PROJECT_ROOT = path.resolve(__dirname, "..", "..")
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public", "chat")

// .env 로드 — main() 진입 전에 호출되어야 process.env 반영됨.
// override:false → 셸 export된 환경변수가 우선 (CI·Docker 등에서 .env 무시 가능)
function loadEnv() {
  const args = process.argv.slice(2)
  const cliIdx = args.indexOf("--env-file")
  const cliPath = cliIdx !== -1 ? args[cliIdx + 1] : undefined
  const envPath = cliPath
    ? path.resolve(cliPath)
    : process.env.CHAT_ENV_FILE
    ? path.resolve(process.env.CHAT_ENV_FILE)
    : path.join(PROJECT_ROOT, ".env")
  dotenvConfig({ path: envPath, override: false, quiet: true })
}
loadEnv()

function parsePort(): number {
  const args = process.argv.slice(2)
  const idx = args.indexOf("--port")
  if (idx !== -1 && args[idx + 1]) return parseInt(args[idx + 1], 10)
  if (process.env.CHAT_PORT) return parseInt(process.env.CHAT_PORT, 10)
  return 8080
}

async function main() {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ""
  const LAW_OC = process.env.LAW_OC || process.env.KOREAN_LAW_API_KEY || ""

  if (!ANTHROPIC_API_KEY) {
    process.stderr.write("[chat] ANTHROPIC_API_KEY 환경변수가 필요합니다.\n")
    process.exit(1)
  }
  if (!LAW_OC) {
    process.stderr.write("[chat] LAW_OC 환경변수가 필요합니다 (법제처 API 키).\n")
    process.exit(1)
  }

  const port = parsePort()
  const model = process.env.CHAT_MODEL || "claude-sonnet-4-6"
  const bodyLimit = process.env.CHAT_BODY_LIMIT || "200kb"

  const apiClient = new LawApiClient({ apiKey: LAW_OC })
  initToolExecutor()

  const app = express()
  app.use(express.json({ limit: bodyLimit }))

  // 정적 챗 UI
  app.use(express.static(PUBLIC_DIR, { index: "index.html" }))

  app.get("/health", (_req, res) => {
    res.json({ ok: true, model, publicDir: PUBLIC_DIR })
  })

  app.post("/api/chat", async (req, res) => {
    const body = req.body as ChatRequestBody | undefined
    const question = (body?.question || "").trim()

    if (!question) {
      res.status(400).json({ error: "question is required" })
      return
    }
    if (question.length > 4000) {
      res.status(400).json({ error: "question too long (max 4000 chars)" })
      return
    }

    try {
      const result = await runChat({
        apiKey: ANTHROPIC_API_KEY,
        apiClient,
        question,
        history: body?.history,
        model,
      })
      const payload: ChatResponseBody = {
        answer: result.answer,
        toolTrace: result.toolTrace,
        usage: result.usage,
      }
      res.json(payload)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      process.stderr.write(`[chat] error: ${msg}\n`)
      res.status(500).json({ error: msg })
    }
  })

  app.listen(port, () => {
    process.stdout.write(`[chat] http://localhost:${port}  (model=${model})\n`)
  })
}

main().catch((err) => {
  process.stderr.write(`[chat] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
