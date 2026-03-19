import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

const inputStyle = {
  width: "100%", padding: "11px 14px", background: "#0A0A1A",
  border: "1px solid #222244", borderRadius: 8, color: "#E0E0F0",
  fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
  transition: "border-color 0.2s",
};

function AuthPanel() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
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
      background: "#111128", border: "1px solid #222244", borderRadius: 16,
      padding: "28px 32px", width: 360, boxShadow: "0 24px 80px #0008",
      flexShrink: 0,
    }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 22, color: "#8B5CF6", fontWeight: 900, marginBottom: 4 }}>◆ FlowAgent</div>
        <div style={{ fontSize: 12, color: "#555" }}>AI 워크플로우 자동화 플랫폼</div>
      </div>

      <div style={{ display: "flex", marginBottom: 20, background: "#0A0A1A", borderRadius: 8, padding: 4, gap: 2 }}>
        {["login", "register"].map(m => (
          <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
            flex: 1, padding: "8px 0",
            background: mode === m ? "#1A1A3E" : "none",
            border: mode === m ? "1px solid #333" : "1px solid transparent",
            borderRadius: 6, color: mode === m ? "#E0E0F0" : "#555",
            fontSize: 12, fontWeight: mode === m ? 700 : 400,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
          }}>
            {m === "login" ? "로그인" : "무료 시작"}
          </button>
        ))}
      </div>

      <form onSubmit={handle}>
        <div style={{ marginBottom: 10 }}>
          <input
            type="email" placeholder="이메일" value={email}
            onChange={e => setEmail(e.target.value)} required
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = "#8B5CF6"}
            onBlur={e => e.target.style.borderColor = "#222244"}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <input
            type="password" placeholder="비밀번호 (6자 이상)" value={password}
            onChange={e => setPassword(e.target.value)} required minLength={6}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = "#8B5CF6"}
            onBlur={e => e.target.style.borderColor = "#222244"}
          />
        </div>

        {error && (
          <div style={{
            marginBottom: 12, padding: "9px 12px",
            background: "#2D1A1A", border: "1px solid #EF444455",
            borderRadius: 6, color: "#EF4444", fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "12px 0",
          background: loading ? "#444" : "linear-gradient(135deg, #8B5CF6, #6D28D9)",
          border: "none", borderRadius: 8, color: "#fff", fontSize: 14,
          fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "inherit", transition: "opacity 0.2s",
          boxShadow: loading ? "none" : "0 4px 20px #8B5CF655",
        }}>
          {loading ? "처리 중..." : mode === "login" ? "로그인" : "무료로 시작하기 →"}
        </button>
      </form>

      {mode === "register" && (
        <div style={{ marginTop: 14, fontSize: 11, color: "#444", textAlign: "center", lineHeight: 1.6 }}>
          신용카드 불필요 · 무료 플랜: 월 100회 실행<br />
          <span style={{ color: "#333" }}>가입하면 이용약관에 동의하는 것으로 간주됩니다</span>
        </div>
      )}
    </div>
  );
}

const FEATURES = [
  { icon: "🔗", title: "드래그 & 드롭 빌더", desc: "코드 없이 노드를 연결해 복잡한 자동화를 만드세요" },
  { icon: "🤖", title: "AI 네이티브", desc: "GPT-4o / Claude 노드를 바로 연결. AI가 워크플로우도 자동 생성" },
  { icon: "⚡", title: "실시간 실행", desc: "WebSocket 기반 실시간 진행 상황 · 노드별 결과 확인" },
  { icon: "📅", title: "스케줄 & 웹훅", desc: "Cron 스케줄 또는 외부 웹훅으로 자동 트리거" },
  { icon: "🔌", title: "다양한 인테그레이션", desc: "Slack, Discord, Telegram, Notion, Email, RSS 지원" },
  { icon: "📊", title: "실행 히스토리 & 통계", desc: "모든 실행 기록과 성공률, 소요시간 통계 제공" },
];

const STEPS = [
  { n: "1", title: "노드 추가", desc: "사이드바에서 Trigger, AI Agent, API Call 등 노드를 캔버스에 추가" },
  { n: "2", title: "연결", desc: "노드 우측 점을 드래그해 실행 흐름 연결" },
  { n: "3", title: "설정 & 실행", desc: "노드 클릭 → 설정 → ▶ 실행. 결과가 실시간으로 표시됩니다" },
];

