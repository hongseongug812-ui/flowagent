import React, { useState } from "react";
import { NODE_TYPES } from "../utils/constants";
import { toast } from "../utils/toast";

const S = {
  input: {
    width: "100%", padding: "8px 10px", background: "#0D0D1A",
    border: "1px solid #222244", borderRadius: 6, color: "#E0E0F0",
    fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
    marginBottom: 12, transition: "border-color 0.2s",
  },
  label: { fontSize: 10, color: "#888", display: "block", marginBottom: 4, fontWeight: 600, letterSpacing: 0.5 },
  section: { marginBottom: 4 },
  hint: { fontSize: 10, color: "#444", marginTop: -8, marginBottom: 12, lineHeight: 1.5 },
  divider: { borderTop: "1px solid #1A1A3A", margin: "14px 0" },
};

function Field({ label, hint, children }) {
  return (
    <div style={S.section}>
      {label && <label style={S.label}>{label}</label>}
      {children}
      {hint && <div style={S.hint}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ ...S.input, ...style }}
      onFocus={e => e.target.style.borderColor = "#8B5CF6"}
      onBlur={e => e.target.style.borderColor = "#222244"}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      style={{ ...S.input, resize: "vertical", lineHeight: 1.5, fontSize: 11 }}
      onFocus={e => e.target.style.borderColor = "#8B5CF6"}
      onBlur={e => e.target.style.borderColor = "#222244"}
    />
  );
}

function Select({ value, onChange, children }) {
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value)} style={S.input}>
      {children}
    </select>
  );
}

function TestBtn({ onClick, testing, result }) {
  return (
    <div style={{ marginTop: 4, marginBottom: 12 }}>
      <button onClick={onClick} disabled={testing} style={{
        width: "100%", padding: "8px 0",
        background: testing ? "#111" : "#0D1A2E",
        border: "1px solid #3B82F655",
        borderRadius: 6, color: testing ? "#555" : "#60A5FA",
        fontSize: 11, cursor: testing ? "not-allowed" : "pointer", fontFamily: "inherit",
      }}>
        {testing ? "⏳ 테스트 중..." : "▷ 노드 테스트"}
      </button>
      {result && (
        <div style={{
          marginTop: 6, padding: "8px 10px",
          background: result.ok ? "#0D1F0D" : "#1F0D0D",
          border: `1px solid ${result.ok ? "#4ADE8033" : "#EF444433"}`,
          borderRadius: 6, fontSize: 10,
          color: result.ok ? "#4ADE80" : "#F87171",
          maxHeight: 120, overflow: "auto",
          whiteSpace: "pre-wrap", wordBreak: "break-all",
          fontFamily: "monospace",
        }}>
          {result.ok
            ? `✓ 성공 (${result.duration}ms)\n${JSON.stringify(result.output, null, 2).slice(0, 500)}`
            : `✗ 실패\n${result.error}`}
        </div>
      )}
    </div>
  );
}

