import { useState, useRef, useCallback, useEffect } from "react";
import { WS_URL } from "../utils/constants";

export function useWebSocket() {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [runState, setRunState] = useState({ running: false, current: null, done: new Set(), executionId: null });
  const [logs, setLogs] = useState([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
      // 연결 후 토큰으로 인증
      const token = localStorage.getItem("fa_token");
      if (token) ws.send(JSON.stringify({ type: "auth", token }));
    };

    ws.onclose = () => {
      setConnected(false);
      setAuthed(false);
      setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "auth:ok":
          setAuthed(true);
          break;
        case "execution:start":
          setRunState({ running: true, current: null, done: new Set(), executionId: msg.executionId });
          setLogs([{ time: new Date().toLocaleTimeString(), msg: `━━ ${msg.workflowName} 실행 시작 ━━`, color: "#8B5CF6" }]);
          break;
        case "node:start":
          setRunState(prev => ({ ...prev, current: msg.nodeId }));
          break;
        case "node:done":
          setRunState(prev => ({ ...prev, done: new Set([...prev.done, msg.nodeId]) }));
          break;
        case "node:error":
          setRunState(prev => ({ ...prev, current: null, done: new Set([...prev.done, msg.nodeId]) }));
          break;
        case "log":
          setLogs(prev => [...prev, {
            time: new Date(msg.time).toLocaleTimeString(),
            msg: msg.msg,
            color: msg.msg.startsWith("✓") ? "#4ade80" : msg.msg.startsWith("✗") ? "#EF4444" : "#888",
          }]);
          break;
        case "execution:complete":
          setRunState(prev => ({ ...prev, running: false, current: null }));
          setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: `━━ 완료 (${msg.duration}ms, ${msg.nodeCount}개 노드) ━━`, color: "#F59E0B" }]);
          break;
        case "execution:error":
          setRunState(prev => ({ ...prev, running: false, current: null }));
          setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: `━━ 실행 실패: ${msg.error} ━━`, color: "#EF4444" }]);
          break;
        default: break;
      }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  const runWorkflow = useCallback((workflowId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "workflow:run", workflowId }));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { connected, authed, runState, logs, runWorkflow, clearLogs };
}
