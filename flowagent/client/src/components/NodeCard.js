import React from "react";
import { NODE_TYPES } from "../utils/constants";

export default function NodeCard({
  node, selected, onSelect, onDragStart, onConnectStart, onConnectEnd, running, done, error,
}) {
  const t = NODE_TYPES[node.type];
  if (!t) return null;

  const borderColor = error ? "#EF4444" : selected ? "#fff" : t.color;
  const glow = error
    ? "0 0 20px #EF444488"
    : running
    ? `0 0 24px ${t.color}88`
    : done ? `0 0 12px ${t.color}44` : "none";

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
        background: "#1A1A2E",
        border: `2px solid ${borderColor}`,
        borderRadius: 14,
        padding: "14px 16px",
        cursor: "grab",
        userSelect: "none",
        boxShadow: glow,
        transition: "box-shadow 0.4s, border-color 0.2s",
        zIndex: selected ? 10 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{t.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.color, letterSpacing: 0.5 }}>
          {t.label}
        </span>
        {running && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: t.color, animation: "pulse 1s infinite" }}>
            실행 중...
          </span>
        )}
        {error && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#EF4444" }}>✗ 오류</span>
        )}
        {done && !running && !error && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>
        )}
      </div>

      <div style={{ fontSize: 13, color: "#E0E0F0", fontWeight: 600 }}>
        {node.config?.name || t.desc}
      </div>

      {node.type === "ai_agent" && node.config?.model && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>{node.config.model}</div>
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
      {node.type !== "output" && (
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
