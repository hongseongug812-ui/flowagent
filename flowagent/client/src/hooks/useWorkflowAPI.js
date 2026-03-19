import { useState, useCallback, useRef } from "react";
import { API_BASE } from "../utils/constants";
import { toast } from "../utils/toast";

function authHeaders() {
  const token = localStorage.getItem("fa_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function useWorkflowAPI() {
  const [workflows, setWorkflows] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(null); // timestamp of last auto-save
  const autoSaveTimer = useRef(null);
  const currentIdRef = useRef(null);
  currentIdRef.current = currentId;

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/workflows`, { headers: authHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      setWorkflows(data);
      return data;
    } catch { return []; }
  }, []);

  const loadWorkflow = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/workflows/${id}`, { headers: authHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      setCurrentId(id);
      return data;
    } catch { return null; }
  }, []);

  const saveWorkflow = useCallback(async (name, nodes, edges, silent = false) => {
    setSaving(true);
    try {
      const id = currentIdRef.current;
      const url = id ? `${API_BASE}/workflows/${id}` : `${API_BASE}/workflows`;
      const method = id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ name, nodes, edges }),
      });
      const data = await res.json();
      if (!id) setCurrentId(data.id);
      if (!silent) toast.success("저장됐습니다");
      else setAutoSaved(new Date());
      return data;
    } catch { if (!silent) toast.error("저장 실패"); return null; }
    finally { setSaving(false); }
  }, []);

  // Auto-save with 3s debounce
  const scheduleAutoSave = useCallback((name, nodes, edges) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (!currentIdRef.current) return; // 저장된 워크플로우만 자동저장
      await saveWorkflow(name, nodes, edges, true);
    }, 3000);
  }, [saveWorkflow]);

  const deleteWorkflow = useCallback(async (id) => {
    try {
      await fetch(`${API_BASE}/workflows/${id}`, { method: "DELETE", headers: authHeaders() });
      if (currentId === id) setCurrentId(null);
      await fetchWorkflows();
    } catch {}
  }, [currentId, fetchWorkflows]);

  const newWorkflow = useCallback(() => setCurrentId(null), []);

  const duplicateWorkflow = useCallback(async (id) => {
    try {
      const token = localStorage.getItem("fa_token");
      const res = await fetch(`${API_BASE}/workflows/${id}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      toast.success("워크플로우가 복제됐습니다");
      await fetchWorkflows();
    } catch { toast.error("복제 실패"); }
  }, [fetchWorkflows]);

  return { workflows, currentId, saving, autoSaved, fetchWorkflows, loadWorkflow, saveWorkflow, scheduleAutoSave, deleteWorkflow, newWorkflow, duplicateWorkflow };
}
