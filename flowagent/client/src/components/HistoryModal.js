import React, { useState, useEffect } from "react";

function getToken() { return localStorage.getItem("fa_token"); }

const STATUS_COLORS = {
  completed: "#4ADE80",
  failed: "#F87171",
  running: "#FBBF24",
};
const STATUS_LABELS = { completed: "완료", failed: "실패", running: "실행 중" };

function formatDuration(startedAt, completedAt) {
  if (!completedAt) return "-";
  const ms = new Date(completedAt) - new Date(startedAt);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function HistoryModal({ onClose }) {
  const [executions, setExecutions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/executions", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => { setExecutions(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const detail = selected ? executions.find(e => e.id === selected) : null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "#111128", border: "1px solid #222244",
        borderRadius: 16, width: "100%", maxWidth: 860,
        maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 24px", borderBottom: "1px solid #1A1A3A", flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>📋 실행 히스토리</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* List */}
          <div style={{
            width: 340, borderRight: "1px solid #1A1A3A",
            overflowY: "auto", flexShrink: 0,
          }}>
            {loading ? (
              <div style={{ color: "#555", fontSize: 12, textAlign: "center", padding: 40 }}>로딩 중...</div>
            ) : executions.length === 0 ? (
              <div style={{ color: "#444", fontSize: 12, textAlign: "center", padding: 40 }}>
                실행 기록이 없습니다.<br />
                <span style={{ color: "#333" }}>워크플로우를 실행하면 여기에 표시됩니다.</span>
              </div>
            ) : (
              executions.map(ex => (
                <div
                  key={ex.id}
                  onClick={() => setSelected(ex.id)}
                  style={{
                    padding: "12px 16px", borderBottom: "1px solid #111133",
                    cursor: "pointer",
                    background: selected === ex.id ? "#1A1A3A" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (selected !== ex.id) e.currentTarget.style.background = "#0D0D22"; }}
                  onMouseLeave={e => { if (selected !== ex.id) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#C4B5FD", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ex.workflowName}
                    </div>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: STATUS_COLORS[ex.status] + "22",
                      color: STATUS_COLORS[ex.status],
                      fontWeight: 700,
                    }}>
                      {STATUS_LABELS[ex.status] || ex.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#555" }}>
                    {formatDate(ex.startedAt)} · {formatDuration(ex.startedAt, ex.completedAt)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Detail */}
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {!detail ? (
              <div style={{ color: "#333", fontSize: 12, textAlign: "center", paddingTop: 60 }}>
                왼쪽에서 실행 기록을 선택하세요
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{detail.workflowName}</div>
                  <div style={{ fontSize: 11, color: "#555", display: "flex", gap: 12 }}>
                    <span>시작: {formatDate(detail.startedAt)}</span>
                    <span>소요: {formatDuration(detail.startedAt, detail.completedAt)}</span>
                    <span style={{ color: STATUS_COLORS[detail.status] }}>{STATUS_LABELS[detail.status]}</span>
                  </div>
                </div>

                {/* Node results */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#8B5CF6", marginBottom: 8 }}>노드 결과</div>
                  {Object.entries(detail.nodeResults || {}).map(([nodeId, result]) => (
                    <div key={nodeId} style={{
                      padding: "10px 14px", marginBottom: 6,
                      background: "#0D0D22", borderRadius: 8,
                      border: `1px solid ${result.status === "done" ? "#1A3A1A" : "#3A1A1A"}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "#666" }}>{nodeId}</span>
                        <span style={{ fontSize: 10, color: result.status === "done" ? "#4ADE80" : "#F87171", fontWeight: 700 }}>
                          {result.status === "done" ? "✓ 완료" : "✗ 오류"}
                        </span>
                      </div>
                      {result.error ? (
                        <div style={{ fontSize: 11, color: "#F87171" }}>{result.error}</div>
                      ) : (
                        <pre style={{
                          fontSize: 10, color: "#888", margin: 0,
                          whiteSpace: "pre-wrap", wordBreak: "break-all",
                          maxHeight: 120, overflow: "auto",
                        }}>
                          {JSON.stringify(result.output, null, 2).slice(0, 600)}
                          {JSON.stringify(result.output).length > 600 ? "\n..." : ""}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>

                {/* Logs */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#8B5CF6", marginBottom: 8 }}>실행 로그</div>
                  <div style={{
                    background: "#060612", borderRadius: 8, padding: 12,
                    fontFamily: "monospace", fontSize: 11, lineHeight: 1.7,
                    maxHeight: 200, overflowY: "auto",
                  }}>
                    {(detail.logs || []).length === 0 ? (
                      <span style={{ color: "#333" }}>로그 없음</span>
                    ) : (
                      detail.logs.map((log, i) => (
                        <div key={i} style={{
                          color: log.msg?.includes("오류") || log.msg?.includes("✗") ? "#F87171"
                            : log.msg?.includes("✓") ? "#4ADE80" : "#555",
                        }}>
                          <span style={{ color: "#333", marginRight: 8 }}>
                            {new Date(log.time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          {log.msg}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
