import React, { useState } from "react";
import { useAuth } from "../hooks/useAuth";

export default function AuthModal() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div style={{
        background: "#111128", border: "1px solid #222244", borderRadius: 12,
        padding: 32, width: 360, boxShadow: "0 20px 60px #000a",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 28, color: "#8B5CF6", fontWeight: 900 }}>◆ FlowAgent</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>AI 워크플로우 자동화</div>
        </div>

        {/* Tab */}
        <div style={{ display: "flex", marginBottom: 24, background: "#0a0a1a", borderRadius: 8, padding: 4 }}>
          {["login", "register"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: "8px 0", background: mode === m ? "#1a1a3e" : "none",
              border: mode === m ? "1px solid #333" : "1px solid transparent",
              borderRadius: 6, color: mode === m ? "#E0E0F0" : "#666",
              fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}>
              {m === "login" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>

        <form onSubmit={handle}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="email" placeholder="이메일" value={email}
              onChange={e => setEmail(e.target.value)} required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <input
              type="password" placeholder="비밀번호 (6자 이상)" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={6}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 12, padding: "8px 12px", background: "#2D1A1A", border: "1px solid #EF444466", borderRadius: 6, color: "#EF4444", fontSize: 12 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px 0", background: "#8B5CF6",
            border: "none", borderRadius: 8, color: "#fff", fontSize: 14,
            fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit", opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "처리 중..." : mode === "login" ? "로그인" : "시작하기"}
          </button>
        </form>

        {mode === "register" && (
          <div style={{ marginTop: 12, fontSize: 11, color: "#444", textAlign: "center" }}>
            무료 플랜: 월 100회 실행
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", background: "#0a0a1a",
  border: "1px solid #222244", borderRadius: 8, color: "#E0E0F0",
  fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
