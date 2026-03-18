import React, { useState, useEffect } from "react";

const inputStyle = {
  width: "100%", padding: "10px 12px",
  background: "#1A1A2E", border: "1px solid #333",
  borderRadius: 8, color: "#E0E0F0",
  fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};

const labelStyle = {
  fontSize: 11, color: "#888",
  display: "block", marginBottom: 6, marginTop: 16,
};

const sectionTitle = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
  textTransform: "uppercase", color: "#8B5CF6",
  marginTop: 24, marginBottom: 4,
};

export default function SettingsModal({ user, onClose }) {
  const [fields, setFields] = useState({
    openai_api_key: "",
    slack_webhook_url: "",
    discord_webhook_url: "",
    telegram_bot_token: "",
    notion_api_key: "",
    sendgrid_api_key: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("fa_token");
    fetch("/api/settings", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setFields(prev => ({ ...prev, ...data }));
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem("fa_token");
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const set = (k, v) => setFields(prev => ({ ...prev, [k]: v }));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "#111128", border: "1px solid #222244",
        borderRadius: 16, width: "100%", maxWidth: 480,
        padding: 28, maxHeight: "90vh", overflow: "auto",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>⚙ 설정</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 20 }}>
          {user.email} · {user.plan === "free" ? "Free 플랜" : "Pro 플랜"}
        </div>

        {loading ? (
          <div style={{ color: "#555", fontSize: 13, textAlign: "center", padding: 20 }}>불러오는 중...</div>
        ) : (
          <>
            {/* AI */}
            <div style={sectionTitle}>AI 서비스</div>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 12 }}>
              AI Agent 노드에서 사용됩니다. 비워두면 서버 기본 키를 사용합니다.
            </div>

            <label style={labelStyle}>OpenAI API Key</label>
            <input
              type="password"
              value={fields.openai_api_key || ""}
              onChange={e => set("openai_api_key", e.target.value)}
              placeholder="sk-proj-..."
              style={inputStyle}
            />

            {/* 메시지/알림 */}
            <div style={{ ...sectionTitle, marginTop: 28 }}>메시지 & 알림</div>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 12 }}>
              API Call 노드에서 URL에 직접 입력하거나 여기에 저장해두세요.
            </div>

            <label style={labelStyle}>Slack Incoming Webhook URL</label>
            <input
              type="text"
              value={fields.slack_webhook_url || ""}
              onChange={e => set("slack_webhook_url", e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              style={inputStyle}
            />

            <label style={labelStyle}>Discord Webhook URL</label>
            <input
              type="text"
              value={fields.discord_webhook_url || ""}
              onChange={e => set("discord_webhook_url", e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              style={inputStyle}
            />

            <label style={labelStyle}>Telegram Bot Token</label>
            <input
              type="password"
              value={fields.telegram_bot_token || ""}
              onChange={e => set("telegram_bot_token", e.target.value)}
              placeholder="123456:ABC-DEF..."
              style={inputStyle}
            />

            <label style={labelStyle}>SendGrid API Key</label>
            <input
              type="password"
              value={fields.sendgrid_api_key || ""}
              onChange={e => set("sendgrid_api_key", e.target.value)}
              placeholder="SG...."
              style={inputStyle}
            />

            {/* 생산성 */}
            <div style={{ ...sectionTitle, marginTop: 28 }}>생산성 도구</div>

            <label style={labelStyle}>Notion API Key</label>
            <input
              type="password"
              value={fields.notion_api_key || ""}
              onChange={e => set("notion_api_key", e.target.value)}
              placeholder="secret_..."
              style={inputStyle}
            />

            {/* 저장 */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: "100%", marginTop: 28, padding: "12px 0",
                background: saved ? "#16a34a" : "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                border: "none", borderRadius: 10,
                color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "background 0.3s",
              }}
            >
              {saving ? "저장 중..." : saved ? "✓ 저장됨" : "저장"}
            </button>

            <div style={{ marginTop: 20, padding: "12px 14px", background: "#0D0D1A", borderRadius: 10, fontSize: 11, color: "#555", lineHeight: 1.7 }}>
              🔒 API 키는 암호화되어 저장되며 외부에 노출되지 않습니다.<br />
              워크플로우 실행 시에만 서버에서 사용됩니다.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
