import React, { useState, useEffect, useCallback } from "react";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getToken() { return localStorage.getItem("fa_token"); }

export default function CalendarModal({ onClose }) {
  const [today] = useState(new Date());
  const [current, setCurrent] = useState(new Date());
  const [reminders, setReminders] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addDate, setAddDate] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [newPlatform, setNewPlatform] = useState("none");

  const load = useCallback(async () => {
    const h = { Authorization: `Bearer ${getToken()}` };
    const [r, s] = await Promise.all([
      fetch("/api/reminders", { headers: h }).then(r => r.json()),
      fetch("/api/schedules", { headers: h }).then(r => r.json()).catch(() => []),
    ]);
    setReminders(Array.isArray(r) ? r : []);
    setSchedules(Array.isArray(s) ? s : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const getEventsForDay = (date) => {
    if (!date) return [];
    const events = [];
    reminders.forEach(r => {
      const rd = new Date(r.remind_at);
      if (isSameDay(rd, date)) {
        events.push({ type: "reminder", id: r.id, title: r.title, time: rd.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }), platform: r.platform });
      }
    });
    return events;
  };

  const handleDayClick = (date) => {
    if (!date) return;
    setAddDate(date);
    setShowAdd(true);
    setNewTitle("");
    setNewTime("09:00");
  };

  const handleAddReminder = async () => {
    if (!newTitle || !addDate) return;
    const [h, m] = newTime.split(":").map(Number);
    const dt = new Date(addDate);
    dt.setHours(h, m, 0, 0);
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({
        title: newTitle,
        remindAt: dt.toISOString(),
        platform: newPlatform === "none" ? null : newPlatform,
      }),
    });
    setShowAdd(false);
    load();
  };

  const handleDelete = async (id) => {
    await fetch(`/api/reminders/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  };

  const platformIcon = (p) => ({ telegram: "✈️", discord: "🎮", slack: "💬" }[p] || "🔔");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: "#111128", border: "1px solid #222244",
        borderRadius: 16, width: "100%", maxWidth: 760,
        maxHeight: "92vh", overflow: "auto", padding: 24,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📅 일정 관리</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 16 }}>
          <button onClick={() => setCurrent(new Date(year, month - 1, 1))} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 20 }}>‹</button>
          <div style={{ fontSize: 18, fontWeight: 800, minWidth: 140, textAlign: "center" }}>
            {year}년 {MONTHS[month]}
          </div>
          <button onClick={() => setCurrent(new Date(year, month + 1, 1))} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 20 }}>›</button>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{
              textAlign: "center", fontSize: 11, fontWeight: 700, padding: "4px 0",
              color: i === 0 ? "#EF4444" : i === 6 ? "#60A5FA" : "#666",
            }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((date, i) => {
            const events = date ? getEventsForDay(date) : [];
            const isToday = date && isSameDay(date, today);
            const dayOfWeek = date ? date.getDay() : i % 7;
            return (
              <div
                key={i}
                onClick={() => handleDayClick(date)}
                style={{
                  minHeight: 80, borderRadius: 8, padding: 6,
                  background: date ? (isToday ? "rgba(139,92,246,0.15)" : "#0D0D22") : "transparent",
                  border: isToday ? "1px solid #8B5CF6" : "1px solid " + (date ? "#1A1A3A" : "transparent"),
                  cursor: date ? "pointer" : "default",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={e => { if (date) e.currentTarget.style.borderColor = "#8B5CF6"; }}
                onMouseLeave={e => { if (date && !isToday) e.currentTarget.style.borderColor = "#1A1A3A"; }}
              >
                {date && (
                  <>
                    <div style={{
                      fontSize: 12, fontWeight: isToday ? 800 : 400,
                      color: dayOfWeek === 0 ? "#EF4444" : dayOfWeek === 6 ? "#60A5FA" : isToday ? "#8B5CF6" : "#999",
                      marginBottom: 4,
                    }}>{date.getDate()}</div>
                    {events.slice(0, 3).map((ev, j) => (
                      <div key={j} style={{
                        fontSize: 10, padding: "2px 5px", borderRadius: 4, marginBottom: 2,
                        background: ev.type === "reminder" ? "rgba(139,92,246,0.25)" : "rgba(74,222,128,0.2)",
                        color: ev.type === "reminder" ? "#C4B5FD" : "#86EFAC",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        cursor: "pointer",
                      }}
                        onClick={e => { e.stopPropagation(); if (ev.type === "reminder") handleDelete(ev.id); }}
                        title={`${ev.time} ${ev.title} (클릭하여 삭제)`}
                      >
                        {platformIcon(ev.platform)} {ev.title}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <div style={{ fontSize: 9, color: "#555" }}>+{events.length - 3}개 더</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Upcoming reminders */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#8B5CF6", marginBottom: 12 }}>다가오는 일정</div>
          {reminders.length === 0 ? (
            <div style={{ color: "#444", fontSize: 12, textAlign: "center", padding: 20 }}>등록된 일정이 없습니다. 날짜를 클릭해 추가하세요.</div>
          ) : (
            reminders.slice(0, 8).map(r => (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", marginBottom: 6,
                background: "#0D0D22", borderRadius: 10, border: "1px solid #1A1A3A",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{platformIcon(r.platform)}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>
                      {new Date(r.remind_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDelete(r.id)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))
          )}
        </div>

        {/* Add reminder panel */}
        {showAdd && addDate && (
          <div style={{ marginTop: 20, padding: 20, background: "#0D0D22", borderRadius: 12, border: "1px solid #8B5CF633" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
              + {addDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 일정 추가
            </div>
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddReminder()}
              placeholder="일정 제목"
              style={{
                width: "100%", padding: "10px 12px", background: "#1A1A2E",
                border: "1px solid #333", borderRadius: 8, color: "#E0E0F0",
                fontSize: 13, fontFamily: "inherit", outline: "none",
                boxSizing: "border-box", marginBottom: 10,
              }}
            />
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <input
                type="time"
                value={newTime}
                onChange={e => setNewTime(e.target.value)}
                style={{
                  flex: 1, padding: "10px 12px", background: "#1A1A2E",
                  border: "1px solid #333", borderRadius: 8, color: "#E0E0F0",
                  fontSize: 13, fontFamily: "inherit", outline: "none",
                }}
              />
              <select
                value={newPlatform}
                onChange={e => setNewPlatform(e.target.value)}
                style={{
                  flex: 1, padding: "10px 12px", background: "#1A1A2E",
                  border: "1px solid #333", borderRadius: 8, color: "#E0E0F0",
                  fontSize: 13, fontFamily: "inherit", outline: "none",
                }}
              >
                <option value="none">🔔 앱 내 알림</option>
                <option value="telegram">✈️ Telegram</option>
                <option value="discord">🎮 Discord</option>
                <option value="slack">💬 Slack</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAddReminder} style={{
                flex: 1, padding: "10px 0",
                background: "linear-gradient(135deg, #8B5CF6, #6D28D9)",
                border: "none", borderRadius: 8, color: "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>추가</button>
              <button onClick={() => setShowAdd(false)} style={{
                padding: "10px 16px",
                background: "none", border: "1px solid #333", borderRadius: 8,
                color: "#666", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}>취소</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, padding: "12px 14px", background: "#0D0D1A", borderRadius: 10, fontSize: 11, color: "#444", lineHeight: 1.8 }}>
          💡 텔레그램/디코/슬랙에서 봇에게 <strong style={{ color: "#666" }}>"내일 오전 10시에 팀 미팅 알림해줘"</strong> 라고 보내면 자동 등록됩니다.<br />
          설정에서 Bot Token과 Chat ID를 먼저 입력하세요.
        </div>
      </div>
    </div>
  );
}
