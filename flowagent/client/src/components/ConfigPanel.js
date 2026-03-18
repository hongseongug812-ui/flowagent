import React from "react";
import { NODE_TYPES } from "../utils/constants";

const inputStyle = {
  width: "100%", padding: "8px 10px", background: "#1A1A2E",
  border: "1px solid #333", borderRadius: 6, color: "#E0E0F0",
  fontSize: 12, marginBottom: 14, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};

export default function ConfigPanel({ node, onUpdate, onClose }) {
  if (!node) return null;
  const t = NODE_TYPES[node.type];

  const set = (key, val) => onUpdate(node.id, key, val);

  return (
    <div style={{
      width: 280, background: "#111128", borderLeft: "1px solid #222244",
      padding: 16, overflow: "auto", flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: t.color }}>
          {t.icon} 노드 설정
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#666",
          cursor: "pointer", fontSize: 16, fontFamily: "inherit",
        }}>✕</button>
      </div>

      <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>이름</label>
      <input
        value={node.config?.name || ""}
        onChange={(e) => set("name", e.target.value)}
        style={inputStyle}
      />

      {node.type === "ai_agent" && (
        <>
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>모델</label>
          <select
            value={node.config?.model || "claude-sonnet"}
            onChange={(e) => set("model", e.target.value)}
            style={inputStyle}
          >
            <option value="claude-sonnet">Claude Sonnet</option>
            <option value="claude-haiku">Claude Haiku</option>
            <option value="claude-opus">Claude Opus</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="gemini-pro">Gemini Pro</option>
          </select>

          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>프롬프트</label>
          <textarea
            value={node.config?.prompt || ""}
            onChange={(e) => set("prompt", e.target.value)}
            rows={6}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontSize: 11 }}
          />

          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Temperature</label>
          <input
            type="number"
            min="0" max="2" step="0.1"
            value={node.config?.temperature ?? 0.7}
            onChange={(e) => set("temperature", parseFloat(e.target.value))}
            style={inputStyle}
          />
        </>
      )}

      {node.type === "trigger" && (
        <>
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>트리거 타입</label>
          <select
            value={node.config?.triggerType || "webhook"}
            onChange={(e) => set("triggerType", e.target.value)}
            style={inputStyle}
          >
            <option value="webhook">Webhook</option>
            <option value="schedule">스케줄 (Cron)</option>
            <option value="manual">수동 실행</option>
            <option value="email">이메일 수신</option>
          </select>

          {node.config?.triggerType === "schedule" && (
            <>
              <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Cron 프리셋</label>
              <select
                onChange={(e) => set("cron", e.target.value)}
                style={inputStyle}
                defaultValue=""
              >
                <option value="">-- 프리셋 선택 --</option>
                <option value="0 9 * * *">매일 오전 9시</option>
                <option value="0 9 * * 1-5">평일 오전 9시</option>
                <option value="0 */6 * * *">6시간마다</option>
                <option value="*/30 * * * *">30분마다</option>
                <option value="0 0 * * 0">매주 일요일 자정</option>
                <option value="0 0 1 * *">매월 1일 자정</option>
              </select>
              <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Cron 표현식</label>
              <input
                value={node.config?.cron || "0 9 * * *"}
                onChange={(e) => set("cron", e.target.value)}
                placeholder="0 9 * * *"
                style={inputStyle}
              />
              <div style={{ fontSize: 10, color: "#555", marginBottom: 14 }}>
                분 시 일 월 요일 (서울 시간대 기준)
              </div>
            </>
          )}
        </>
      )}

      {node.type === "api_call" && (
        <>
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Method</label>
          <select
            value={node.config?.method || "GET"}
            onChange={(e) => set("method", e.target.value)}
            style={inputStyle}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>

          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>URL</label>
          <input
            value={node.config?.url || ""}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://api.example.com/..."
            style={inputStyle}
          />

          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Headers (JSON)</label>
          <textarea
            value={node.config?.headers || "{}"}
            onChange={(e) => set("headers", e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: "vertical", fontSize: 11 }}
          />
        </>
      )}

      {node.type === "condition" && (
        <>
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>조건 표현식</label>
          <input
            value={node.config?.expression || ""}
            onChange={(e) => set("expression", e.target.value)}
            placeholder="output.category === '업무'"
            style={inputStyle}
          />
        </>
      )}

      {node.type === "transform" && (
        <>
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>변환 코드 (JS)</label>
          <textarea
            value={node.config?.code || "// input 변수에 이전 노드 출력이 들어옵니다\nreturn input;"}
            onChange={(e) => set("code", e.target.value)}
            rows={6}
            style={{ ...inputStyle, resize: "vertical", fontSize: 11, lineHeight: 1.5 }}
          />
        </>
      )}

      {node.type === "slack" && (
        <>
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Webhook URL</label>
          <input
            value={node.config?.webhook_url || ""}
            onChange={(e) => set("webhook_url", e.target.value)}
            placeholder="https://hooks.slack.com/services/... (비워두면 설정값 사용)"
            style={inputStyle}
          />
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>메시지</label>
          <textarea
            value={node.config?.message || "{{input.result}}"}
            onChange={(e) => set("message", e.target.value)}
            rows={4}
            placeholder="{{input.result}} — 이전 노드 출력 참조 가능"
            style={{ ...inputStyle, resize: "vertical", fontSize: 11, lineHeight: 1.5 }}
          />
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>채널 (선택)</label>
          <input
            value={node.config?.channel || ""}
            onChange={(e) => set("channel", e.target.value)}
            placeholder="#general"
            style={inputStyle}
          />
        </>
      )}

      {node.type === "discord" && (
        <>
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Webhook URL</label>
          <input
            value={node.config?.webhook_url || ""}
            onChange={(e) => set("webhook_url", e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            style={inputStyle}
          />
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>메시지</label>
          <textarea
            value={node.config?.message || "{{input.result}}"}
            onChange={(e) => set("message", e.target.value)}
            rows={4}
            placeholder="{{input.result}} — 이전 노드 출력 참조 가능"
            style={{ ...inputStyle, resize: "vertical", fontSize: 11, lineHeight: 1.5 }}
          />
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Bot 이름 (선택)</label>
          <input
            value={node.config?.username || "FlowAgent"}
            onChange={(e) => set("username", e.target.value)}
            placeholder="FlowAgent"
            style={inputStyle}
          />
        </>
      )}

      {node.type === "telegram" && (
        <>
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Bot Token</label>
          <input
            type="password"
            value={node.config?.bot_token || ""}
            onChange={(e) => set("bot_token", e.target.value)}
            placeholder="123456:ABC-... (비워두면 설정값 사용)"
            style={inputStyle}
          />
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>Chat ID</label>
          <input
            value={node.config?.chat_id || ""}
            onChange={(e) => set("chat_id", e.target.value)}
            placeholder="-1001234567890 또는 @채널명"
            style={inputStyle}
          />
          <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 4 }}>메시지</label>
          <textarea
            value={node.config?.message || "{{input.result}}"}
            onChange={(e) => set("message", e.target.value)}
            rows={4}
            placeholder="{{input.result}} — 이전 노드 출력 참조 가능"
            style={{ ...inputStyle, resize: "vertical", fontSize: 11, lineHeight: 1.5 }}
          />
        </>
      )}

      <div style={{ marginTop: 8, padding: "10px 12px", background: "#0D0D1A", borderRadius: 8, fontSize: 10, color: "#555" }}>
        <div>ID: {node.id}</div>
        <div>Type: {node.type}</div>
        <div>Position: ({Math.round(node.x)}, {Math.round(node.y)})</div>
      </div>
    </div>
  );
}
