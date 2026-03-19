import { NODE_TYPES } from "../utils/constants";

// 노드 타입별 설정 미리보기 텍스트
function getSubInfo(node) {
  const c = node.config || {};
  switch (node.type) {
    case "trigger":
      if (c.triggerType === "schedule") return `⏰ ${c.cron || "cron 미설정"}`;
      if (c.triggerType === "webhook") return "🔗 Webhook";
      return "▶ 수동 실행";
    case "ai_agent":
      return c.model ? `🤖 ${c.model}` : "모델 미선택";
    case "api_call": {
      const url = c.url ? c.url.replace(/^https?:\/\//, "").slice(0, 28) : "URL 미설정";
      return `${c.method || "GET"} ${url}`;
    }
    case "condition":
      return c.conditions?.length
        ? `${c.conditions.length}개 조건 (${c.logic || "AND"})`
        : "조건 미설정";
    case "transform":
      return c.code ? "JS 코드 설정됨" : "코드 미설정";
    case "filter":
      return c.field ? `${c.field} ${c.operator || "contains"} "${c.value || ""}"` : "필터 미설정";
    case "loop":
      return c.code ? `최대 ${c.limit || 100}개 항목 처리` : "코드 미설정";
    case "delay":
      return `⏱ ${c.seconds || 5}초 대기`;
    case "http_response":
      return `↩ HTTP ${c.status || 200}`;
    case "rss_feed":
      return c.url ? c.url.replace(/^https?:\/\//, "").slice(0, 28) : "URL 미설정";
    case "slack":
    case "discord":
    case "telegram":
      return c.message ? c.message.slice(0, 30) + (c.message.length > 30 ? "…" : "") : "메시지 미설정";
    case "notion":
      return c.database_id ? `DB: ${c.database_id.slice(0, 8)}…` : "DB ID 미설정";
    case "email":
      return c.to ? `→ ${c.to}` : "받는 사람 미설정";
    case "output":
      return c.format ? `형식: ${c.format}` : "형식: json";
    default:
      return null;
  }
}

export default function NodeCard({
  node, selected, onSelect, onDragStart, onConnectStart, onConnectEnd, running, done, error,
}) {
  const t = NODE_TYPES[node.type];
  if (!t) return null;

  const borderColor = error ? "#EF4444" : selected ? "#fff" : t.color;
  const glow = error
    ? "0 0 20px #EF444488"
    : running
    ? `0 0 28px ${t.color}99`
    : done ? `0 0 12px ${t.color}44` : "none";

  const subInfo = getSubInfo(node);
  const hasRetry = (node.config?.retry_count || 0) > 0;

  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(node.id);
        onDragStart(e, node.id);
      }}
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: 220,
        minHeight: 90,
        background: running ? "#1A1A35" : "#1A1A2E",
        border: `2px solid ${borderColor}`,
        borderRadius: 14,
        padding: "12px 16px",
        cursor: "grab",
        userSelect: "none",
        boxShadow: glow,
        transition: "box-shadow 0.3s, border-color 0.2s, background 0.2s",
        zIndex: selected ? 10 : 1,
      }}
    >
      {/* Running pulse ring */}
      {running && (
        <div style={{
          position: "absolute", inset: -4, borderRadius: 18,
          border: `2px solid ${t.color}55`,
          animation: "nodeRing 1.2s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{t.icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: t.color, letterSpacing: 0.3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.label}
        </span>
        {running && (
          <span style={{ fontSize: 9, color: t.color, animation: "textPulse 1s infinite", whiteSpace: "nowrap" }}>
            ●
          </span>
        )}
        {error && (
          <span style={{ fontSize: 9, color: "#EF4444", whiteSpace: "nowrap" }}>✗ 오류</span>
        )}
        {done && !running && !error && (
          <span style={{ fontSize: 10, color: "#4ade80" }}>✓</span>
        )}
        {hasRetry && !running && !error && !done && (
          <span title={`재시도 ${node.config.retry_count}회 설정됨`} style={{ fontSize: 9, color: "#78716C" }}>↺{node.config.retry_count}</span>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#E0E0F0", fontWeight: 600, marginBottom: subInfo ? 4 : 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.config?.name || t.desc}
      </div>

      {subInfo && (
        <div style={{
          fontSize: 10, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight: 1.4,
        }}>
          {subInfo}
        </div>
      )}

      {/* Input port */}
      {node.type !== "trigger" && (
        <div
          onMouseUp={(e) => { e.stopPropagation(); onConnectEnd(node.id); }}
          style={{
            position: "absolute", left: -7, top: "50%", transform: "translateY(-50%)",
            width: 14, height: 14, borderRadius: "50%",
            background: "#1A1A2E", border: `2px solid ${t.color}`,
            cursor: "crosshair", zIndex: 20,
          }}
        />
      )}

      {/* Output port */}
      {node.type !== "output" && node.type !== "http_response" && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); onConnectStart(e, node.id); }}
          style={{
            position: "absolute", right: -7, top: "50%", transform: "translateY(-50%)",
            width: 14, height: 14, borderRadius: "50%",
            background: t.color, border: `2px solid ${t.color}`,
            cursor: "crosshair", zIndex: 20,
          }}
        />
      )}
    </div>
  );
}
