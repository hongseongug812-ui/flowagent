import React, { useState, useMemo } from "react";
import { NODE_TYPES, TEMPLATES } from "../utils/constants";

export default function Sidebar({
  onAddNode, onLoadTemplate, onRun, running,
  workflows, onLoadWorkflow, onNewWorkflow, onSave, saving, connected,
  onSchedule, currentWorkflowId, nodes, onDuplicateWorkflow, onDeleteWorkflow,
}) {
  const [tab, setTab] = useState("nodes");
  const [search, setSearch] = useState("");
  const [templateCat, setTemplateCat] = useState("전체");

  const categories = useMemo(() => {
    const cats = ["전체", ...new Set(TEMPLATES.map(t => t.category).filter(Boolean))];
    return cats;
  }, []);

  const filteredTemplates = useMemo(() => {
    if (templateCat === "전체") return TEMPLATES;
    return TEMPLATES.filter(t => t.category === templateCat);
  }, [templateCat]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedCron, setSchedCron] = useState("0 9 * * *");
  const [webhookUrl, setWebhookUrl] = useState(null);
  const [webhookLoading, setWebhookLoading] = useState(false);

  const scheduleTrigger = nodes?.find(n => n.type === "trigger" && n.config?.triggerType === "schedule");
  const webhookTrigger = nodes?.find(n => n.type === "trigger" && n.config?.triggerType === "webhook");
  const effectiveCron = scheduleTrigger?.config?.cron || schedCron;

  const handleGenerateWebhook = async () => {
    if (!currentWorkflowId) { alert("먼저 저장하세요"); return; }
    setWebhookLoading(true);
    const token = localStorage.getItem("fa_token");
    const res = await fetch(`/api/workflows/${currentWorkflowId}/webhook`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.webhookUrl) setWebhookUrl(`${window.location.origin}${data.webhookUrl}`);
    setWebhookLoading(false);
  };

  return (
    <div style={{
      width: 260, background: "#111128", borderRight: "1px solid #222244",
      display: "flex", flexDirection: "column", flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ padding: "20px 18px 12px", borderBottom: "1px solid #222244" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>
              <span style={{ color: "#8B5CF6" }}>◆</span> FlowAgent
            </div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>AI Workflow Builder</div>
          </div>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: connected ? "#4ade80" : "#EF4444",
          }} title={connected ? "서버 연결됨" : "서버 연결 안됨"} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #222244" }}>
        {[
          { key: "nodes", label: "노드" },
          { key: "templates", label: "템플릿" },
          { key: "saved", label: "저장됨" },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "10px 0", background: "none", border: "none",
            color: tab === t.key ? "#8B5CF6" : "#666",
            borderBottom: tab === t.key ? "2px solid #8B5CF6" : "2px solid transparent",
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
        {tab === "nodes" && Object.entries(NODE_TYPES).map(([key, t]) => (
          <button key={key} onClick={() => onAddNode(key)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", marginBottom: 6, background: "#1A1A2E",
            border: "1px solid #222244", borderRadius: 10, cursor: "pointer",
            color: "#E0E0F0", fontFamily: "inherit", fontSize: 12, textAlign: "left",
            transition: "border-color 0.2s",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = t.color)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222244")}
          >
            <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{t.icon}</span>
            <div>
              <div style={{ fontWeight: 700, color: t.color }}>{t.label}</div>
              <div style={{ fontSize: 10, color: "#666", marginTop: 1 }}>{t.desc}</div>
            </div>
          </button>
        ))}

        {tab === "templates" && (
          <>
            {/* 카테고리 필터 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              {categories.map(cat => (
                <button key={cat} onClick={() => setTemplateCat(cat)} style={{
                  padding: "3px 9px", fontSize: 10, fontFamily: "inherit",
                  background: templateCat === cat ? "#8B5CF622" : "none",
                  border: `1px solid ${templateCat === cat ? "#8B5CF6" : "#333"}`,
                  borderRadius: 20, color: templateCat === cat ? "#C4B5FD" : "#555",
                  cursor: "pointer", transition: "all 0.15s",
                }}>{cat}</button>
              ))}
            </div>
            {filteredTemplates.map((t) => {
              const realIdx = TEMPLATES.indexOf(t);
              return (
                <button key={realIdx} onClick={() => onLoadTemplate(realIdx)} style={{
                  width: "100%", padding: "12px 12px", marginBottom: 6,
                  background: "#1A1A2E", border: "1px solid #222244", borderRadius: 10,
                  cursor: "pointer", color: "#E0E0F0", fontFamily: "inherit", textAlign: "left",
                  fontSize: 12, transition: "border-color 0.2s",
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#8B5CF6")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#222244")}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, flex: 1 }}>{t.name}</div>
                    {t.category && (
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 10, flexShrink: 0, marginLeft: 6,
                        background: "#8B5CF622", color: "#8B5CF6", border: "1px solid #8B5CF633",
                      }}>{t.category}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 6, lineHeight: 1.4 }}>{t.desc}</div>
                  <div style={{ fontSize: 10, color: "#444" }}>
                    {t.nodes.length}개 노드 · {t.edges.length}개 연결
                  </div>
                </button>
              );
            })}
          </>
        )}

        {tab === "saved" && (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="워크플로우 검색..."
              style={{
                width: "100%", padding: "7px 10px", marginBottom: 8,
                background: "#0D0D22", border: "1px solid #222244",
                borderRadius: 8, color: "#E0E0F0", fontSize: 11,
                fontFamily: "inherit", outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => e.currentTarget.style.borderColor = "#8B5CF6"}
              onBlur={e => e.currentTarget.style.borderColor = "#222244"}
            />
            <button onClick={onNewWorkflow} style={{
              width: "100%", padding: "10px 12px", marginBottom: 10,
              background: "none", border: "1px dashed #444", borderRadius: 10,
              cursor: "pointer", color: "#888", fontFamily: "inherit", fontSize: 12,
            }}>
              + 새 워크플로우
            </button>
            {workflows.filter(wf => wf.name.toLowerCase().includes(search.toLowerCase())).map((wf) => (
              <div key={wf.id} style={{ position: "relative", marginBottom: 6 }}
                onMouseEnter={e => { const b = e.currentTarget.querySelector(".dup-btn"); if (b) b.style.opacity = "1"; }}
                onMouseLeave={e => { const b = e.currentTarget.querySelector(".dup-btn"); if (b) b.style.opacity = "0"; }}
              >
                <button onClick={() => onLoadWorkflow(wf.id)} style={{
                  width: "100%", padding: "12px 12px", paddingRight: 36,
                  background: wf.id === currentWorkflowId ? "#1A1A3A" : "#1A1A2E",
                  border: `1px solid ${wf.id === currentWorkflowId ? "#8B5CF6" : "#222244"}`,
                  borderRadius: 10,
                  cursor: "pointer", color: "#E0E0F0", fontFamily: "inherit", textAlign: "left",
                  fontSize: 12, transition: "border-color 0.2s",
                }}
                  onMouseEnter={(e) => { if (wf.id !== currentWorkflowId) e.currentTarget.style.borderColor = "#8B5CF6"; }}
                  onMouseLeave={(e) => { if (wf.id !== currentWorkflowId) e.currentTarget.style.borderColor = "#222244"; }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{wf.name}</div>
                  <div style={{ fontSize: 10, color: "#555" }}>
                    {wf.nodeCount}개 노드 · {wf.edgeCount}개 연결
                  </div>
                </button>
                <div
                  className="dup-btn"
                  style={{
                    position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                    display: "flex", gap: 2,
                    opacity: 0, transition: "opacity 0.15s",
                  }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onDuplicateWorkflow?.(wf.id); }}
                    title="복제"
                    style={{
                      background: "none", border: "none", color: "#555", cursor: "pointer",
                      fontSize: 13, padding: 4,
                    }}
                  >⧉</button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`"${wf.name}" 워크플로우를 삭제할까요?`)) {
                        onDeleteWorkflow?.(wf.id);
                      }
                    }}
                    title="삭제"
                    style={{
                      background: "none", border: "none", color: "#EF444488", cursor: "pointer",
                      fontSize: 12, padding: 4,
                    }}
                  >✕</button>
                </div>
              </div>
            ))}
            {workflows.length === 0 && (
              <div style={{ fontSize: 11, color: "#444", textAlign: "center", marginTop: 20 }}>
                저장된 워크플로우 없음
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ padding: 12, borderTop: "1px solid #222244", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Webhook URL */}
        {webhookTrigger && currentWorkflowId && (
          <div style={{ background: "#0D0D1A", borderRadius: 10, padding: "10px 12px", border: "1px solid #222244" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: webhookUrl ? 8 : 0 }}>
              <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 700 }}>🔗 Webhook URL</span>
              <button onClick={handleGenerateWebhook} disabled={webhookLoading} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                {webhookLoading ? "생성 중..." : webhookUrl ? "재생성" : "생성"}
              </button>
            </div>
            {webhookUrl && (
              <div
                onClick={() => { navigator.clipboard.writeText(webhookUrl); }}
                title="클릭하여 복사"
                style={{ fontSize: 10, color: "#888", background: "#1A1A2E", padding: "6px 8px", borderRadius: 6, cursor: "pointer", wordBreak: "break-all", lineHeight: 1.5 }}
              >
                {webhookUrl}
                <span style={{ color: "#555", marginLeft: 4 }}>📋</span>
              </div>
            )}
          </div>
        )}
        {/* Schedule toggle */}
        {scheduleTrigger && currentWorkflowId && (
          <div style={{ background: "#0D0D1A", borderRadius: 10, padding: "10px 12px", border: "1px solid #222244" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showSchedule ? 10 : 0 }}>
              <div>
                <span style={{ fontSize: 11, color: "#8B5CF6", fontWeight: 700 }}>⏰ 스케줄 실행</span>
                {effectiveCron && (
                  <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>{effectiveCron}</div>
                )}
              </div>
              <button onClick={() => setShowSchedule(v => !v)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                {showSchedule ? "접기" : "변경"}
              </button>
            </div>
            {showSchedule && (
              <>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 6 }}>
                  Cron 표현식 (분 시 일 월 요일)
                </div>
                <input
                  value={schedCron}
                  onChange={e => setSchedCron(e.target.value)}
                  placeholder={effectiveCron || "0 10 * * 1"}
                  style={{ width: "100%", padding: "6px 8px", background: "#1A1A2E", border: "1px solid #333", borderRadius: 6, color: "#E0E0F0", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8, outline: "none" }}
                />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => onSchedule({ cron: schedCron || effectiveCron, enabled: true })} style={{ flex: 1, padding: "7px 0", background: "#4ade8033", border: "1px solid #4ade8066", borderRadius: 6, color: "#4ade80", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    ▶ 활성화
                  </button>
                  <button onClick={() => onSchedule({ cron: schedCron || effectiveCron, enabled: false })} style={{ flex: 1, padding: "7px 0", background: "none", border: "1px solid #444", borderRadius: 6, color: "#888", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    ■ 중지
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <button onClick={onSave} disabled={saving} style={{
          width: "100%", padding: "10px 0",
          background: "none", border: "1px solid #444",
          borderRadius: 10, color: "#E0E0F0", fontFamily: "inherit",
          fontSize: 12, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
        }}>
          {saving ? "저장 중..." : "💾 저장"}
        </button>
        <button onClick={onRun} disabled={running || !connected} style={{
          width: "100%", padding: "12px 0",
          background: running ? "#333" : !connected ? "#222" : "linear-gradient(135deg, #8B5CF6, #6D28D9)",
          border: "none", borderRadius: 10, color: "#fff", fontFamily: "inherit",
          fontSize: 13, fontWeight: 700,
          cursor: running || !connected ? "not-allowed" : "pointer",
          opacity: !connected ? 0.5 : 1,
        }}>
          {running ? "⏳ 실행 중..." : !connected ? "서버 연결 대기..." : "▶ 워크플로우 실행"}
        </button>
      </div>
    </div>
  );
}