export default function ConfigPanel({ node, onUpdate, onClose, workflowId }) {
  if (!node) return null;
  const t = NODE_TYPES[node.type];
  const [webhookUrl, setWebhookUrl] = useState(null);
  const [generatingWebhook, setGeneratingWebhook] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testInput, setTestInput] = useState('{}');
  const [showTestInput, setShowTestInput] = useState(false);

  const set = (key, val) => onUpdate(node.id, key, val);

  // 조건 빌더용
  const conditions = node.config?.conditions || [{ field: "$.result", operator: "exists", value: "" }];
  const setCondition = (idx, key, val) => {
    const updated = conditions.map((c, i) => i === idx ? { ...c, [key]: val } : c);
    set("conditions", updated);
  };
  const addCondition = () => set("conditions", [...conditions, { field: "$.result", operator: "exists", value: "" }]);
  const removeCondition = (idx) => set("conditions", conditions.filter((_, i) => i !== idx));

  const generateWebhook = async () => {
    if (!workflowId) { toast.warn("먼저 워크플로우를 저장하세요"); return; }
    setGeneratingWebhook(true);
    try {
      const token = localStorage.getItem("fa_token");
      const res = await fetch(`/api/workflows/${workflowId}/webhook`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const url = `${window.location.origin}${data.webhookUrl}`;
      setWebhookUrl(url);
      await navigator.clipboard.writeText(url);
      toast.success("웹훅 URL이 클립보드에 복사됐습니다!");
    } catch { toast.error("웹훅 URL 생성 실패"); }
    setGeneratingWebhook(false);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      let parsedInput = null;
      try { parsedInput = JSON.parse(testInput); } catch {}
      const token = localStorage.getItem("fa_token");
      const res = await fetch("/api/nodes/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ node, input: parsedInput }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    }
    setTesting(false);
  };

  const OPERATORS = [
    { value: "exists", label: "존재함" }, { value: "not_exists", label: "존재하지 않음" },
    { value: "equals", label: "같음 (=)" }, { value: "not_equals", label: "다름 (≠)" },
    { value: "contains", label: "포함함" }, { value: "not_contains", label: "포함하지 않음" },
    { value: "gt", label: "> 초과" }, { value: "gte", label: ">= 이상" },
    { value: "lt", label: "< 미만" }, { value: "lte", label: "<= 이하" },
    { value: "starts_with", label: "시작 문자" }, { value: "ends_with", label: "끝 문자" },
    { value: "regex", label: "정규식 일치" },
  ];

  return (
    <div style={{
      width: 300, background: "#0D0D1A", borderLeft: "1px solid #1A1A3A",
      display: "flex", flexDirection: "column", flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", borderBottom: "1px solid #1A1A3A", flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.color }}>
          {t.icon} {t.label} 설정
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {/* 공통: 노드 이름 */}
        <Field label="노드 이름">
          <Input value={node.config?.name} onChange={v => set("name", v)} placeholder="노드 이름" />
        </Field>

        {/* ── TRIGGER ── */}
        {node.type === "trigger" && (
          <>
            <Field label="트리거 타입">
              <Select value={node.config?.triggerType || "webhook"} onChange={v => set("triggerType", v)}>
                <option value="webhook">🔗 Webhook (HTTP POST)</option>
                <option value="schedule">⏰ 스케줄 (Cron)</option>
                <option value="manual">▶ 수동 실행</option>
              </Select>
            </Field>

            {node.config?.triggerType === "webhook" && (
              <div style={{ marginBottom: 12 }}>
                {webhookUrl ? (
                  <>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Webhook URL (POST 요청 시 트리거)</div>
                    <div style={{
                      padding: "8px 10px", background: "#0A1A0A", borderRadius: 6,
                      border: "1px solid #4ADE8055", fontSize: 10, color: "#4ADE80",
                      wordBreak: "break-all", marginBottom: 6, lineHeight: 1.5,
                    }}>{webhookUrl}</div>
                    <button onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("복사됐습니다!"); }} style={{
                      width: "100%", padding: "6px", background: "#0A1A0A",
                      border: "1px solid #4ADE8044", borderRadius: 6,
                      color: "#4ADE80", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                    }}>📋 다시 복사</button>
                  </>
                ) : (
                  <button onClick={generateWebhook} disabled={generatingWebhook} style={{
                    width: "100%", padding: "8px",
                    background: "#0D1225", border: "1px solid #3B82F655",
                    borderRadius: 6, color: "#60A5FA", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {generatingWebhook ? "생성 중..." : "🔗 Webhook URL 생성 & 복사"}
                  </button>
                )}
                <div style={{ fontSize: 10, color: "#444", marginTop: 6 }}>
                  외부 서비스에서 이 URL로 POST 요청을 보내면 워크플로우가 실행됩니다
                </div>
              </div>
            )}

            {node.config?.triggerType === "schedule" && (
              <>
                <Field label="⏰ 시간 프리셋">
                  <Select value="" onChange={v => { if (v) set("cron", v); }}>
                    <option value="">-- 프리셋 선택 --</option>
                    <optgroup label="매일">
                      {[["0 7 * * *","오전 7시"],["0 8 * * *","오전 8시"],["0 9 * * *","오전 9시"],["0 10 * * *","오전 10시"],["0 12 * * *","오후 12시"],["0 18 * * *","오후 6시"],["0 21 * * *","오후 9시"]].map(([v,l]) => <option key={v} value={v}>매일 {l}</option>)}
                    </optgroup>
                    <optgroup label="요일별">
                      {[["0 10 * * 1","월요일"],["0 10 * * 2","화요일"],["0 10 * * 3","수요일"],["0 10 * * 4","목요일"],["0 10 * * 5","금요일"],["0 9 * * 1-5","평일"],["0 10 * * 1,3,5","월·수·금"],["0 10 * * 2,4","화·목"]].map(([v,l]) => <option key={v} value={v}>매주 {l} 오전 10시</option>)}
                    </optgroup>
                    <optgroup label="주기">
                      {[["*/5 * * * *","5분마다"],["*/15 * * * *","15분마다"],["*/30 * * * *","30분마다"],["0 * * * *","매시간"],["0 */6 * * *","6시간마다"],["0 0 * * 0","매주 일요일 자정"],["0 0 1 * *","매월 1일"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </optgroup>
                  </Select>
                </Field>
                <Field label="Cron 직접 입력" hint="형식: 분 시 일 월 요일 (KST 기준)">
                  <Input value={node.config?.cron} onChange={v => set("cron", v)} placeholder="0 10 * * 1" />
                </Field>
                {node.config?.cron && (
                  <div style={{ fontSize: 10, padding: "6px 10px", background: "#0D1F0D", border: "1px solid #4ADE8033", borderRadius: 6, color: "#4ADE80", marginBottom: 12 }}>
                    ✓ 저장 시 스케줄 자동 활성화
                  </div>
                )}
              </>
            )}

            {node.config?.triggerType === "manual" && (
              <div style={{ fontSize: 11, color: "#555", padding: "8px 10px", background: "#111122", borderRadius: 6, marginBottom: 12 }}>
                ▶ 실행 버튼 또는 Ctrl+Enter로 수동 실행됩니다
              </div>
            )}
          </>
        )}

        {/* ── AI AGENT ── */}
        {node.type === "ai_agent" && (
          <>
            <Field label="모델">
              <Select value={node.config?.model || "gpt-4o-mini"} onChange={v => set("model", v)}>
                <optgroup label="OpenAI">
                  <option value="gpt-4o">GPT-4o (최고 성능)</option>
                  <option value="gpt-4o-mini">GPT-4o mini (빠름/저렴)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                </optgroup>
                <optgroup label="Anthropic Claude">
                  <option value="claude-opus-4-6">Claude Opus 4.6 (최고)</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (균형)</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku (빠름)</option>
                </optgroup>
              </Select>
            </Field>
            <Field label="시스템 프롬프트 (선택)" hint="AI의 역할과 행동 방식을 정의합니다">
              <Textarea
                value={node.config?.system_prompt}
                onChange={v => set("system_prompt", v)}
                placeholder="당신은 친절한 AI 어시스턴트입니다..."
                rows={3}
              />
            </Field>
            <Field label="프롬프트 *" hint="이전 노드 출력: {{input.result}}, {{input.body}} 등 사용 가능">
              <Textarea
                value={node.config?.prompt}
                onChange={v => set("prompt", v)}
                placeholder="입력 데이터를 분석하고 요약해주세요."
                rows={5}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <label style={S.label}>Temperature</label>
                <input type="number" min="0" max="2" step="0.1"
                  value={node.config?.temperature ?? 0.7}
                  onChange={e => set("temperature", parseFloat(e.target.value))}
                  style={{ ...S.input, marginBottom: 0 }} />
              </div>
              <div>
                <label style={S.label}>Max Tokens</label>
                <input type="number" min="100" max="8000" step="100"
                  value={node.config?.max_tokens ?? 1000}
                  onChange={e => set("max_tokens", parseInt(e.target.value))}
                  style={{ ...S.input, marginBottom: 0 }} />
              </div>
            </div>
            <div style={S.divider} />
            <div style={{ fontSize: 10, color: "#555", marginBottom: 8 }}>테스트 입력 (JSON)</div>
            <Textarea value={testInput} onChange={setTestInput} placeholder='{"result": "테스트 입력"}' rows={2} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── API CALL ── */}
        {node.type === "api_call" && (
          <>
            <Field label="Method + URL">
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <select value={node.config?.method || "GET"} onChange={e => set("method", e.target.value)}
                  style={{ ...S.input, width: 90, marginBottom: 0, flexShrink: 0 }}>
                  {["GET","POST","PUT","PATCH","DELETE"].map(m => <option key={m}>{m}</option>)}
                </select>
                <input value={node.config?.url || ""} onChange={e => set("url", e.target.value)}
                  placeholder="https://api.example.com/..." style={{ ...S.input, marginBottom: 0, flex: 1 }}
                  onFocus={e => e.target.style.borderColor = "#8B5CF6"}
                  onBlur={e => e.target.style.borderColor = "#222244"}
                />
              </div>
            </Field>
            <Field label="인증 방식">
              <Select value={node.config?.auth_type || "none"} onChange={v => set("auth_type", v)}>
                <option value="none">없음</option>
                <option value="bearer">Bearer Token</option>
                <option value="apikey">API Key Header</option>
                <option value="basic">Basic Auth (user:password)</option>
              </Select>
            </Field>
            {node.config?.auth_type === "apikey" && (
              <Field label="Header 이름">
                <Input value={node.config?.auth_key} onChange={v => set("auth_key", v)} placeholder="X-API-Key" />
              </Field>
            )}
            {(node.config?.auth_type === "bearer" || node.config?.auth_type === "apikey" || node.config?.auth_type === "basic") && (
              <Field label={node.config?.auth_type === "basic" ? "user:password" : "값"}>
                <Input type="password" value={node.config?.auth_value} onChange={v => set("auth_value", v)}
                  placeholder={node.config?.auth_type === "basic" ? "username:password" : "your-token"} />
              </Field>
            )}
            <Field label="Headers (JSON, 선택)" hint='예: {"Accept": "application/json"}'>
              <Textarea value={node.config?.headers} onChange={v => set("headers", v)} placeholder="{}" rows={2} />
            </Field>
            {["POST","PUT","PATCH"].includes(node.config?.method || "GET") && (
              <Field label="Request Body (JSON)" hint="{{input.xxx}} 변수 사용 가능">
                <Textarea value={node.config?.body} onChange={v => set("body", v)}
                  placeholder='{"key": "{{input.result}}"}' rows={3} />
              </Field>
            )}
            <Field label="응답 추출 (JSONPath, 선택)" hint='예: $.data[0].name — 특정 필드만 추출'>
              <Input value={node.config?.extract_path} onChange={v => set("extract_path", v)} placeholder="$.data" />
            </Field>
            <Field label="타임아웃 (초)">
              <input type="number" min="1" max="120" value={node.config?.timeout || 30}
                onChange={e => set("timeout", parseInt(e.target.value))} style={S.input} />
            </Field>
            <div style={S.divider} />
            <Textarea value={testInput} onChange={setTestInput} placeholder='{}' rows={2} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── CONDITION ── */}
        {node.type === "condition" && (
          <>
            <Field label="조건 논리">
              <Select value={node.config?.logic || "AND"} onChange={v => set("logic", v)}>
                <option value="AND">AND — 모든 조건 충족 시 통과</option>
                <option value="OR">OR — 하나라도 충족 시 통과</option>
              </Select>
            </Field>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 8 }}>조건 목록</div>
            {conditions.map((cond, idx) => (
              <div key={idx} style={{ background: "#111133", border: "1px solid #1A1A3A", borderRadius: 8, padding: "10px 10px 2px", marginBottom: 8 }}>
                <Field label="필드 (JSONPath)" hint='예: $.result, $.body.status, $.count'>
                  <Input value={cond.field} onChange={v => setCondition(idx, "field", v)} placeholder="$.result" />
                </Field>
                <Field label="조건">
                  <Select value={cond.operator || "exists"} onChange={v => setCondition(idx, "operator", v)}>
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                {!["exists","not_exists"].includes(cond.operator) && (
                  <Field label="비교값">
                    <Input value={cond.value} onChange={v => setCondition(idx, "value", v)} placeholder="비교할 값" />
                  </Field>
                )}
                {conditions.length > 1 && (
                  <button onClick={() => removeCondition(idx)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 10, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
                    ✕ 조건 삭제
                  </button>
                )}
              </div>
            ))}
            <button onClick={addCondition} style={{
              width: "100%", padding: "7px", background: "none", border: "1px dashed #333",
              borderRadius: 6, color: "#666", fontSize: 11, cursor: "pointer", fontFamily: "inherit", marginBottom: 12,
            }}>+ 조건 추가</button>
            <div style={S.divider} />
            <Textarea value={testInput} onChange={setTestInput} placeholder='{"result": "테스트"}' rows={2} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── TRANSFORM ── */}
        {node.type === "transform" && (
          <>
            <div style={{ fontSize: 11, color: "#555", padding: "8px 10px", background: "#111122", borderRadius: 6, marginBottom: 12, lineHeight: 1.6 }}>
              <div style={{ color: "#888", marginBottom: 4, fontWeight: 700 }}>사용 가능한 변수</div>
              <code style={{ color: "#8B5CF6" }}>input</code> — 이전 노드 출력<br />
              <code style={{ color: "#8B5CF6" }}>_.pick(obj, keys)</code> — 필드 선택<br />
              <code style={{ color: "#8B5CF6" }}>_.omit(obj, keys)</code> — 필드 제외<br />
              <code style={{ color: "#8B5CF6" }}>_.flatten(arr)</code> — 배열 평탄화<br />
              <code style={{ color: "#8B5CF6" }}>_.format(date)</code> — 날짜 포맷
            </div>
            <Field label="변환 코드 (JavaScript)" hint="return으로 결과를 반환하세요">
              <Textarea
                value={node.config?.code || "// input: 이전 노드 출력\n// _: 유틸 함수\nreturn input;"}
                onChange={v => set("code", v)}
                rows={8}
              />
            </Field>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[
                ["필드 선택", "return _.pick(input, ['result', 'status']);"],
                ["배열 변환", "return (input.items || []).map(i => i.title);"],
                ["텍스트 추출", "return { text: input.result, len: (input.result||'').length };"],
              ].map(([label, code]) => (
                <button key={label} onClick={() => set("code", code)} style={{
                  flex: 1, padding: "4px 0", fontSize: 9, background: "#111133",
                  border: "1px solid #222244", borderRadius: 4, color: "#666",
                  cursor: "pointer", fontFamily: "inherit",
                }}>{label}</button>
              ))}
            </div>
            <div style={S.divider} />
            <Textarea value={testInput} onChange={setTestInput} placeholder='{"result": "테스트"}' rows={2} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── SLACK ── */}
        {node.type === "slack" && (
          <>
            <Field label="Webhook URL" hint="비워두면 ⚙ 설정의 Slack Webhook URL 사용">
              <Input value={node.config?.webhook_url} onChange={v => set("webhook_url", v)} placeholder="https://hooks.slack.com/services/..." />
            </Field>
            <Field label="메시지" hint="{{input.result}} 등 변수 사용 가능">
              <Textarea value={node.config?.message} onChange={v => set("message", v)}
                placeholder="{{input.result}}" rows={4} />
            </Field>
            <Field label="채널 (선택)">
              <Input value={node.config?.channel} onChange={v => set("channel", v)} placeholder="#general" />
            </Field>
            <div style={S.divider} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── DISCORD ── */}
        {node.type === "discord" && (
          <>
            <Field label="Webhook URL" hint="비워두면 ⚙ 설정의 Discord Webhook URL 사용">
              <Input value={node.config?.webhook_url} onChange={v => set("webhook_url", v)} placeholder="https://discord.com/api/webhooks/..." />
            </Field>
            <Field label="Bot 이름 (선택)">
              <Input value={node.config?.username} onChange={v => set("username", v)} placeholder="FlowAgent" />
            </Field>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input type="checkbox" id="use_embed" checked={!!node.config?.use_embed}
                onChange={e => set("use_embed", e.target.checked)} />
              <label htmlFor="use_embed" style={{ fontSize: 11, color: "#888", cursor: "pointer" }}>Embed 사용 (리치 카드 형식)</label>
            </div>
            {node.config?.use_embed ? (
              <>
                <Field label="Embed 제목">
                  <Input value={node.config?.embed_title} onChange={v => set("embed_title", v)} placeholder="알림 제목" />
                </Field>
                <Field label="Embed 내용" hint="{{input.result}} 변수 사용 가능">
                  <Textarea value={node.config?.embed_description} onChange={v => set("embed_description", v)} placeholder="{{input.result}}" rows={3} />
                </Field>
                <Field label="색상 (hex)">
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <input type="color" value={node.config?.embed_color || "#8B5CF6"} onChange={e => set("embed_color", e.target.value)}
                      style={{ width: 40, height: 34, border: "1px solid #333", borderRadius: 4, cursor: "pointer", background: "none" }} />
                    <Input value={node.config?.embed_color} onChange={v => set("embed_color", v)} placeholder="#8B5CF6" style={{ marginBottom: 0 }} />
                  </div>
                </Field>
              </>
            ) : (
              <Field label="메시지" hint="{{input.result}} 변수 사용 가능">
                <Textarea value={node.config?.message} onChange={v => set("message", v)} placeholder="{{input.result}}" rows={4} />
              </Field>
            )}
            <div style={S.divider} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── TELEGRAM ── */}
        {node.type === "telegram" && (
          <>
            <Field label="Bot Token" hint="비워두면 ⚙ 설정의 Telegram Bot Token 사용">
              <Input type="password" value={node.config?.bot_token} onChange={v => set("bot_token", v)} placeholder="123456789:ABC-..." />
            </Field>
            <Field label="Chat ID *" hint="개인: 숫자 ID / 채널: @채널명 / 그룹: -숫자">
              <Input value={node.config?.chat_id} onChange={v => set("chat_id", v)} placeholder="-100123456789" />
            </Field>
            <Field label="메시지" hint="Markdown 지원. {{input.result}} 변수 사용 가능">
              <Textarea value={node.config?.message} onChange={v => set("message", v)} placeholder="*제목*\n\n{{input.result}}" rows={4} />
            </Field>
            <Field label="Parse Mode">
              <Select value={node.config?.parse_mode || "Markdown"} onChange={v => set("parse_mode", v)}>
                <option value="Markdown">Markdown</option>
                <option value="HTML">HTML</option>
                <option value="">없음</option>
              </Select>
            </Field>
            <div style={S.divider} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── RSS FEED ── */}
        {node.type === "rss_feed" && (
          <>
            <Field label="RSS / Atom URL *">
              <Input value={node.config?.url} onChange={v => set("url", v)} placeholder="https://feeds.bbci.co.uk/korean/rss.xml" />
            </Field>
            <Field label="가져올 최대 항목 수">
              <input type="number" min="1" max="50" value={node.config?.limit || 5}
                onChange={e => set("limit", parseInt(e.target.value))} style={S.input} />
            </Field>
            <div style={{ fontSize: 10, color: "#444", padding: "8px 10px", background: "#111122", borderRadius: 6, marginBottom: 12, lineHeight: 1.6 }}>
              <div style={{ color: "#666", marginBottom: 4 }}>출력 변수</div>
              <code style={{ color: "#F97316" }}>{"{{input.items}}"}</code> — 전체 배열<br />
              <code style={{ color: "#F97316" }}>{"{{input.items[0].title}}"}</code> — 첫 항목 제목<br />
              <code style={{ color: "#F97316" }}>{"{{input.count}}"}</code> — 항목 수
            </div>
            <div style={S.divider} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── NOTION ── */}
        {node.type === "notion" && (
          <>
            <Field label="Database ID *" hint="Notion DB URL에서 32자리 ID 복사">
              <Input value={node.config?.database_id} onChange={v => set("database_id", v)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </Field>
            <Field label="페이지 제목" hint="{{input.result}} 변수 사용 가능">
              <Input value={node.config?.title} onChange={v => set("title", v)} placeholder="{{input.result}}" />
            </Field>
            <Field label="내용 (선택)" hint="{{input.result}} 변수 사용 가능">
              <Textarea value={node.config?.content} onChange={v => set("content", v)} placeholder="{{input.result}}" rows={3} />
            </Field>
            <div style={{ fontSize: 10, color: "#555", padding: "6px 10px", background: "#111122", borderRadius: 6, marginBottom: 12 }}>
              🔑 API 키는 ⚙ 설정 → Notion API Key에서 입력
            </div>
            <div style={S.divider} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── EMAIL ── */}
        {node.type === "email" && (
          <>
            <Field label="받는 사람 *">
              <Input value={node.config?.to} onChange={v => set("to", v)} placeholder="user@example.com" />
            </Field>
            <Field label="제목">
              <Input value={node.config?.subject} onChange={v => set("subject", v)} placeholder="FlowAgent 알림" />
            </Field>
            <Field label="내용 형식">
              <Select value={node.config?.content_type || "text"} onChange={v => set("content_type", v)}>
                <option value="text">일반 텍스트</option>
                <option value="html">HTML</option>
              </Select>
            </Field>
            <Field label="내용" hint="{{input.result}} 변수 사용 가능">
              <Textarea value={node.config?.body} onChange={v => set("body", v)}
                placeholder={node.config?.content_type === "html" ? "<h1>제목</h1>\n<p>{{input.result}}</p>" : "{{input.result}}"}
                rows={5} />
            </Field>
            <Field label="보내는 사람 (선택)">
              <Input value={node.config?.from} onChange={v => set("from", v)} placeholder="noreply@yourdomain.com" />
            </Field>
            <div style={{ fontSize: 10, color: "#555", padding: "6px 10px", background: "#111122", borderRadius: 6, marginBottom: 12 }}>
              🔑 API 키는 ⚙ 설정 → SendGrid API Key에서 입력
            </div>
            <div style={S.divider} />
            <TestBtn onClick={runTest} testing={testing} result={testResult} />
          </>
        )}

        {/* ── OUTPUT ── */}
        {node.type === "output" && (
          <>
            <Field label="출력 형식">
              <Select value={node.config?.format || "json"} onChange={v => set("format", v)}>
                <option value="json">JSON (전체 데이터)</option>
                <option value="text">텍스트 (문자열 변환)</option>
                <option value="summary">요약 (키-값 나열)</option>
              </Select>
            </Field>
            <div style={{ fontSize: 11, color: "#555", padding: "8px 10px", background: "#111122", borderRadius: 6, marginBottom: 12 }}>
              워크플로우의 최종 결과를 반환합니다. 실행 히스토리에서 결과를 확인할 수 있습니다.
            </div>
          </>
        )}

        {/* 하단 메타 정보 */}
        <div style={{ marginTop: 8, padding: "8px 10px", background: "#080810", borderRadius: 6, fontSize: 9, color: "#333" }}>
          ID: {node.id} · Type: {node.type} · ({Math.round(node.x)}, {Math.round(node.y)})
        </div>
      </div>
    </div>
  );
}
