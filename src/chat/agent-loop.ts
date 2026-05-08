/**
 * Anthropic Messages API + tool_use 루프
 *
 * - SDK 미사용 (package.json 무수정 원칙) → fetch 직접 호출
 * - 프롬프트 캐싱: system + tools 마지막 블록에 cache_control: ephemeral
 * - 최대 반복 안전장치: 12 turns
 */

import { LawApiClient } from "../lib/api-client.js"
import { SYSTEM_PROMPT } from "./system-prompt.js"
import { buildExposedTools } from "./tool-bridge.js"
import { callTool } from "./tool-executor.js"
import type {
  AnthropicBlock,
  AnthropicMessage,
  AnthropicResponse,
  ChatMessage,
  ToolTraceEntry,
} from "./types.js"

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const MAX_TURNS = 12

export interface RunChatOptions {
  apiKey: string
  apiClient: LawApiClient
  question: string
  history?: ChatMessage[]
  /** 기본 claude-sonnet-4-6 (정확성·비용 균형). opus도 선택 가능. */
  model?: string
  /** 기본 8192. tool 루프 중에는 토큰 부족 회피용 여유분 필요. */
  maxTokens?: number
}

export interface RunChatResult {
  answer: string
  toolTrace: ToolTraceEntry[]
  usage?: AnthropicResponse["usage"]
}

/** 단순 ChatMessage 히스토리 → Anthropic messages 변환 (tool_use는 보존하지 않음 — Phase 1) */
function historyToMessages(history: ChatMessage[] | undefined): AnthropicMessage[] {
  if (!history?.length) return []
  return history.map((m) => ({
    role: m.role,
    content: m.text,
  }))
}

async function callAnthropic(
  apiKey: string,
  body: Record<string, unknown>
): Promise<AnthropicResponse> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 500)}`)
  }

  return (await res.json()) as AnthropicResponse
}

export async function runChat(opts: RunChatOptions): Promise<RunChatResult> {
  const {
    apiKey,
    apiClient,
    question,
    history,
    model = "claude-sonnet-4-6",
    maxTokens = 8192,
  } = opts

  const tools = buildExposedTools()
  const trace: ToolTraceEntry[] = []
  const totalUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }

  const messages: AnthropicMessage[] = [
    ...historyToMessages(history),
    { role: "user", content: question },
  ]

  let finalText = ""

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await callAnthropic(apiKey, {
      model,
      max_tokens: maxTokens,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      tools,
      messages,
    })

    if (resp.usage) {
      totalUsage.input_tokens += resp.usage.input_tokens || 0
      totalUsage.output_tokens += resp.usage.output_tokens || 0
      totalUsage.cache_creation_input_tokens += resp.usage.cache_creation_input_tokens || 0
      totalUsage.cache_read_input_tokens += resp.usage.cache_read_input_tokens || 0
    }

    // 어시스턴트 응답을 messages에 누적 (다음 turn에서 tool_result와 짝지어야 함)
    messages.push({ role: "assistant", content: resp.content })

    if (resp.stop_reason === "end_turn" || resp.stop_reason === "stop_sequence") {
      finalText = extractText(resp.content)
      break
    }

    if (resp.stop_reason === "max_tokens") {
      finalText =
        extractText(resp.content) +
        "\n\n*(응답이 max_tokens 제한으로 잘렸습니다. 더 구체적인 질문으로 재시도하세요.)*"
      break
    }

    if (resp.stop_reason === "tool_use") {
      const toolResults: AnthropicBlock[] = []
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue
        const result = await callTool(apiClient, block.name, block.input)
        trace.push(result.trace)
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.content || "(empty)",
          is_error: result.isError,
        })
      }
      messages.push({ role: "user", content: toolResults })
      continue
    }

    // 알 수 없는 stop_reason
    finalText = extractText(resp.content) || `(예상치 못한 stop_reason: ${resp.stop_reason})`
    break
  }

  if (!finalText) {
    finalText = "*(최대 반복(MAX_TURNS=12)을 초과했습니다. 질문을 더 구체적으로 다시 시도해 주세요.)*"
  }

  return { answer: finalText, toolTrace: trace, usage: totalUsage }
}

function extractText(content: AnthropicBlock[]): string {
  return content
    .filter((b): b is Extract<AnthropicBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim()
}