export default function LandingPage() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState(null);
  const [waitlistCount, setWaitlistCount] = useState(null);

  useEffect(() => {
    fetch("/api/waitlist/count").then(r => r.json()).then(d => setWaitlistCount(d.count)).catch(() => {});
  }, []);

  const handleWaitlist = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: waitlistEmail }),
      });
      const data = await res.json();
      if (data.alreadyExists) setWaitlistStatus("already");
      else { setWaitlistStatus("ok"); setWaitlistCount(data.count); }
    } catch { setWaitlistStatus("error"); }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#080814",
      color: "#E0E0F0", fontFamily: "inherit",
      overflowX: "hidden",
    }}>
      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 48px", borderBottom: "1px solid #111133",
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(8,8,20,0.9)", backdropFilter: "blur(12px)",
      }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#8B5CF6" }}>◆ FlowAgent</div>
        <div style={{ fontSize: 12, color: "#555" }}>AI Workflow Automation</div>
      </nav>

      {/* Hero */}
      <section style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 64, padding: "80px 48px", maxWidth: 1100, margin: "0 auto",
        flexWrap: "wrap",
      }}>
        {/* Left */}
        <div style={{ flex: 1, minWidth: 300, maxWidth: 560 }}>
          <div style={{
            display: "inline-block", fontSize: 11, fontWeight: 700,
            background: "#8B5CF622", border: "1px solid #8B5CF644",
            color: "#C4B5FD", padding: "4px 12px", borderRadius: 20, marginBottom: 20,
            letterSpacing: 1,
          }}>
            AI-POWERED WORKFLOW BUILDER
          </div>
          <h1 style={{
            fontSize: 46, fontWeight: 900, lineHeight: 1.15,
            marginBottom: 20, letterSpacing: -1,
          }}>
            코드 없이<br />
            <span style={{ background: "linear-gradient(135deg, #8B5CF6, #EC4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              AI 워크플로우
            </span>를<br />
            자동화하세요
          </h1>
          <p style={{ fontSize: 16, color: "#888", lineHeight: 1.7, marginBottom: 36 }}>
            드래그 & 드롭으로 AI 에이전트, API, 메시지 봇을<br />
            연결해 반복 작업을 완전 자동화합니다.
          </p>

          {/* Steps */}
          <div style={{ display: "flex", gap: 20, marginBottom: 36, flexWrap: "wrap" }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 900,
                }}>{s.n}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: "#555", maxWidth: 140, lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Waitlist */}
          {waitlistStatus === "ok" ? (
            <div style={{
              padding: "14px 20px", background: "#0D1F0D",
              border: "1px solid #4ADE8044", borderRadius: 12,
              color: "#4ADE80", fontSize: 13, fontWeight: 600,
            }}>
              ✓ 등록됐습니다! 출시 소식을 이메일로 알려드릴게요.
              {waitlistCount && <span style={{ color: "#555", fontWeight: 400 }}> ({waitlistCount.toLocaleString()}명 대기 중)</span>}
            </div>
          ) : (
            <form onSubmit={handleWaitlist} style={{ display: "flex", gap: 8, maxWidth: 420 }}>
              <input
                type="email" placeholder="이메일로 출시 소식 받기"
                value={waitlistEmail} onChange={e => setWaitlistEmail(e.target.value)} required
                style={{ ...inputStyle, flex: 1, borderRadius: 10 }}
                onFocus={e => e.target.style.borderColor = "#8B5CF6"}
                onBlur={e => e.target.style.borderColor = "#222244"}
              />
              <button type="submit" style={{
                padding: "11px 20px", background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                border: "none", borderRadius: 10, color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                알림 받기
              </button>
            </form>
          )}
          {waitlistCount !== null && waitlistStatus !== "ok" && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#444" }}>
              이미 {waitlistCount.toLocaleString()}명이 대기 중
            </div>
          )}
        </div>

        {/* Auth panel */}
        <AuthPanel />
      </section>

      {/* Features */}
      <section style={{ background: "#0A0A18", borderTop: "1px solid #111133", borderBottom: "1px solid #111133", padding: "64px 48px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 28, fontWeight: 800, marginBottom: 48, letterSpacing: -0.5 }}>
            모든 것이 연결됩니다
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{
                padding: "20px 22px", background: "#111128",
                border: "1px solid #1A1A3A", borderRadius: 14,
                transition: "border-color 0.2s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#8B5CF655"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#1A1A3A"}
              >
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: "64px 48px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 28, fontWeight: 800, marginBottom: 48, letterSpacing: -0.5 }}>
            심플한 요금제
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {[
              {
                name: "Free", price: "무료", color: "#888",
                features: ["월 100회 실행", "무제한 워크플로우", "AI 비서 채팅", "기본 인테그레이션"],
              },
              {
                name: "Pro", price: "₩19,900/월", color: "#8B5CF6", badge: "인기",
                features: ["무제한 실행", "우선 실행 처리", "고급 인테그레이션", "스케줄 실행 무제한", "이메일 지원"],
              },
            ].map((plan, i) => (
              <div key={i} style={{
                padding: "28px 24px", background: "#111128",
                border: `1px solid ${plan.color}44`,
                borderRadius: 16, position: "relative",
                boxShadow: i === 1 ? `0 0 30px ${plan.color}22` : "none",
              }}>
                {plan.badge && (
                  <div style={{
                    position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                    background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                    color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 12px",
                    borderRadius: 20, letterSpacing: 1,
                  }}>{plan.badge}</div>
                )}
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, color: plan.color }}>{plan.name}</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 20 }}>{plan.price}</div>
                {plan.features.map((f, j) => (
                  <div key={j} style={{ fontSize: 12, color: "#888", marginBottom: 8, display: "flex", gap: 8 }}>
                    <span style={{ color: plan.color }}>✓</span> {f}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid #111133", padding: "24px 48px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#8B5CF6" }}>◆ FlowAgent</div>
        <div style={{ fontSize: 11, color: "#444" }}>© 2026 FlowAgent. All rights reserved.</div>
      </footer>
    </div>
  );
}
