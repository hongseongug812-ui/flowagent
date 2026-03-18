import { useState, useCallback } from "react";
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

  const saveWorkflow = useCallback(async (name, nodes, edges) => {
    setSaving(true);
    try {
      const url = currentId ? `${API_BASE}/workflows/${currentId}` : `${API_BASE}/workflows`;
      const method = currentId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ name, nodes, edges }),
      });
      const data = await res.json();
      if (!currentId) setCurrentId(data.id);
      toast.success("저장됐습니다");
      return data;
    } catch { toast.error("저장 실패"); return null; }
    finally { setSaving(false); }
  }, [currentId]);

  const deleteWorkflow = useCallback(async (id) => {
    try {
      await fetch(`${API_BASE}/workflows/${id}`, { method: "DELETE", headers: authHeaders() });
      if (currentId === id) setCurrentId(null);
      await fetchWorkflows();
    } catch {}
  }, [currentId, fetchWorkflows]);

  const newWorkflow = useCallback(() => setCurrentId(null), []);

  return { workflows, currentId, saving, fetchWorkflows, loadWorkflow, saveWorkflow, deleteWorkflow, newWorkflow };
}
