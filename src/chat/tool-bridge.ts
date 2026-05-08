/**
 * 91개 MCP 도구 → Anthropic tool_use 스키마 변환
 *
 * upstream 무수정 원칙: tool-registry.ts를 import만 하고 수정하지 않는다.
 * V3_EXPOSED 목록은 tool-registry.ts에서 export되지 않아 여기서 동기 복제 사용.
 * upstream에서 V3_EXPOSED가 변경될 경우 이 파일도 따라 수정 필요 (충돌은 발생하지 않음).
 */

import { z } from "zod"
import { allTools } from "../tool-registry.js"
import type { McpTool } from "../lib/types.js"
import type { AnthropicToolDef } from "./types.js"

/**
 * tool-registry.ts의 V3_EXPOSED와 동일하게 유지.
 * (upstream 동기화 필요 시 이 set을 수동으로 갱신)
 */
const EXPOSED = new Set([
  "chain_full_research", "chain_law_system", "chain_action_basis",
  "chain_dispute_prep", "chain_amendment_track", "chain_ordinance_compare",
  "chain_procedure_detail", "chain_document_review",
  "search_law", "get_law_text",
  "get_annexes",
  "search_decisions", "get_decision_text",
  "discover_tools", "execute_tool",
  "verify_citations",
  "impact_map",
])

/**
 * Zod 스키마를 Anthropic tool input_schema로 변환.
 * tool-registry.ts의 toMcpInputSchema와 동일 로직 (apiKey 필드 제거).
 */
function zodToAnthropicSchema(schema: z.ZodSchema): AnthropicToolDef["input_schema"] {
  const raw = z.toJSONSchema(schema as z.ZodType) as {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
    additionalProperties?: unknown
  }

  if (raw?.type === "object" && raw?.properties) {
    const props = { ...raw.properties }
    delete (props as Record<string, unknown>).apiKey
    const required = Array.isArray(raw.required)
      ? raw.required.filter((k) => k !== "apiKey")
      : []
    return {
      type: "object",
      properties: props,
      required,
      additionalProperties: typeof raw.additionalProperties === "boolean" ? raw.additionalProperties : false,
    }
  }

  return {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false,
  }
}

/** LLM에 노출할 도구 목록 (V3_EXPOSED만) */
export function buildExposedTools(): AnthropicToolDef[] {
  const exposed = allTools.filter((t) => EXPOSED.has(t.name))
  const tools: AnthropicToolDef[] = exposed.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToAnthropicSchema(t.schema),
  }))
  // 마지막 도구에 cache_control 적용 → tools 블록 전체 캐싱
  if (tools.length > 0) {
    tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } }
  }
  return tools
}

/** 도구 이름 → McpTool 매핑 (전체 91개, execute_tool 경유 시 사용) */
export function buildToolMap(): Map<string, McpTool> {
  const m = new Map<string, McpTool>()
  for (const t of allTools) m.set(t.name, t)
  return m
}
