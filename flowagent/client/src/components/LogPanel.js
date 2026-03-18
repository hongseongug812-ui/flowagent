import React, { useRef, useEffect } from "react";

export default function LogPanel({ logs, onClear }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div style={{
      height: 160, background: "#0A0A18", borderTop: "1px solid #222244",
      display: "flex", flexDirection: "column", flexShrink: 0,
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 16px", borderBottom: "1px solid #191930",
      }}>
        <span style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>실행 로그</span>
        <button onClick={onClear} style={{
          background: "none", border: "none", color: "#555",
          fontSize: 10, cursor: "pointer", fontFamily: "inherit",
        }}>지우기</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "6px 16px" }}>
        {logs.map((log, i) => (
          <div key={i} style={{
            fontSize: 11, color: log.color, marginBottom: 3, lineHeight: 1.4,
            animation: "fadeIn 0.2s ease",
          }}>
            <span style={{ color: "#444", marginRight: 8 }}>{log.time}</span>
            {log.msg}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
