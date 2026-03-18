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
import AuthModal from "./components/AuthModal";
import SettingsModal from "./components/SettingsModal";

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
  const [dragging, setDragging] = useState(null);
  const [dragOff, setDragOff] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState(null);
  const [connLine, setConnLine] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");

  const canvasRef = useRef(null);

  const { connected, runState, logs, runWorkflow, clearLogs } = useWebSocket();
  const api = useWorkflowAPI();

  // Load saved workflows on mount
  useEffect(() => {
    if (user) api.fetchWorkflows();
  }, [user]); // eslint-disable-line

  // ── Drag ────────────────────────────────────────────────────
  const handleDragStart = useCallback((e, id) => {
    const n = nodes.find((n) => n.id === id);
    if (!n) return;
    setDragging(id);
    const rect = canvasRef.current.getBoundingClientRect();
    setDragOff({ x: e.clientX - rect.left - n.x, y: e.clientY - rect.top - n.y });
  }, [nodes]);

  const handleMouseMove = useCallback((e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (dragging) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === dragging
            ? { ...n, x: e.clientX - rect.left - dragOff.x, y: e.clientY - rect.top - dragOff.y }
            : n
        )
      );
    }
    if (connecting) {
      setConnLine({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [dragging, connecting, dragOff]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setConnecting(null);
    setConnLine(null);
  }, []);

  // ── Connect ─────────────────────────────────────────────────
  const handleConnectStart = useCallback((e, id) => {
    e.stopPropagation();
    setConnecting(id);
  }, []);

  const handleConnectEnd = useCallback((id) => {
    if (connecting && connecting !== id && !edges.some(([a, b]) => a === connecting && b === id)) {
      setEdges((prev) => [...prev, [connecting, id]]);
    }
    setConnecting(null);
    setConnLine(null);
  }, [connecting, edges]);

  // ── Node operations ─────────────────────────────────────────
  const addNode = (type) => {
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
    setNodes((prev) => prev.filter((n) => n.id !== selected));
    setEdges((prev) => prev.filter(([a, b]) => a !== selected && b !== selected));
    setSelected(null);
    setShowConfig(false);
  };

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
    setNodes(t.nodes.map((n) => ({ ...n })));
    setEdges(t.edges.map((e) => [...e]));
    setWorkflowName(t.name);
    setSelected(null);
    setShowConfig(false);
  };

  // ── Save / Load workflow ────────────────────────────────────
  const handleSave = async () => {
    const wf = await api.saveWorkflow(workflowName, nodes, edges);
    if (wf) {
      await api.fetchWorkflows();
    }
  };

  const handleLoad = async (id) => {
    const wf = await api.loadWorkflow(id);
    if (wf) {
      setNodes(wf.nodes);
      setEdges(wf.edges);
      setWorkflowName(wf.name);
      setSelected(null);
      setShowConfig(false);
    }
  };

  const handleNew = () => {
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

  // ── Run ─────────────────────────────────────────────────────
  const handleRun = async () => {
    // Save first, then run via WebSocket
    const wf = await api.saveWorkflow(workflowName, nodes, edges);
    if (wf) {
      runWorkflow(wf.id);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selected);

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const handler = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        // Don't delete if user is typing in an input
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]); // eslint-disable-line

  if (!user) return <AuthModal />;

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", overflow: "hidden" }}>
      {showSettings && <SettingsModal user={user} onClose={() => setShowSettings(false)} />}
      {/* Sidebar */}
      <Sidebar
        onAddNode={addNode}
        onLoadTemplate={loadTemplate}
        onRun={handleRun}
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
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "#555" }}>{user.email}</span>
          <span style={{ fontSize: 11, color: user.plan === "free" ? "#F59E0B" : "#8B5CF6" }}>
            {user.plan === "free" ? "Free" : "Pro"}
          </span>
          <button onClick={() => setShowSettings(true)} style={{
            padding: "4px 10px", background: "none", border: "1px solid #333",
            borderRadius: 5, color: "#888", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            ⚙ 설정
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
            onMouseDown={() => { setSelected(null); setShowConfig(false); }}
            style={{
              flex: 1, position: "relative", overflow: "hidden",
              backgroundImage: "radial-gradient(circle, #222244 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          >
            {/* SVG edges */}
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              {edges.map(([a, b], i) => (
                <EdgeLine
                  key={`${a}-${b}`}
                  from={a}
                  to={b}
                  nodes={nodes}
                  animated={runState.current && (runState.done.has(a) || runState.current === a)}
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
              />
            ))}

            {/* Empty state */}
            {nodes.length === 0 && (
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)", textAlign: "center", color: "#444",
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
            />
          )}
        </div>

        {/* Logs */}
        <LogPanel logs={logs} onClear={clearLogs} />
      </div>
    </div>
  );
}
