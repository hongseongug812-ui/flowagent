import React, { useState, useRef, useCallback, useEffect } from "react";
import { NODE_TYPES, TEMPLATES } from "./utils/constants";
import { useWebSocket } from "./hooks/useWebSocket";
import { useWorkflowAPI } from "./hooks/useWorkflowAPI";
import { useAuth } from "./hooks/useAuth";
import NodeCard from "./components/NodeCard";
import EdgeLine from "./components/EdgeLine";
import Sidebar from "./components/Sidebar";
import ConfigPanel from "./components/ConfigPanel";
import LogPanel from "./components/LogPanel";
import LandingPage from "./components/LandingPage";
import SettingsModal from "./components/SettingsModal";
import CalendarModal from "./components/CalendarModal";
import HistoryModal from "./components/HistoryModal";
import ChatModal from "./components/ChatModal";
import ToastContainer from "./components/Toast";
import { toast } from "./utils/toast";

function uid() {
  return "n" + Math.random().toString(36).slice(2, 8);
}

const INITIAL_NODES = [
  { id: "n1", type: "trigger", x: 100, y: 250, config: { name: "Webhook 수신", triggerType: "webhook" } },
  { id: "n2", type: "ai_agent", x: 420, y: 250, config: { name: "텍스트 분석", model: "claude-sonnet", prompt: "입력된 텍스트를 분석하고 요약해주세요" } },
  { id: "n3", type: "output", x: 740, y: 250, config: { name: "결과 반환" } },
];
const INITIAL_EDGES = [["n1", "n2"], ["n2", "n3"]];

