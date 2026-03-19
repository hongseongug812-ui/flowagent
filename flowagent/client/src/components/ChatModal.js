import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function getToken() { return localStorage.getItem("fa_token"); }

const MODELS = [
  { value: "gpt-4o",                label: "GPT-4o",          provider: "openai",    color: "#10B981" },
  { value: "gpt-4o-mini",           label: "GPT-4o mini",     provider: "openai",    color: "#10B981" },
  { value: "claude-opus-4-6",       label: "Claude Opus 4.6", provider: "anthropic", color: "#C084FC" },
  { value: "claude-sonnet-4-6",     label: "Claude Sonnet",   provider: "anthropic", color: "#C084FC" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku", provider: "anthropic", color: "#C084FC" },
];

const SUGGESTIONS = [
  "매주 월요일 오전 10시 운동 알람 디스코드로 보내줘",
  "매일 아침 9시 뉴스 요약을 슬랙으로 보내는 워크플로우 만들어줘",
  "고객 문의 웹훅 받아서 자동 분류하고 이메일 답장 보내줘",
  "트리거 종류에는 뭐가 있어?",
];

// 응답에서 ```workflow {...} ``` 블록 파싱
function parseWorkflowBlock(text) {
  const match = text.match(/```workflow\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const wf = JSON.parse(match[1].trim());
    if (!wf.nodes || !wf.edges || !wf.name) return null;
    // 노드에 기본 좌표 보정
    wf.nodes = wf.nodes.map((n, i) => ({
      ...n,
      x: n.x || 80 + i * 320,
      y: n.y || 200,
    }));
    return wf;
  } catch { return null; }
}

const WORKFLOW_SYSTEM = `당신은 FlowAgent의 AI 개인 비서입니다. 워크플로우 자동화 전문가입니다.

워크플로우를 만들어달라는 요청이 있으면, 간단한 설명 후 반드시 아래 형식의 JSON 블록을 포함하세요:
\`\`\`workflow
{"name":"워크플로우 이름","nodes":[{"id":"n1","type":"타입","x":80,"y":200,"config":{...}}],"edges":[["n1","n2"]]}
\`\`\`

## 사용 가능한 노드 타입

- **trigger**: 트리거
  - triggerType: "webhook" | "schedule" | "manual"
  - schedule일 경우 반드시 cron 필드 포함 (예: "0 10 * * 1" = 매주 월요일 10시)

- **ai_agent**: AI 처리 (config: name, model, prompt)
  - model: "gpt-4o" | "gpt-4o-mini" | "claude-sonnet-4-6"

- **api_call**: API 호출 (config: name, url, method)
- **condition**: 조건 분기 (config: name)
- **transform**: 데이터 변환 (config: name)
- **slack**: Slack 메시지 (config: name, message)
- **discord**: Discord 메시지 (config: name, message)
- **telegram**: Telegram 메시지 (config: name, message)
- **rss_feed**: RSS 피드 수집 (config: name, url, limit)
- **notion**: Notion 저장 (config: name, title, content)
- **email**: 이메일 발송 (config: name, to, subject, body)
- **output**: 출력 (config: name)

## 중요한 규칙

### 메시지 작성 규칙
- **단순 알림(스케줄+알림)**: 메시지를 고정 텍스트로 직접 작성. 예: \`"message": "💪 운동할 시간입니다! 오늘도 파이팅!"\`
- **이전 노드 결과 사용 시**: \`{{input.result}}\` 변수 사용. 단, 반드시 앞에 ai_agent나 api_call 노드가 연결되어 있어야 함
- **절대 금지**: 앞에 ai_agent 없이 discord/slack/telegram 노드에서 \`{{input.result}}\` 사용 금지

### Cron 표현식 예시
- 매주 월요일 오전 10시: \`"0 10 * * 1"\`
- 매일 오전 9시: \`"0 9 * * *"\`
- 매일 오전 8시: \`"0 8 * * *"\`
- 매주 월~금 오전 9시: \`"0 9 * * 1-5"\`
- 5분마다: \`"*/5 * * * *"\`

### 레이아웃
- 노드 x좌표: 80부터 시작, 320씩 증가
- 노드 y좌표: 기본 200, 병렬 분기 시 위 120 / 아래 320

## 예시 패턴

### 단순 스케줄 알림 (트리거 → 알림 직접)
"매주 월요일 10시 운동 알람을 디스코드로" →
\`\`\`workflow
{"name":"월요일 운동 알람","nodes":[{"id":"n1","type":"trigger","x":80,"y":200,"config":{"name":"매주 월요일 10시","triggerType":"schedule","cron":"0 10 * * 1"}},{"id":"n2","type":"discord","x":400,"y":200,"config":{"name":"디스코드 알림","message":"💪 운동할 시간이에요! 오늘도 파이팅! 🏋️"}}],"edges":[["n1","n2"]]}
\`\`\`

### RSS → AI 요약 → Slack
"매일 아침 뉴스 요약을 슬랙으로" →
\`\`\`workflow
{"name":"뉴스 요약 슬랙","nodes":[{"id":"n1","type":"trigger","x":80,"y":200,"config":{"name":"매일 9시","triggerType":"schedule","cron":"0 9 * * *"}},{"id":"n2","type":"rss_feed","x":400,"y":200,"config":{"name":"뉴스 수집","url":"https://feeds.bbci.co.uk/korean/rss.xml","limit":5}},{"id":"n3","type":"ai_agent","x":720,"y":200,"config":{"name":"AI 요약","model":"gpt-4o-mini","prompt":"뉴스를 3줄로 요약해주세요:\\n\\n{{input.items}}"}},{"id":"n4","type":"slack","x":1040,"y":200,"config":{"name":"슬랙 전송","message":"📰 오늘의 뉴스\\n\\n{{input.result}}"}}],"edges":[["n1","n2"],["n2","n3"],["n3","n4"]]}
\`\`\`

친절하게 한국어로 답변하세요. 워크플로우 생성 후 "캔버스에 추가" 버튼을 누르면 바로 적용된다고 안내해주세요.`;

export default function ChatModal({ onClose, onCreateWorkflow }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0].value);
  const [streaming, setStreaming] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  const send = useCallback(async (text) => {
    const userText = (text || input).trim();
    if (!userText || streaming) return;
    setInput("");

    const userMsg = { role: "user", content: userText };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", streaming: true }]);
    setStreaming(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          messages: history,
          model,
          systemPrompt: systemPrompt || WORKFLOW_SYSTEM,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: `[오류] ${err.error}`, streaming: false };
          return next;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const snapshot = accumulated;
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: snapshot, streaming: true };
          return next;
        });
      }

      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: accumulated, streaming: false };
        return next;
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: `[연결 오류] ${e.message}`, streaming: false };
          return next;
        });
      }
    }
    setStreaming(false);
  }, [input, messages, model, streaming, systemPrompt]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setMessages(prev => {
      const next = [...prev];
      if (next[next.length - 1]?.streaming) {
        next[next.length - 1] = { ...next[next.length - 1], streaming: false };
      }
      return next;
    });
    setStreaming(false);
  };

  const handleClear = () => { setMessages([]); };

  const currentModel = MODELS.find(m => m.value === model) || MODELS[0];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "#111128", border: "1px solid #222244",
        borderRadius: 18, width: "100%", maxWidth: 680,
        height: "88vh", display: "flex", flexDirection: "column",
        overflow: "hidden",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", borderBottom: "1px solid #1A1A3A", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>AI 개인 비서</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Model selector */}
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              style={{
                background: "#0D0D22", border: "1px solid #2A2A4A",
                borderRadius: 8, color: currentModel.color,
                fontSize: 11, fontFamily: "inherit", padding: "4px 8px",
                outline: "none", cursor: "pointer",
              }}
            >
              {MODELS.map(m => (
                <option key={m.value} value={m.value} style={{ color: m.color }}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowSystem(s => !s)}
              title="시스템 프롬프트 설정"
              style={{
                background: showSystem ? "#1A1A3A" : "none", border: "1px solid #2A2A4A",
                borderRadius: 6, color: "#666", cursor: "pointer",
                fontSize: 13, padding: "4px 8px",
              }}
            >⚙</button>
            <button
              onClick={handleClear}
              title="대화 초기화"
              style={{
                background: "none", border: "1px solid #2A2A4A",
                borderRadius: 6, color: "#666", cursor: "pointer",
                fontSize: 12, padding: "4px 8px", fontFamily: "inherit",
              }}
            >새 대화</button>
            <button onClick={onClose} style={{
              background: "none", border: "none",
              color: "#555", cursor: "pointer", fontSize: 18,
            }}>✕</button>
          </div>
        </div>

        {/* System prompt panel */}
        {showSystem && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #1A1A3A", flexShrink: 0, background: "#0D0D1A" }}>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>시스템 프롬프트 (AI 성격/역할 설정)</div>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              placeholder="기본: FlowAgent 전문 AI 비서. 여기에 다른 역할을 입력하세요."
              rows={2}
              style={{
                width: "100%", background: "#1A1A2E", border: "1px solid #333",
                borderRadius: 8, color: "#C4C4E0", fontSize: 12,
                fontFamily: "inherit", padding: "8px 10px",
                outline: "none", resize: "none", boxSizing: "border-box",
              }}
            />
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {messages.length === 0 ? (
            <div style={{ paddingTop: 32 }}>
              <div style={{ textAlign: "center", marginBottom: 32 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>무엇이든 물어보세요</div>
                <div style={{ fontSize: 12, color: "#555" }}>
                  워크플로우 자동화, AI 활용, 기술 질문 등<br />
                  <span style={{ color: currentModel.color }}>{currentModel.label}</span>이 답변합니다
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    style={{
                      padding: "12px 14px", background: "#0D0D22",
                      border: "1px solid #1A1A3A", borderRadius: 10,
                      color: "#888", fontSize: 12, cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#8B5CF6"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#1A1A3A"}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} onCreateWorkflow={onCreateWorkflow} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: "12px 16px", borderTop: "1px solid #1A1A3A", flexShrink: 0,
        }}>
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-end",
            background: "#0D0D22", border: "1px solid #2A2A4A",
            borderRadius: 12, padding: "8px 10px",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요... (Shift+Enter: 줄바꿈)"
              rows={1}
              style={{
                flex: 1, background: "none", border: "none",
                color: "#E0E0F0", fontSize: 13, fontFamily: "inherit",
                outline: "none", resize: "none", lineHeight: 1.5,
                maxHeight: 120, overflowY: "auto",
              }}
              onInput={e => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
              disabled={streaming}
            />
            {streaming ? (
              <button
                onClick={handleStop}
                style={{
                  padding: "6px 12px", background: "#3A1A1A",
                  border: "1px solid #F87171", borderRadius: 8,
                  color: "#F87171", fontSize: 12, cursor: "pointer",
                  fontFamily: "inherit", flexShrink: 0,
                }}
              >⏹ 중지</button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                style={{
                  padding: "6px 14px",
                  background: input.trim()
                    ? "linear-gradient(135deg, #8B5CF6, #6D28D9)"
                    : "#1A1A2E",
                  border: "none", borderRadius: 8,
                  color: input.trim() ? "#fff" : "#333",
                  fontSize: 13, cursor: input.trim() ? "pointer" : "default",
                  fontFamily: "inherit", fontWeight: 700, flexShrink: 0,
                  transition: "background 0.15s",
                }}
              >↑ 전송</button>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#333", textAlign: "center", marginTop: 6 }}>
            {currentModel.provider === "anthropic" ? "Claude" : "OpenAI"} · API 키는 ⚙ 설정에서 입력 · Enter로 전송
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, onCreateWorkflow }) {
  const isUser = msg.role === "user";
  const workflow = (!isUser && !msg.streaming) ? parseWorkflowBlock(msg.content || "") : null;

  // Replace ```workflow...``` block with a cleaner visual
  const displayContent = (msg.content || "").replace(/```workflow[\s\S]*?```/g, "");

  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 12,
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, flexShrink: 0, marginRight: 8, marginTop: 2,
        }}>🤖</div>
      )}
      <div style={{ maxWidth: "78%" }}>
        <div style={{
          padding: "10px 14px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? "linear-gradient(135deg, #8B5CF6, #6D28D9)" : "#0D0D22",
          border: isUser ? "none" : "1px solid #1A1A3A",
          color: isUser ? "#fff" : "#D0D0E8",
          fontSize: 13, lineHeight: 1.65,
          wordBreak: "break-word",
        }}>
          {isUser ? (
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
          ) : displayContent ? (
            <>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p style={{ margin: "0 0 8px 0" }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ margin: "4px 0 8px 16px", padding: 0 }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ margin: "4px 0 8px 16px", padding: 0 }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
                  h1: ({ children }) => <div style={{ fontSize: 15, fontWeight: 800, margin: "8px 0 4px" }}>{children}</div>,
                  h2: ({ children }) => <div style={{ fontSize: 14, fontWeight: 700, margin: "6px 0 4px", color: "#C4B5FD" }}>{children}</div>,
                  h3: ({ children }) => <div style={{ fontSize: 13, fontWeight: 700, margin: "4px 0 2px", color: "#A78BFA" }}>{children}</div>,
                  code: ({ inline, children }) => inline
                    ? <code style={{ background: "#1A1A3A", padding: "1px 6px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", color: "#C4B5FD" }}>{children}</code>
                    : <pre style={{ background: "#060612", padding: "10px 12px", borderRadius: 8, overflow: "auto", fontSize: 11, margin: "6px 0", border: "1px solid #1A1A3A" }}><code style={{ fontFamily: "monospace", color: "#A0A0C0" }}>{children}</code></pre>,
                  strong: ({ children }) => <strong style={{ color: "#E0E0F8", fontWeight: 700 }}>{children}</strong>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#8B5CF6", textDecoration: "underline" }}>{children}</a>,
                  blockquote: ({ children }) => <blockquote style={{ borderLeft: "3px solid #8B5CF6", paddingLeft: 10, margin: "6px 0", color: "#888" }}>{children}</blockquote>,
                  hr: () => <hr style={{ border: "none", borderTop: "1px solid #1A1A3A", margin: "8px 0" }} />,
                }}
              >
                {displayContent}
              </ReactMarkdown>
              {msg.streaming && <BlinkCursor />}
            </>
          ) : (
            msg.streaming ? <BlinkCursor /> : ""
          )}
        </div>
        {workflow && onCreateWorkflow && (
          <div style={{
            marginTop: 8, padding: "12px 14px",
            background: "linear-gradient(135deg, #1a0a3a, #0d1225)",
            border: "1px solid #8B5CF6",
            borderRadius: "0 12px 12px 12px",
          }}>
            <div style={{ fontSize: 11, color: "#C4B5FD", marginBottom: 8, fontWeight: 700 }}>
              ✨ 워크플로우 생성 준비됨: <span style={{ color: "#fff" }}>{workflow.name}</span>
            </div>
            <div style={{ fontSize: 10, color: "#666", marginBottom: 10 }}>
              {workflow.nodes.length}개 노드 · {workflow.edges.length}개 연결
              ({workflow.nodes.map(n => n.type).join(", ")})
            </div>
            <button onClick={() => onCreateWorkflow(workflow)} style={{
              width: "100%", padding: "9px",
              background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
              border: "none", borderRadius: 8,
              color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              🚀 캔버스에 워크플로우 생성
            </button>
          </div>
        )}
      </div>
      {isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "#1A1A3A",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, flexShrink: 0, marginLeft: 8, marginTop: 2,
        }}>👤</div>
      )}
    </div>
  );
}

function BlinkCursor() {
  return (
    <span style={{
      display: "inline-block", width: 2, height: 14,
      background: "#8B5CF6", marginLeft: 2, verticalAlign: "middle",
      animation: "blink 1s step-end infinite",
    }} />
  );
}
