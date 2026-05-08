/**
 * Chat 서비스 타입 정의 (Phase 1)
 *
 * upstream 무수정 원칙 — 이 디렉토리(`src/chat/`)는 신규이며 기존 파일을 import만 한다.
 */

export type ChatRole = "user" | "assistant"

/** 클라이언트 ↔ 서버 단순 메시지 (UI 렌더링용) */
export interface ChatMessage {
  role: ChatRole
  text: string
  /** 답변 생성 과정에서 호출된 도구의 추적 정보 (법조인 출처 검증용) */
  toolTrace?: ToolTraceEntry[]
}

export interface ToolTraceEntry {
  name: string
  input: unknown
  /** 응답 본문 (truncate 후, UI 펼침용) */
  output: string
  isError?: boolean
  durationMs: number
}

/** Anthropic Messages API 콘텐츠 블록 (필요한 부분만) */
export type AnthropicBlock =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result"
      tool_use_id: string
      content: string | Array<{ type: "text"; text: string }>
      is_error?: boolean
    }

export interface AnthropicMessage {
  role: "user" | "assistant"
  content: string | AnthropicBlock[]
}

export interface AnthropicToolDef {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
  cache_control?: { type: "ephemeral" }
}

export interface AnthropicResponse {
  id: string
  type: "message"
  role: "assistant"
  content: AnthropicBlock[]
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | string
  usage?: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export interface ChatRequestBody {
  question: string
  history?: ChatMessage[]
}

export interface ChatResponseBody {
  answer: string
  toolTrace: ToolTraceEntry[]
  usage?: AnthropicResponse["usage"]
}