export default function App() {
  const { user, logout } = useAuth();
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [edges, setEdges] = useState(INITIAL_EDGES);
  const [selected, setSelected] = useState(null);
  // Undo/Redo history
  const [historyStack, setHistoryStack] = useState([]);
  const [futureStack, setFutureStack] = useState([]);
  // Copy/Paste clipboard
  const [clipboard, setClipboard] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOff, setDragOff] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState(null);
  const [connLine, setConnLine] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const spaceDown = useRef(false);
  const [runCount, setRunCount] = useState(null);

  const canvasRef = useRef(null);

  const { connected, runState, logs, runWorkflow, clearLogs } = useWebSocket();
  const api = useWorkflowAPI();

  // Auto-save whenever nodes/edges/name change (after initial load)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!user) return;
    api.scheduleAutoSave(workflowName, nodes, edges);
  }, [nodes, edges, workflowName]); // eslint-disable-line

  // Load saved workflows on mount; show onboarding if first time
  useEffect(() => {
    if (!user) return;
    api.fetchWorkflows().then(list => {
      if (Array.isArray(list) && list.length === 0 && !localStorage.getItem("fa_onboarded")) {
        setShowOnboarding(true);
      }
    }).catch(() => {});
    // Fetch run count for free plan users
    const token = localStorage.getItem("fa_token");
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.runCount !== undefined) setRunCount(data.runCount); })
      .catch(() => {});
  }, [user]); // eslint-disable-line

  // ── Undo / Redo ──────────────────────────────────────────────
  const pushHistory = useCallback((prevNodes, prevEdges) => {
    setHistoryStack(h => [...h.slice(-29), { nodes: prevNodes, edges: prevEdges }]);
    setFutureStack([]);
  }, []);

  const undo = useCallback(() => {
    setHistoryStack(h => {
      if (!h.length) { toast.warn("더 이상 되돌릴 수 없습니다"); return h; }
      const prev = h[h.length - 1];
      setFutureStack(f => [{ nodes, edges }, ...f.slice(0, 29)]);
      setNodes(prev.nodes);
      setEdges(prev.edges);
      return h.slice(0, -1);
    });
  }, [nodes, edges]); // eslint-disable-line

  const redo = useCallback(() => {
    setFutureStack(f => {
      if (!f.length) { toast.warn("더 이상 앞으로 갈 수 없습니다"); return f; }
      const next = f[0];
      setHistoryStack(h => [...h.slice(-29), { nodes, edges }]);
      setNodes(next.nodes);
      setEdges(next.edges);
      return f.slice(1);
    });
  }, [nodes, edges]); // eslint-disable-line

  // ── Drag ────────────────────────────────────────────────────
  const handleDragStart = useCallback((e, id) => {
    const n = nodes.find((n) => n.id === id);
    if (!n) return;
    setDragging(id);
    const rect = canvasRef.current.getBoundingClientRect();
    setDragOff({
      x: e.clientX - rect.left - n.x * zoom - pan.x,
      y: e.clientY - rect.top - n.y * zoom - pan.y,
    });
  }, [nodes, zoom, pan]);

  const handleMouseMove = useCallback((e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      panStart.current = { x: e.clientX, y: e.clientY };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }
    if (dragging) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setNodes((prev) =>
        prev.map((n) =>
          n.id === dragging
            ? { ...n, x: (mx - dragOff.x - pan.x) / zoom, y: (my - dragOff.y - pan.y) / zoom }
            : n
        )
      );
    }
    if (connecting) {
      setConnLine({ x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom });
    }
  }, [dragging, connecting, dragOff, zoom, pan]);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
    setDragging(null);
    setConnecting(null);
    setConnLine(null);
  }, []);

  // ── Canvas pan (middle mouse or space+drag) ──────────────────
  const handleCanvasMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    setSelected(null);
    setShowConfig(false);
  }, []);

  // ── Wheel zoom ───────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(2, Math.max(0.3, z * delta)));
  }, []);

  // ── Connect ─────────────────────────────────────────────────
  const handleConnectStart = useCallback((e, id) => {
    e.stopPropagation();
    setConnecting(id);
  }, []);

  const handleConnectEnd = useCallback((id) => {
    if (connecting && connecting !== id && !edges.some(([a, b]) => a === connecting && b === id)) {
      pushHistory(nodes, edges);
      setEdges((prev) => [...prev, [connecting, id]]);
    }
    setConnecting(null);
    setConnLine(null);
  }, [connecting, edges, nodes, pushHistory]);

  // ── Node operations ─────────────────────────────────────────
  const addNode = (type) => {
    pushHistory(nodes, edges);
    const id = uid();
    setNodes((prev) => [
      ...prev,
      {
        id,
        type,
        x: 200 + Math.random() * 300,
        y: 150 + Math.random() * 200,
        config: { name: NODE_TYPES[type].desc },
      },
    ]);
    setSelected(id);
  };

  const deleteSelected = () => {
    if (!selected) return;
    pushHistory(nodes, edges);
    setNodes((prev) => prev.filter((n) => n.id !== selected));
    setEdges((prev) => prev.filter(([a, b]) => a !== selected && b !== selected));
    setSelected(null);
    setShowConfig(false);
  };

  const deleteEdge = useCallback((from, to) => {
    pushHistory(nodes, edges);
    setEdges((prev) => prev.filter(([a, b]) => !(a === from && b === to)));
  }, [nodes, edges, pushHistory]);

  const updateNodeConfig = (nodeId, key, val) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, config: { ...n.config, [key]: val } } : n
      )
    );
  };

  // ── Template ────────────────────────────────────────────────
  const loadTemplate = (idx) => {
    const t = TEMPLATES[idx];
    clearHistory();
    setNodes(t.nodes.map((n) => ({ ...n })));
    setEdges(t.edges.map((e) => [...e]));
    setWorkflowName(t.name);
    setSelected(null);
    setShowConfig(false);
  };

  // ── Auto-register schedule after save ───────────────────────
  const syncSchedule = async (wfId, wfNodes) => {
    const scheduleTrigger = wfNodes.find(n => n.type === "trigger" && n.config?.triggerType === "schedule");
    if (!scheduleTrigger?.config?.cron) return;
    const token = localStorage.getItem("fa_token");
    const res = await fetch(`/api/workflows/${wfId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cron: scheduleTrigger.config.cron, enabled: true }),
    });
    const data = await res.json();
    if (!data.error) toast.success(`⏰ 스케줄 등록됨 (${scheduleTrigger.config.cron})`);
    else toast.error(`스케줄 등록 실패: ${data.error}`);
  };

  // ── Save / Load workflow ────────────────────────────────────
  const handleSave = async () => {
    const wf = await api.saveWorkflow(workflowName, nodes, edges);
    if (wf) {
      await api.fetchWorkflows();
      await syncSchedule(wf.id, nodes);
    }
  };

  const clearHistory = () => { setHistoryStack([]); setFutureStack([]); };

  const handleLoad = async (id) => {
    const wf = await api.loadWorkflow(id);
    if (wf) {
      clearHistory();
      setNodes(wf.nodes);
      setEdges(wf.edges);
      setWorkflowName(wf.name);
      setSelected(null);
      setShowConfig(false);
    }
  };

  const handleNew = () => {
    clearHistory();
    api.newWorkflow();
    setNodes([]);
    setEdges([]);
    setWorkflowName("Untitled Workflow");
    setSelected(null);
    setShowConfig(false);
  };

  // ── Schedule ─────────────────────────────────────────────────
  const handleSchedule = async ({ cron: cronExpr, enabled }) => {
    if (!api.currentId) { alert("먼저 워크플로우를 저장하세요"); return; }
    const token = localStorage.getItem("fa_token");
    const res = await fetch(`/api/workflows/${api.currentId}/schedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cron: cronExpr, enabled }),
    });
    const data = await res.json();
    if (data.error) alert(data.error);
    else alert(`스케줄 ${enabled ? "활성화" : "비활성화"} 완료`);
  };

  // ── Export / Import ─────────────────────────────────────────
  const handleExport = () => {
    const data = JSON.stringify({ name: workflowName, nodes, edges }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("워크플로우가 내보내졌습니다");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wf = JSON.parse(ev.target.result);
          if (!wf.nodes || !wf.edges) throw new Error("Invalid format");
          setNodes(wf.nodes);
          setEdges(wf.edges);
          setWorkflowName(wf.name || "Imported Workflow");
          api.newWorkflow();
          setSelected(null);
          setShowConfig(false);
          toast.success(`"${wf.name || "워크플로우"}"를 가져왔습니다`);
        } catch {
          toast.error("유효하지 않은 워크플로우 파일입니다");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // ── Delete workflow ──────────────────────────────────────────
  const handleDeleteWorkflow = async (id) => {
    await api.deleteWorkflow(id);
    if (api.currentId === id) handleNew();
    toast.success("워크플로우가 삭제됐습니다");
  };

  // ── Run ─────────────────────────────────────────────────────
  const handleRun = async () => {
    // Save first, then run via WebSocket
    const wf = await api.saveWorkflow(workflowName, nodes, edges);
    if (wf) {
      runWorkflow(wf.id);
      // Refresh run count after a short delay
      setTimeout(() => {
        const token = localStorage.getItem("fa_token");
        fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(data => { if (data.runCount !== undefined) setRunCount(data.runCount); })
          .catch(() => {});
      }, 2000);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selected);

  // ── Run with validation ──────────────────────────────────────
  const handleRunWithValidation = async () => {
    const hasTrigger = nodes.some(n => n.type === "trigger");
    if (!hasTrigger) { toast.error("트리거 노드가 없습니다. Trigger 노드를 추가하세요."); return; }
    if (nodes.length < 2) { toast.warn("노드가 너무 적습니다. 최소 2개 이상 연결하세요."); return; }
    if (edges.length === 0) { toast.warn("연결된 노드가 없습니다. 노드를 엣지로 연결하세요."); return; }

    // 노드별 필수 설정 검사
    for (const n of nodes) {
      if (n.type === "api_call" && !n.config?.url) {
        toast.warn(`"${n.config?.name || "API Call"}" 노드에 URL이 없습니다.`);
        setSelected(n.id); setShowConfig(true); return;
      }
      if (n.type === "ai_agent" && !n.config?.prompt) {
        toast.warn(`"${n.config?.name || "AI Agent"}" 노드에 프롬프트가 없습니다.`);
        setSelected(n.id); setShowConfig(true); return;
      }
      if (n.type === "rss_feed" && !n.config?.url) {
        toast.warn(`"${n.config?.name || "RSS Feed"}" 노드에 RSS URL이 없습니다.`);
        setSelected(n.id); setShowConfig(true); return;
      }
    }
    await handleRun();
  };

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const isInput = (e) => ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
    const onDown = (e) => {
      if (e.code === "Space" && !isInput(e)) {
        spaceDown.current = true;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !isInput(e)) {
        deleteSelected();
      }
      // Ctrl+Z: 실행 취소
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey && !isInput(e)) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z / Ctrl+Y: 다시 실행
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey)) && !isInput(e)) {
        e.preventDefault();
        redo();
      }
      // Ctrl+C: 노드 복사
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selected && !isInput(e)) {
        const n = nodes.find(nd => nd.id === selected);
        if (n) { setClipboard(n); toast.success("노드가 복사됐습니다"); }
      }
      // Ctrl+V: 노드 붙여넣기
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && clipboard && !isInput(e)) {
        e.preventDefault();
        pushHistory(nodes, edges);
        const newId = uid();
        const newNode = { ...clipboard, id: newId, x: clipboard.x + 50, y: clipboard.y + 50,
          config: { ...clipboard.config, name: (clipboard.config?.name || "") + " (복사)" } };
        setNodes(prev => [...prev, newNode]);
        setSelected(newId);
      }
      // Ctrl+D: 선택 노드 복제 (붙여넣기 없이 바로)
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selected && !isInput(e)) {
        e.preventDefault();
        const n = nodes.find(nd => nd.id === selected);
        if (n) {
          pushHistory(nodes, edges);
          const newId = uid();
          const newNode = { ...n, id: newId, x: n.x + 50, y: n.y + 50,
            config: { ...n.config, name: (n.config?.name || "") + " (복사)" } };
          setNodes(prev => [...prev, newNode]);
          setSelected(newId);
        }
      }
      // Ctrl+S: 저장
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+Enter: 실행
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!runState.running) handleRunWithValidation();
      }
      // Escape: 선택 해제 / 모달 닫기
      if (e.key === "Escape") {
        setSelected(null);
        setShowConfig(false);
        setShowShortcuts(false);
      }
      // ?: 단축키 안내
      if (e.key === "?" && !isInput(e)) {
        setShowShortcuts(v => !v);
      }
    };
    const onUp = (e) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [selected, runState.running, nodes, edges, clipboard, undo, redo, pushHistory]); // eslint-disable-line

  if (!user) return <LandingPage />;

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", overflow: "hidden" }}>
      <ToastContainer />
      {showSettings && <SettingsModal user={user} onClose={() => setShowSettings(false)} />}
      {showCalendar && <CalendarModal onClose={() => setShowCalendar(false)} />}
      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}
      {showChat && <ChatModal onClose={() => setShowChat(false)} onCreateWorkflow={(wf) => {
        setNodes(wf.nodes);
        setEdges(wf.edges);
        setWorkflowName(wf.name);
        api.newWorkflow();
        setShowChat(false);
        toast.success(`"${wf.name}" 워크플로우가 생성됐습니다!`);
      }} />}
      {showOnboarding && <OnboardingOverlay onClose={() => { localStorage.setItem("fa_onboarded", "1"); setShowOnboarding(false); }} />}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
      {/* Sidebar */}
      <Sidebar
        onAddNode={addNode}
        onLoadTemplate={loadTemplate}
        onRun={handleRunWithValidation}
        running={runState.running}
        workflows={api.workflows}
        onLoadWorkflow={handleLoad}
        onNewWorkflow={handleNew}
        onSave={handleSave}
        saving={api.saving}
        connected={connected}
        onSchedule={handleSchedule}
        currentWorkflowId={api.currentId}
        nodes={nodes}
        onDuplicateWorkflow={api.duplicateWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
      />

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{
          height: 44, background: "#111128", borderBottom: "1px solid #222244",
          display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0,
        }}>
          <input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            style={{
              background: "none", border: "none", color: "#E0E0F0",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              outline: "none", width: 220,
            }}
          />
          <span style={{ fontSize: 11, color: "#444" }}>|</span>
          <span style={{ fontSize: 11, color: "#666" }}>노드 {nodes.length}</span>
          <span style={{ fontSize: 11, color: "#444" }}>·</span>
          <span style={{ fontSize: 11, color: "#666" }}>연결 {edges.length}</span>
          {api.saving && <span style={{ fontSize: 10, color: "#8B5CF6" }}>저장 중...</span>}
          {!api.saving && api.autoSaved && (
            <span style={{ fontSize: 10, color: "#444" }} title={`자동저장: ${api.autoSaved.toLocaleTimeString()}`}>
              ✓ 자동저장됨
            </span>
          )}
          <div style={{ flex: 1 }} />
          {/* Undo / Redo */}
          <button
            onClick={undo}
            disabled={historyStack.length === 0}
            title={`실행 취소 (Ctrl+Z) — ${historyStack.length}스텝`}
            style={{
              padding: "4px 8px", background: "none",
              border: `1px solid ${historyStack.length ? "#333" : "#1A1A2E"}`,
              borderRadius: 5, color: historyStack.length ? "#888" : "#333",
              fontSize: 12, cursor: historyStack.length ? "pointer" : "not-allowed",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
          >↩</button>
          <button
            onClick={redo}
            disabled={futureStack.length === 0}
            title={`다시 실행 (Ctrl+Y) — ${futureStack.length}스텝`}
            style={{
              padding: "4px 8px", background: "none",
              border: `1px solid ${futureStack.length ? "#333" : "#1A1A2E"}`,
              borderRadius: 5, color: futureStack.length ? "#888" : "#333",
              fontSize: 12, cursor: futureStack.length ? "pointer" : "not-allowed",
              fontFamily: "inherit", transition: "all 0.15s",
            }}
          >↪</button>
          <span style={{ fontSize: 11, color: "#555" }}>{user.email}</span>
          <span style={{ fontSize: 11, color: user.plan === "free" ? "#F59E0B" : "#8B5CF6" }}>
            {user.plan === "free" ? "Free" : "Pro"}
          </span>
          {user.plan === "free" && runCount !== null && (
            <span title="이번 달 실행 횟수 (무료 플랜: 100회 제한)" style={{
              fontSize: 10, color: runCount >= 80 ? "#EF4444" : "#666",
              background: "#1A1A2E", border: `1px solid ${runCount >= 80 ? "#EF444444" : "#333"}`,
              borderRadius: 4, padding: "2px 6px",
            }}>
              {runCount}/100 실행
            </span>
          )}
          <button onClick={handleImport} style={{
            padding: "4px 10px", background: "none", border: "1px solid #333",
            borderRadius: 5, color: "#888", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            📥 가져오기
          </button>
          <button onClick={handleExport} style={{
            padding: "4px 10px", background: "none", border: "1px solid #333",
            borderRadius: 5, color: "#888", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            📤 내보내기
          </button>
          <button onClick={() => setShowChat(true)} style={{
            padding: "4px 10px",
            background: "linear-gradient(135deg, #8B5CF622, #6D28D922)",
            border: "1px solid #8B5CF655",
            borderRadius: 5, color: "#C4B5FD", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            🤖 AI 비서
          </button>
          <button onClick={() => setShowHistory(true)} style={{
            padding: "4px 10px", background: "none", border: "1px solid #333",
            borderRadius: 5, color: "#888", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            📋 히스토리
          </button>
          <button onClick={() => setShowCalendar(true)} style={{
            padding: "4px 10px", background: "none", border: "1px solid #333",
            borderRadius: 5, color: "#888", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            📅 일정
          </button>
          <button onClick={() => setShowSettings(true)} style={{
            padding: "4px 10px", background: "none", border: "1px solid #333",
            borderRadius: 5, color: "#888", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            ⚙ 설정
          </button>
          <button onClick={() => setShowShortcuts(true)} title="키보드 단축키 (?)키" style={{
            padding: "4px 8px", background: "none", border: "1px solid #333",
            borderRadius: 5, color: "#555", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            ?
          </button>
          <button onClick={logout} style={{
            padding: "4px 10px", background: "none", border: "1px solid #333",
            borderRadius: 5, color: "#666", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            로그아웃
          </button>
          {selected && (
            <>
              <button
                onClick={() => setShowConfig(!showConfig)}
                style={{
                  padding: "5px 12px", background: "#1A1A2E", border: "1px solid #444",
                  borderRadius: 6, color: "#E0E0F0", fontSize: 11, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ⚙ 설정
              </button>
              <button
                onClick={deleteSelected}
                style={{
                  padding: "5px 12px", background: "#2D1A1A", border: "1px solid #EF444466",
                  borderRadius: 6, color: "#EF4444", fontSize: 11, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ✕ 삭제
              </button>
            </>
          )}
        </div>

        {/* Canvas + Config */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Canvas */}
          <div
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseDown={handleCanvasMouseDown}
            onWheel={handleWheel}
            style={{
              flex: 1, position: "relative", overflow: "hidden",
              backgroundImage: "radial-gradient(circle, #222244 1px, transparent 1px)",
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${pan.x % (24 * zoom)}px ${pan.y % (24 * zoom)}px`,
              cursor: spaceDown.current ? "grab" : "default",
            }}
          >
            {/* Zoom indicator */}
            {zoom !== 1 && (
              <div style={{
                position: "absolute", bottom: 8, right: 8, zIndex: 10,
                background: "#1A1A2E", border: "1px solid #333", borderRadius: 6,
                padding: "3px 8px", fontSize: 10, color: "#666",
              }}>
                {Math.round(zoom * 100)}%
                <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={{
                  background: "none", border: "none", color: "#555", cursor: "pointer",
                  fontSize: 10, marginLeft: 6, fontFamily: "inherit", padding: 0,
                }}>리셋</button>
              </div>
            )}

            {/* Transformed content */}
            <div style={{
              position: "absolute", inset: 0,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}>
              {/* SVG edges */}
              <svg style={{ position: "absolute", inset: 0, width: "9999px", height: "9999px", pointerEvents: "none", overflow: "visible" }}>
                {edges.map(([a, b]) => (
                  <EdgeLine
                    key={`${a}-${b}`}
                    from={a}
                    to={b}
                    nodes={nodes}
                    animated={runState.current && (runState.done.has(a) || runState.current === a)}
                    onDelete={deleteEdge}
                  />
                ))}
                {connecting && connLine && (() => {
                  const n = nodes.find((nd) => nd.id === connecting);
                  if (!n) return null;
                  return (
                    <line
                      x1={n.x + 227} y1={n.y + 45}
                      x2={connLine.x} y2={connLine.y}
                      stroke="#8B5CF6" strokeWidth={2}
                      strokeDasharray="6 3" opacity={0.6}
                    />
                  );
                })()}
              </svg>

              {/* Nodes */}
              {nodes.map((n) => (
                <NodeCard
                  key={n.id}
                  node={n}
                  selected={selected === n.id}
                  onSelect={setSelected}
                  onDragStart={handleDragStart}
                  onConnectStart={handleConnectStart}
                  onConnectEnd={handleConnectEnd}
                  running={runState.current === n.id}
                  done={runState.done.has(n.id)}
                  error={runState.errors?.has(n.id)}
                />
              ))}
            </div>

            {/* Empty state (outside transform) */}
            {nodes.length === 0 && (
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)", textAlign: "center", color: "#444",
                pointerEvents: "none",
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>◆</div>
                <div style={{ fontSize: 14, marginBottom: 6 }}>워크플로우가 비어있습니다</div>
                <div style={{ fontSize: 11, color: "#333" }}>왼쪽에서 노드를 추가하거나 템플릿을 불러오세요</div>
              </div>
            )}
          </div>

          {/* Config panel */}
          {showConfig && selectedNode && (
            <ConfigPanel
              node={selectedNode}
              onUpdate={updateNodeConfig}
              onClose={() => setShowConfig(false)}
              workflowId={api.currentId}
            />
          )}
        </div>

        {/* Logs */}
        <LogPanel logs={logs} onClear={clearLogs} />
      </div>
    </div>
  );
}

function OnboardingOverlay({ onClose }) {
  const steps = [
    { icon: "➕", title: "노드 추가", desc: "왼쪽 사이드바에서 노드를 드래그하거나 클릭해 캔버스에 추가하세요." },
    { icon: "🔗", title: "노드 연결", desc: "노드 오른쪽 점을 드래그해 다른 노드와 연결하면 실행 흐름이 만들어집니다." },
    { icon: "⚙", title: "노드 설정", desc: "노드를 클릭하면 상단에 '설정' 버튼이 나타납니다. URL, 프롬프트 등을 입력하세요." },
    { icon: "▶", title: "실행", desc: "사이드바 하단 '▶ 실행' 버튼을 누르면 워크플로우가 실행되고 로그가 표시됩니다." },
    { icon: "📅", title: "일정 & 알림", desc: "상단 '일정' 버튼으로 리마인더를 추가하고 텔레그램/슬랙/디코로 알림을 받으세요." },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 2000, padding: 24,
    }}>
      <div style={{
        background: "#111128", border: "1px solid #8B5CF644",
        borderRadius: 20, width: "100%", maxWidth: 520, padding: 32,
      }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>FlowAgent에 오신 걸 환영해요!</div>
          <div style={{ fontSize: 13, color: "#666" }}>AI 워크플로우를 5분 만에 만들어보세요.</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "12px 14px", background: "#0D0D22", borderRadius: 10,
              border: "1px solid #1A1A3A",
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{
          width: "100%", padding: "14px 0",
          background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
          border: "none", borderRadius: 10, color: "#fff",
          fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>
          시작하기 →
        </button>
      </div>
    </div>
  );
}

function ShortcutsOverlay({ onClose }) {
  const shortcuts = [
    { key: "Ctrl + Z", desc: "실행 취소 (Undo)" },
    { key: "Ctrl + Y / Ctrl+Shift+Z", desc: "다시 실행 (Redo)" },
    { key: "Ctrl + C", desc: "선택한 노드 복사" },
    { key: "Ctrl + V", desc: "복사한 노드 붙여넣기" },
    { key: "Ctrl + D", desc: "선택한 노드 즉시 복제" },
    { key: "Ctrl + S", desc: "워크플로우 저장" },
    { key: "Ctrl + Enter", desc: "워크플로우 실행" },
    { key: "Delete / Backspace", desc: "선택한 노드 삭제" },
    { key: "Space + 드래그", desc: "캔버스 패닝" },
    { key: "Ctrl + 스크롤", desc: "줌 인/아웃" },
    { key: "Esc", desc: "선택 해제 / 모달 닫기" },
    { key: "?", desc: "이 단축키 안내 열기/닫기" },
    { key: "엣지 호버 → ✕", desc: "연결선 삭제" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 2000, padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: "#111128", border: "1px solid #8B5CF644",
        borderRadius: 16, width: "100%", maxWidth: 420, padding: "24px 28px",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>⌨ 키보드 단축키</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shortcuts.map((s, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 12px", background: "#0D0D22", borderRadius: 8,
            }}>
              <span style={{
                fontFamily: "monospace", fontSize: 11, color: "#C4B5FD",
                background: "#1A1A3A", padding: "2px 8px", borderRadius: 4, border: "1px solid #333",
              }}>{s.key}</span>
              <span style={{ fontSize: 12, color: "#888" }}>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
