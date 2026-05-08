# 법령 리서치 챗 서비스 (Phase 1)

> 법조 실무자용 웹 챗봇. 법제처 1차 자료를 도구 호출로 검증하며 답변을 생성합니다.
> 본 모듈은 **upstream(`chrisryugj/korean-law-mcp`) 무수정 원칙**으로 추가되었습니다 — 기존 파일 수정 0건, 신규 파일만 추가.

## 위치

```
src/chat/                  # 챗 서비스 백엔드 (신규)
  server.ts                # Express 엔트리포인트
  agent-loop.ts            # Anthropic Messages API + tool_use 루프
  tool-bridge.ts           # 노출 도구 정의 → Anthropic tool 스키마
  tool-executor.ts         # 도구 핸들러 직접 호출
  system-prompt.ts         # 법조인용 시스템 프롬프트
  types.ts

public/chat/               # 정적 챗 UI (신규)
  index.html
  chat.js
  style.css
```

## 환경변수

`.env` 파일을 자동 로드합니다 (프로젝트 루트). 셸 export된 값이 있으면 우선합니다 (`.env`는 덮어쓰지 않음 — CI/Docker에서 안전).

| 변수 | 필수 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |
| `LAW_OC` | ✅ | 법제처 OC 코드 (`KOREAN_LAW_API_KEY`도 호환) |
| `CHAT_PORT` | | 기본 8080 |
| `CHAT_MODEL` | | 기본 `claude-sonnet-4-6`. 정확성 우선 시 `claude-opus-4-7` |
| `CHAT_BODY_LIMIT` | | 기본 200kb |
| `CHAT_ENV_FILE` | | `.env` 경로 오버라이드 (`--env-file` 인자와 동등) |

## 실행

```bash
# 1) 템플릿 복사 후 값 채우기
cp .env.chat.example .env
# (편집기로 .env 열어서 ANTHROPIC_API_KEY, LAW_OC 입력)

# 2) 빌드 후 실행
npm run build
node build/chat/server.js
# → http://localhost:8080

# 포트 변경
node build/chat/server.js --port 9000

# 다른 .env 파일 사용
node build/chat/server.js --env-file ./config/.env.production
```

`.env`는 `.gitignore`에 등록되어 있어 커밋되지 않습니다. 기존 MCP 서버(`build/index.js`)와 **동시 실행 가능** — 다른 포트 사용.

## API

### POST /api/chat

```json
{
  "question": "음주운전 처벌 기준은?",
  "history": [
    { "role": "user", "text": "..." },
    { "role": "assistant", "text": "..." }
  ]
}
```

**응답**:

```json
{
  "answer": "## 결론\n...\n## 근거\n...",
  "toolTrace": [
    { "name": "search_law", "input": {...}, "output": "...", "isError": false, "durationMs": 850 }
  ],
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 12000
  }
}
```

### GET /health

서비스 상태 확인.

## LLM 노출 도구 (V3_EXPOSED 기준 17개)

`chain_full_research`, `chain_law_system`, `chain_action_basis`, `chain_dispute_prep`,
`chain_amendment_track`, `chain_ordinance_compare`, `chain_procedure_detail`,
`chain_document_review`, `search_law`, `get_law_text`, `get_annexes`,
`search_decisions`, `get_decision_text`, `discover_tools`, `execute_tool`,
`verify_citations`, `impact_map`

LLM이 메타도구(`discover_tools`/`execute_tool`)를 통해 나머지 76개 전문 도구도 호출 가능.

## 시스템 프롬프트 핵심 규칙 (`src/chat/system-prompt.ts`)

1. 도구로 1차 자료 확인 후에만 인용 (환각 금지)
2. 답변 구조: `## 결론` → `## 근거` (조문/판례 인용블록) → `## 해설`
3. 법령은 「법령명」 제○조 제○항 제○호, 판례는 법원명·선고일·사건번호
4. 모르면 "확인되지 않습니다"로 명시
5. 답변 말미 면책 조항 고정

## upstream 동기화 시 주의

`tool-registry.ts`의 `V3_EXPOSED` 목록이 변경되면 `src/chat/tool-bridge.ts`의 `EXPOSED` set을 수동 동기화하십시오 (export되어 있지 않아 복제 사용 — git 충돌은 발생하지 않음).

## 한계 / Phase 2+ 예정

- **스트리밍 미적용**: 단일 응답. SSE 스트리밍은 Phase 2.
- **세션 영속화 없음**: history는 클라이언트(브라우저 메모리)에만 보관. Phase 3.
- **비용 가시화 없음**: usage는 응답에 포함되지만 UI 미표시.
- **인증 없음**: 내부망 또는 리버스 프록시 보호 전제.
