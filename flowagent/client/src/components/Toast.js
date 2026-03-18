import { useState, useEffect } from "react";
import { toast } from "../utils/toast";

const COLORS = {
  success: { bg: "#052e16", border: "#16a34a", icon: "✓", text: "#4ade80" },
  error:   { bg: "#2d0a0a", border: "#dc2626", icon: "✗", text: "#f87171" },
  info:    { bg: "#0d1225", border: "#3b82f6", icon: "ℹ", text: "#60a5fa" },
  warn:    { bg: "#1c1000", border: "#d97706", icon: "⚠", text: "#fbbf24" },
};

export default function ToastContainer() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    return toast._subscribe(item => {
      setItems(prev => [...prev, item]);
      setTimeout(() => {
        setItems(prev => prev.filter(t => t.id !== item.id));
      }, 3200);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "fixed", top: 16, right: 16,
      zIndex: 9999, display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {items.map(item => {
        const c = COLORS[item.type] || COLORS.info;
        return (
          <div key={item.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px", borderRadius: 10,
            background: c.bg, border: `1px solid ${c.border}`,
            minWidth: 220, maxWidth: 360,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            animation: "fadeIn 0.2s ease",
          }}>
            <span style={{ color: c.text, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{c.icon}</span>
            <span style={{ color: "#D0D0E8", fontSize: 12, lineHeight: 1.4 }}>{item.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
