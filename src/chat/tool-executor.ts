/**
 * Anthropic tool_use → 실제 도구 함수 호출 브리지
 *
 * MCP 서버를 거치지 않고 도구 핸들러를 직접 호출.
 * (자기참조 MCP 클라이언트 회피 → 단순/저지연)
 */

import { allTools } from "../tool-registry.js"
import { setAllToolsRef } from "../tools/meta-tools.js"
import { LawApiClient } from "../lib/api-client.js"
import { formatToolError } from "../lib/errors.js"
import type { McpTool } from "../lib/types.js"
import type { ToolTraceEntry } from "./types.js"

const toolMap: Map<string, McpTool> = new Map()
let initialized = false

/**
 * 챗 서버 시작 시 한 번 호출. meta-tools(discover_tools/execute_tool)가
 * 전체 91개 도구를 참조할 수 있도록 주입.
 */
export function initToolExecutor() {
  if (initialized) return
  for (const t of allTools) toolMap.set(t.name, t)
  setAllToolsRef(allTools)
  initialized = true
}

export interface ToolCallResult {
  /** Anthropic tool_result content로 보낼 텍스트 (truncate된 본문) */
  content: string
  isError: boolean
  trace: ToolTraceEntry
}

/**
 * 도구 호출 + 트레이스 기록.
 * 입력 검증은 Zod로, 실패 시 에러 응답을 LLM에 그대로 전달 (LLM이 재시도 가능).
 */
export async function callTool(
  apiClient: LawApiClient,
  name: string,
  input: Record<string, unknown>
): Promise<ToolCallResult> {
  const startedAt = Date.now()
  const tool = toolMap.get(name)

  if (!tool) {
    const msg = `Unknown tool: ${name}`
    return {
      content: msg,
      isError: true,
      trace: { name, input, output: msg, isError: true, durationMs: 0 },
    }
  }

  try {
    const parsed = tool.schema.parse(input)
    const result = await tool.handler(apiClient, parsed)
    const text = result.content.map((c) => c.text).join("\n\n")
    return {
      content: text,
      isError: !!result.isError,
      trace: {
        name,
        input,
        output: text,
        isError: !!result.isError,
        durationMs: Date.now() - startedAt,
      },
    }
  } catch (error) {
    const errResult = formatToolError(error, name)
    const text = errResult.content.map((c) => c.text).join("\n\n")
    return {
      content: text,
      isError: true,
      trace: {
        name,
        input,
        output: text,
        isError: true,
        durationMs: Date.now() - startedAt,
      },
    }
  }
}
