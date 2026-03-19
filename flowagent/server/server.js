require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express = require("express");
const http = require("http");
const path = require("path");
const vm = require("vm");
const { WebSocketServer } = require("ws");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
const Anthropic = require("@anthropic-ai/sdk");
const fetch = require("node-fetch");
const { JSONPath } = require("jsonpath-plus");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

// ── Security helpers ──────────────────────────────────────────

// SSRF 방지: private IP / 메타데이터 엔드포인트 차단
function isPrivateUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return true; } // 파싱 실패 = 차단

  const { hostname, protocol } = parsed;

  // file:// 등 비-HTTP 프로토콜 차단
  if (!["http:", "https:"].includes(protocol)) return true;

  // localhost 및 loopback IPv6
  if (hostname === "localhost" || hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return true;

  // IPv4 private/reserved ranges (개별 검사)
  if (
    /^127\./.test(hostname)           || // 127.x.x.x loopback
    /^0\.0\.0\.0$/.test(hostname)     || // unspecified
    /^10\./.test(hostname)            || // 10.x.x.x Class A private
    /^192\.168\./.test(hostname)      || // 192.168.x.x Class C private
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) || // 172.16-31.x.x Class B private
    /^169\.254\./.test(hostname)      || // 169.254.x.x link-local (AWS/GCP metadata)
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname) // 100.64-127.x CGNAT
  ) return true;

  // 클라우드 메타데이터 호스트명
  if (["metadata.google.internal", "metadata.internal", "instance-data"].includes(hostname)) return true;

  return false;
}

// JS 코드를 격리된 vm 컨텍스트에서 안전하게 실행 (RCE 방지)
// - process, require, global, Buffer 등 Node.js 전역 접근 불가
// - 타임아웃으로 무한루프 방지
// - 코드는 반드시 return 문으로 결과를 반환해야 함
function runSandboxed(code, context, timeoutMs = 5000) {
  // Object.create(null) 로 프로토타입 없는 샌드박스 — __proto__ 체인 오염 방지
  const sandbox = Object.assign(Object.create(null), context);
  vm.createContext(sandbox);
  // IIFE 래핑: 사용자 코드의 return 값을 __result에 저장
  const wrapped = `__result = (function() { "use strict"; ${code} })();`;
  sandbox.__result = undefined;
  vm.runInContext(wrapped, sandbox, { timeout: timeoutMs, filename: "sandbox.js" });
  return sandbox.__result;
}

const db = require("./db");
const { router: authRouter, authMiddleware, checkRunLimit } = require("./auth");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");
const JWT_SECRET = process.env.JWT_SECRET || "flowagent-dev-secret";

// ── Security warning ──────────────────────────────────────────
if (process.env.NODE_ENV === "production" && JWT_SECRET === "flowagent-dev-secret") {
  console.error("⚠️  FATAL: JWT_SECRET is using default dev value in production! Set a strong secret in .env");
  process.exit(1);
}

// ── Cron registry ─────────────────────────────────────────────
const cronJobs = new Map(); // workflowId → ScheduledTask

function registerCron(wf) {
  if (cronJobs.has(wf.id)) { cronJobs.get(wf.id).destroy(); cronJobs.delete(wf.id); }
  if (!wf.scheduleEnabled || !wf.scheduleCron) return;
  if (!cron.validate(wf.scheduleCron)) { console.warn(`[Cron] Invalid expression for ${wf.id}: ${wf.scheduleCron}`); return; }
  const task = cron.schedule(wf.scheduleCron, () => {
    console.log(`[Cron] Running workflow ${wf.name} (${wf.id})`);
    executeWorkflowBackground(wf.id, wf.userId);
  }, { timezone: "Asia/Seoul" });
  cronJobs.set(wf.id, task);
  console.log(`  ✓ Cron scheduled: "${wf.name}" @ ${wf.scheduleCron}`);
}

async function executeWorkflowBackground(workflowId, userId) {
  // Fake ws object that discards messages (background execution)
  const fakeWs = { readyState: 1, OPEN: 1, send: () => {} };
  await executeWorkflow(workflowId, userId, fakeWs);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// ── Security middleware ───────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true, credentials: true }));
app.set("trust proxy", 1);

// ── Rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, // 20 auth requests per 15 min
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
  standardHeaders: true, legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 200, // 200 API requests per minute
  message: { error: "API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요." },
  standardHeaders: true, legacyHeaders: false,
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20, // 20 AI chat requests per minute
  message: { error: "AI 채팅 요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
  standardHeaders: true, legacyHeaders: false,
});

// ── Health check ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    db: db ? "connected" : "disconnected",
  });
});

// ── Auth ─────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRouter);
app.use("/api", apiLimiter);

// ── REST API (protected) ─────────────────────────────────────

app.get("/api/workflows", authMiddleware, (req, res) => {
  const list = db.listWorkflows(req.user.id).map(({ id, name, updatedAt, nodes, edges }) => ({
    id, name, updatedAt,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  }));
  res.json(list);
});

app.get("/api/workflows/:id", authMiddleware, (req, res) => {
  const wf = db.getWorkflow(req.params.id);
  if (!wf || wf.userId !== req.user.id) return res.status(404).json({ error: "Not found" });
  res.json(wf);
});

app.post("/api/workflows", authMiddleware, (req, res) => {
  const wf = db.createWorkflow({ ...req.body, userId: req.user.id });
  res.status(201).json(wf);
});

app.put("/api/workflows/:id", authMiddleware, (req, res) => {
  const wf = db.updateWorkflow(req.params.id, req.user.id, req.body);
  if (!wf) return res.status(404).json({ error: "Not found" });
  res.json(wf);
});

app.delete("/api/workflows/:id", authMiddleware, (req, res) => {
  db.deleteWorkflow(req.params.id, req.user.id);
  res.json({ ok: true });
});

// POST /api/workflows/:id/duplicate — 복제
app.post("/api/workflows/:id/duplicate", authMiddleware, (req, res) => {
  const original = db.getWorkflow(req.params.id);
  if (!original || original.userId !== req.user.id) return res.status(404).json({ error: "Not found" });
  const copy = db.createWorkflow({
    name: original.name + " (복사)",
    nodes: original.nodes,
    edges: original.edges,
    userId: req.user.id,
  });
  res.status(201).json(copy);
});

app.get("/api/executions", authMiddleware, (req, res) => {
  res.json(db.listExecutions(req.user.id));
});

// POST /api/workflows/:id/webhook — generate webhook token
app.post("/api/workflows/:id/webhook", authMiddleware, (req, res) => {
  const token = uuidv4().replace(/-/g, "");
  const wf = db.setWebhookToken(req.params.id, req.user.id, token);
  if (!wf) return res.status(404).json({ error: "Not found" });
  res.json({ webhookUrl: `/api/webhook/${token}`, token });
});

// POST /api/webhook/:token — public trigger endpoint
app.post("/api/webhook/:token", async (req, res) => {
  const wf = db.getByWebhookToken(req.params.token);
  if (!wf) return res.status(404).json({ error: "Webhook not found" });

  res.json({ ok: true, workflowId: wf.id, message: "Workflow triggered" });

  // Run in background with request body as input
  const fakeWs = {
    readyState: 1, OPEN: 1,
    send: (data) => console.log(`[Webhook] ${wf.name}:`, JSON.parse(data).type),
  };
  // Inject webhook payload into trigger node
  const wfWithPayload = {
    ...wf,
    nodes: wf.nodes.map(n =>
      n.type === "trigger" ? { ...n, _webhookPayload: req.body } : n
    ),
  };
  executeWorkflow(wf.id, wf.userId, fakeWs, req.body);
});

// ── Node test endpoint ────────────────────────────────────────
app.post("/api/nodes/test", authMiddleware, async (req, res) => {
  const { node, input } = req.body;
  if (!node || !node.type) return res.status(400).json({ error: "node required" });
  const executor = NODE_EXECUTORS[node.type];
  if (!executor) return res.status(400).json({ error: `Unknown node type: ${node.type}` });
  const userSettings = db.getSettings(req.user.id);
  try {
    const start = Date.now();
    const result = await executor(node, input || null, { userSettings });
    res.json({ ok: true, output: result.output, duration: Date.now() - start });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Waitlist (public) ─────────────────────────────────────────
app.post("/api/waitlist", (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "유효한 이메일을 입력하세요" });
  }
  const result = db.addToWaitlist(email.toLowerCase().trim());
  const count = db.getWaitlistCount();
  if (result.alreadyExists) return res.json({ ok: true, alreadyExists: true, count });
  res.json({ ok: true, alreadyExists: false, count });
});

app.get("/api/waitlist/count", (req, res) => {
  res.json({ count: db.getWaitlistCount() });
});

// ── Stripe ────────────────────────────────────────────────────
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

if (STRIPE_SECRET) {
  const Stripe = require("stripe");
  const stripe = new Stripe(STRIPE_SECRET);

  // Create checkout session
  app.post("/api/stripe/checkout", authMiddleware, async (req, res) => {
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${APP_URL}?upgraded=1`,
        cancel_url: `${APP_URL}?upgraded=0`,
        metadata: { userId: req.user.id },
      });
      res.json({ url: session.url });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Stripe webhook — upgrade plan on payment
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      return res.status(400).send(`Webhook Error: ${e.message}`);
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      if (userId) {
        db.upgradePlan(userId, "pro");
        console.log(`[Stripe] Upgraded user ${userId} to pro`);
      }
    }
    res.json({ received: true });
  });
}

// ── User Settings ─────────────────────────────────────────────
app.get("/api/settings", authMiddleware, (req, res) => {
  const settings = db.getSettings(req.user.id);
  // Mask API keys: only show last 4 chars
  const masked = {};
  for (const [k, v] of Object.entries(settings)) {
    masked[k] = v && k.toLowerCase().includes("key") ? "••••" + String(v).slice(-4) : v;
  }
  res.json(masked);
});

app.put("/api/settings", authMiddleware, (req, res) => {
  const current = db.getSettings(req.user.id);
  // Merge: if value is masked (••••...) keep old value
  const incoming = req.body || {};
  const merged = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    if (v && !String(v).startsWith("••••")) merged[k] = v;
    else if (!v) delete merged[k]; // empty = clear
  }
  db.saveSettings(req.user.id, merged);
  res.json({ ok: true });
});

// ── AI Chat (personal assistant) ──────────────────────────────
app.post("/api/chat", chatLimiter, authMiddleware, async (req, res) => {
  const { messages, model, systemPrompt } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages required" });
  }

  const userSettings = db.getSettings(req.user.id);
  const isAnthropic = model && model.startsWith("claude");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  const sysMsg = systemPrompt ||
    "당신은 FlowAgent의 AI 개인 비서입니다. 워크플로우 자동화, 생산성, 기술적인 질문에 특화되어 있습니다. 친절하고 간결하게 한국어로 답변하세요.";

  try {
    if (isAnthropic) {
      const apiKey = userSettings.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.write("[오류] Anthropic API 키가 없습니다. ⚙ 설정에서 Claude API Key를 입력하세요.");
        return res.end();
      }
      const anthropic = new Anthropic({ apiKey });
      const stream = anthropic.messages.stream({
        model: model || "claude-opus-4-6",
        max_tokens: 2048,
        system: sysMsg,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          res.write(event.delta.text);
        }
      }
    } else {
      const apiKey = userSettings.openai_api_key || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.write("[오류] OpenAI API 키가 없습니다. ⚙ 설정에서 OpenAI API Key를 입력하세요.");
        return res.end();
      }
      const client = new OpenAI({ apiKey });
      const stream = await client.chat.completions.create({
        model: model || "gpt-4o",
        stream: true,
        messages: [{ role: "system", content: sysMsg }, ...messages],
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) res.write(text);
      }
    }
    res.end();
  } catch (e) {
    res.write(`\n[오류] ${e.message}`);
    res.end();
  }
});

// PUT /api/workflows/:id/schedule — enable/disable cron
app.put("/api/workflows/:id/schedule", authMiddleware, (req, res) => {
  const { cron: cronExpr, enabled } = req.body;
  if (cronExpr && !cron.validate(cronExpr)) {
    return res.status(400).json({ error: "유효하지 않은 Cron 표현식입니다" });
  }
  const wf = db.setSchedule(req.params.id, req.user.id, { cron: cronExpr, enabled: !!enabled });
  if (!wf) return res.status(404).json({ error: "Not found" });
  registerCron(wf);
  res.json(wf);
});

// GET /api/schedules — 유저의 스케줄 목록 + 다음 실행 시간
app.get("/api/schedules", authMiddleware, (req, res) => {
  const workflows = db.listWorkflows(req.user.id).filter(wf => wf.scheduleCron);
  const result = workflows.map(wf => {
    let nextRun = null;
    if (wf.scheduleEnabled && wf.scheduleCron && cron.validate(wf.scheduleCron)) {
      try {
        // Calculate next run using cronparser
        const interval = require("cron-parser").parseExpression(wf.scheduleCron, {
          tz: "Asia/Seoul",
        });
        nextRun = interval.next().toDate().toISOString();
      } catch { /* ignore */ }
    }
    return {
      id: wf.id,
      name: wf.name,
      cron: wf.scheduleCron,
      enabled: wf.scheduleEnabled,
      nextRun,
      nodeCount: wf.nodes.length,
    };
  });
  res.json(result);
});

// ── Reminders CRUD ────────────────────────────────────────────
app.get("/api/reminders", authMiddleware, (req, res) => {
  res.json(db.listReminders(req.user.id));
});

app.post("/api/reminders", authMiddleware, (req, res) => {
  const { title, remindAt, platform, chatId } = req.body;
  if (!title || !remindAt) return res.status(400).json({ error: "title과 remindAt 필요" });
  const reminder = db.createReminder({ userId: req.user.id, title, remindAt, platform, chatId });
  res.status(201).json(reminder);
});

app.delete("/api/reminders/:id", authMiddleware, (req, res) => {
  db.deleteReminder(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ── Bot webhooks (Telegram/Discord/Slack) → 일정 파싱 저장 ───
async function parseReminderFromAI(text, settings) {
  const apiKey = settings?.openai_api_key || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  try {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `현재 시각: ${now} (서울)
사용자 메시지: "${text}"

이 메시지가 일정/알림 등록 요청이면 JSON으로 반환하세요:
{"title": "일정 제목", "remind_at": "ISO8601 datetime (서울 시간 기준)"}

일정 요청이 아니면: {"not_reminder": true}
JSON만 반환, 설명 없이.`,
      }],
      temperature: 0,
    });
    return JSON.parse(res.choices[0].message.content.trim());
  } catch { return null; }
}

// Telegram bot webhook
app.post("/api/bot/telegram", async (req, res) => {
  res.json({ ok: true }); // Telegram에 빠르게 응답
  const update = req.body;
  const msg = update.message || update.channel_post;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const text = msg.text;

  // chatId로 유저 찾기 (settings에 telegram_chat_id 저장된 유저)
  const users = db.findUsersByChatId("telegram", chatId);
  if (!users.length) return;

  for (const user of users) {
    const settings = db.getSettings(user.id);
    const token = settings?.telegram_bot_token;
    if (!token) continue;

    const parsed = await parseReminderFromAI(text, settings);
    if (!parsed || parsed.not_reminder) {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "❓ 일정 형식으로 입력해주세요.\n예: \"내일 오전 10시에 팀 미팅 알림해줘\"" }),
      });
      continue;
    }

    db.createReminder({ userId: user.id, title: parsed.title, remindAt: parsed.remind_at, platform: "telegram", chatId });
    const remindDate = new Date(parsed.remind_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `✅ 일정 등록!\n📌 ${parsed.title}\n⏰ ${remindDate}` }),
    });
  }
});

// Discord bot webhook (interactions endpoint)
app.post("/api/bot/discord", async (req, res) => {
  const { type, data, channel_id } = req.body;
  if (type === 1) return res.json({ type: 1 }); // PING
  if (type === 2 && data?.name === "remind") { // slash command
    const text = data.options?.[0]?.value || "";
    const users = db.findUsersByChatId("discord", channel_id);
    if (!users.length) return res.json({ type: 4, data: { content: "채널이 연결되지 않았습니다." } });

    const user = users[0];
    const settings = db.getSettings(user.id);
    const parsed = await parseReminderFromAI(text, settings);
    if (!parsed || parsed.not_reminder) {
      return res.json({ type: 4, data: { content: "❓ 일정 형식으로 입력해주세요. 예: `내일 오전 10시 미팅`" } });
    }
    db.createReminder({ userId: user.id, title: parsed.title, remindAt: parsed.remind_at, platform: "discord", chatId: channel_id });
    const remindDate = new Date(parsed.remind_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    return res.json({ type: 4, data: { content: `✅ **${parsed.title}** — ${remindDate} 알림 등록!` } });
  }
  res.json({ type: 4, data: { content: "알 수 없는 명령" } });
});

// Slack slash command (/remind)
app.post("/api/bot/slack", async (req, res) => {
  const { text, channel_id, user_id } = req.body;
  const users = db.findUsersByChatId("slack", channel_id);
  if (!users.length) return res.json({ text: "채널이 연결되지 않았습니다." });

  const user = users[0];
  const settings = db.getSettings(user.id);
  const parsed = await parseReminderFromAI(text, settings);
  if (!parsed || parsed.not_reminder) {
    return res.json({ text: "❓ 일정 형식으로 입력해주세요. 예: `/remind 내일 오전 10시 팀 미팅`" });
  }
  db.createReminder({ userId: user.id, title: parsed.title, remindAt: parsed.remind_at, platform: "slack", chatId: channel_id });
  const remindDate = new Date(parsed.remind_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  res.json({ text: `✅ *${parsed.title}* — ${remindDate} 알림 등록!` });
});

// ── Reminder cron (매분 체크) ──────────────────────────────────
cron.schedule("* * * * *", async () => {
  const due = db.getDueReminders();
  for (const reminder of due) {
    try {
      const settings = db.getSettings(reminder.user_id);
      const msg = `⏰ 알림!\n📌 ${reminder.title}`;

      if (reminder.platform === "telegram" && reminder.chat_id) {
        const token = settings?.telegram_bot_token;
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: reminder.chat_id, text: msg }),
          });
        }
      } else if (reminder.platform === "discord" && reminder.chat_id) {
        const webhookUrl = settings?.discord_webhook_url;
        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: msg }),
          });
        }
      } else if (reminder.platform === "slack" && reminder.chat_id) {
        const webhookUrl = settings?.slack_webhook_url;
        if (webhookUrl) {
          await fetch(webhookUrl, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: msg }),
          });
        }
      }
      db.markReminderSent(reminder.id);
      console.log(`[Reminder] Sent: ${reminder.title}`);
    } catch (e) {
      console.error(`[Reminder] Error: ${e.message}`);
    }
  }
}, { timezone: "Asia/Seoul" });

// ── Node executor (simulated, plug in real logic later) ──────

const NODE_EXECUTORS = {
  trigger: async (node, input, ctx) => {
    await sleep(100);
    return { output: { event: "received", data: ctx?.webhookPayload || input || { payload: "sample_data" } } };
  },

  ai_agent: async (node, input, ctx) => {
    const model = node.config?.model || "gpt-4o-mini";
    const isClaude = model.startsWith("claude");
    const prompt = node.config?.prompt || "입력 데이터를 처리해주세요.";
    const systemPrompt = node.config?.system_prompt || "";
    const temperature = node.config?.temperature ?? 0.7;
    const maxTokens = node.config?.max_tokens ?? 1000;
    const inputText = input ? `\n\n입력 데이터:\n${JSON.stringify(input, null, 2)}` : "";
    const userContent = prompt + inputText;

    if (isClaude) {
      const anthropicKey = ctx?.userSettings?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) throw new Error("Anthropic API 키가 없습니다. ⚙ 설정 → Anthropic API Key를 입력하세요.");
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: "user", content: userContent }],
        temperature,
      });
      const result = response.content[0]?.text || "";
      return { output: { model, result, tokens: response.usage?.input_tokens + response.usage?.output_tokens, provider: "anthropic" } };
    } else {
      const openaiKey = ctx?.userSettings?.openai_api_key || process.env.OPENAI_API_KEY;
      if (!openaiKey) throw new Error("OpenAI API 키가 없습니다. ⚙ 설정 → OpenAI API Key를 입력하세요.");
      const client = new OpenAI({ apiKey: openaiKey });
      const messages = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: userContent });
      const response = await client.chat.completions.create({ model, messages, temperature, max_tokens: maxTokens });
      const result = response.choices[0].message.content;
      return { output: { model, result, tokens: response.usage?.total_tokens, provider: "openai" } };
    }
  },

  api_call: async (node, input) => {
    const url = resolveTemplate(node.config?.url || "", input);
    if (!url || url.trim() === "" || url === "https://api.example.com") {
      throw new Error("API URL이 설정되지 않았습니다. 노드를 클릭해 URL을 입력하세요.");
    }
    if (isPrivateUrl(url)) {
      throw new Error(`보안 오류: 내부 네트워크 주소(${url})로의 요청은 허용되지 않습니다.`);
    }
    const method = (node.config?.method || "GET").toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    const timeout = (node.config?.timeout || 30) * 1000;

    // Build headers
    const headers = {};
    try { Object.assign(headers, node.config?.headers ? JSON.parse(node.config.headers) : {}); } catch {}
    // Auth
    const authType = node.config?.auth_type || "none";
    if (authType === "bearer" && node.config?.auth_value) headers["Authorization"] = `Bearer ${node.config.auth_value}`;
    else if (authType === "apikey" && node.config?.auth_key && node.config?.auth_value) headers[node.config.auth_key] = node.config.auth_value;
    else if (authType === "basic" && node.config?.auth_value) headers["Authorization"] = `Basic ${Buffer.from(node.config.auth_value).toString("base64")}`;

    // Build body
    let reqBody;
    if (hasBody) {
      if (node.config?.body) {
        try { reqBody = JSON.stringify(JSON.parse(resolveTemplate(node.config.body, input))); }
        catch { reqBody = resolveTemplate(node.config.body, input); }
      } else if (input) {
        reqBody = JSON.stringify(input);
      }
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        signal: controller.signal,
        ...(hasBody && reqBody ? { body: reqBody } : {}),
      });
    } catch (e) {
      clearTimeout(timer);
      throw new Error(e.name === "AbortError" ? `API 타임아웃 (${timeout/1000}초)` : `API 호출 실패: ${e.message}`);
    }
    clearTimeout(timer);
    const responseTime = Date.now() - start;

    let body;
    const ct = res.headers.get("content-type") || "";
    try { body = ct.includes("application/json") ? await res.json() : await res.text(); }
    catch { body = await res.text(); }

    if (!res.ok) throw new Error(`HTTP ${res.status} 오류: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);

    // JSONPath 추출
    let extracted = body;
    if (node.config?.extract_path) {
      try {
        const matches = JSONPath({ path: node.config.extract_path, json: body });
        extracted = matches.length === 1 ? matches[0] : matches;
      } catch {}
    }

    return { output: { status: res.status, url, method, responseTime: `${responseTime}ms`, body: extracted, raw: body } };
  },

  condition: async (node, input) => {
    const conditions = node.config?.conditions || [{ field: "$..*", operator: "exists", value: "" }];
    const logic = node.config?.logic || "AND"; // AND | OR

    const evaluateOne = (cond) => {
      const { field, operator, value } = cond;
      try {
        const matches = JSONPath({ path: field || "$..*", json: input ?? {} });
        const actual = matches[0];
        switch (operator) {
          case "exists":    return matches.length > 0;
          case "not_exists":return matches.length === 0;
          case "equals":    return String(actual) === String(value);
          case "not_equals":return String(actual) !== String(value);
          case "contains":  return String(actual).includes(String(value));
          case "not_contains": return !String(actual).includes(String(value));
          case "gt":        return Number(actual) > Number(value);
          case "gte":       return Number(actual) >= Number(value);
          case "lt":        return Number(actual) < Number(value);
          case "lte":       return Number(actual) <= Number(value);
          case "starts_with": return String(actual).startsWith(String(value));
          case "ends_with":   return String(actual).endsWith(String(value));
          case "regex":     return new RegExp(value).test(String(actual));
          default:          return false;
        }
      } catch { return false; }
    };

    const results = conditions.map(evaluateOne);
    const passed = logic === "OR" ? results.some(Boolean) : results.every(Boolean);
    return {
      output: { condition: passed, branch: passed ? "true" : "false", evaluated: results, input },
      branch: passed ? "true" : "false",
    };
  },

  transform: async (node, input) => {
    const code = node.config?.code || "return input;";
    let output;
    try {
      // vm 샌드박스에서 실행 — process/require/global 접근 불가, 5초 타임아웃
      const utils = {
        pick: (obj, keys) => keys.reduce((a, k) => { a[k] = obj?.[k]; return a; }, {}),
        omit: (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !keys.includes(k))),
        flatten: (arr) => arr.flat(),
        unique: (arr) => [...new Set(arr)],
        format: (date) => new Date(date).toLocaleString("ko-KR"),
        toArray: (v) => Array.isArray(v) ? v : [v],
      };
      output = runSandboxed(`const input = __input; const _ = __utils; ${code}`, { __input: input, __utils: utils });
    } catch (err) {
      if (err.code === "ERR_SCRIPT_EXECUTION_TIMEOUT") throw new Error("Transform 오류: 코드 실행 시간 초과 (5초). 무한루프나 과도한 연산이 없는지 확인하세요.");
      throw new Error(`Transform 오류: ${err.message}`);
    }
    if (output === undefined) output = input;
    return { output };
  },

  slack: async (node, input, ctx) => {
    const webhookUrl = node.config?.webhook_url || ctx?.userSettings?.slack_webhook_url;
    if (!webhookUrl) throw new Error("Slack Webhook URL이 없습니다. 노드 설정 또는 ⚙ 설정에서 입력하세요.");
    const message = resolveTemplate(node.config?.message || "{{input.result}}", input);
    const body = { text: message };
    if (node.config?.channel) body.channel = node.config.channel;
    const res = await fetch(webhookUrl, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Slack 전송 실패: ${res.status}`);
    return { output: { sent: true, platform: "slack", message } };
  },

  discord: async (node, input, ctx) => {
    const webhookUrl = node.config?.webhook_url || ctx?.userSettings?.discord_webhook_url;
    if (!webhookUrl) throw new Error("Discord Webhook URL이 없습니다. 노드 설정 또는 ⚙ 설정에서 입력하세요.");
    const message = resolveTemplate(node.config?.message || "", input);
    const payload = {
      username: node.config?.username || "FlowAgent",
      avatar_url: node.config?.avatar_url || undefined,
    };
    // Embed 지원
    if (node.config?.use_embed) {
      const embed = {
        title: resolveTemplate(node.config?.embed_title || "", input),
        description: resolveTemplate(node.config?.embed_description || message, input),
        color: parseInt((node.config?.embed_color || "#8B5CF6").replace("#", ""), 16),
        timestamp: new Date().toISOString(),
        footer: { text: "FlowAgent" },
      };
      if (node.config?.embed_url) embed.url = node.config.embed_url;
      payload.embeds = [embed];
    } else {
      payload.content = message || JSON.stringify(input).slice(0, 2000);
    }
    const res = await fetch(webhookUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status);
      throw new Error(`Discord 전송 실패 (${res.status}): ${String(err).slice(0, 200)}`);
    }
    return { output: { sent: true, platform: "discord", message } };
  },

  telegram: async (node, input, ctx) => {
    const token = node.config?.bot_token || ctx?.userSettings?.telegram_bot_token;
    const chatId = node.config?.chat_id;
    if (!token) throw new Error("Telegram Bot Token이 없습니다. 노드 설정 또는 ⚙ 설정에서 입력하세요.");
    if (!chatId) throw new Error("Telegram Chat ID가 없습니다. 노드 설정에서 입력하세요.");
    const message = resolveTemplate(node.config?.message || "{{input.result}}", input);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram 전송 실패: ${data.description}`);
    return { output: { sent: true, platform: "telegram", message } };
  },

  rss_feed: async (node) => {
    const url = node.config?.url;
    if (!url) throw new Error("RSS URL이 필요합니다. 노드 설정에서 입력하세요.");
    if (isPrivateUrl(url)) {
      throw new Error(`보안 오류: 내부 네트워크 주소(${url})로의 요청은 허용되지 않습니다.`);
    }
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": "FlowAgent/1.0" } });
    } catch (e) {
      throw new Error(`RSS 가져오기 실패: ${e.message}`);
    }
    if (!res.ok) throw new Error(`RSS HTTP 오류: ${res.status}`);
    const xml = await res.text();

    // Simple RSS/Atom parser (no deps)
    const items = [];
    const isAtom = xml.includes("<feed");
    const entryTag = isAtom ? "entry" : "item";
    const re = new RegExp(`<${entryTag}[\\s>]([\\s\\S]*?)</${entryTag}>`, "g");
    const getText = (str, tag) => {
      const m = str.match(new RegExp(`<${tag}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}(?:[^>]*)>([\\s\\S]*?)</${tag}>`, "i"));
      return (m?.[1] || m?.[2] || "").trim();
    };
    let match;
    while ((match = re.exec(xml)) !== null) {
      const raw = match[1];
      const title = getText(raw, "title");
      const link = getText(raw, isAtom ? "id" : "link") || (raw.match(/<link[^>]+href="([^"]+)"/)?.[1] || "");
      const pubDate = getText(raw, isAtom ? "updated" : "pubDate");
      const description = getText(raw, isAtom ? "summary" : "description").replace(/<[^>]+>/g, "").slice(0, 300);
      if (title) items.push({ title, link, pubDate, description });
    }
    const limit = node.config?.limit || 5;
    const result = items.slice(0, limit);
    return { output: { items: result, count: result.length, total: items.length, url } };
  },

  notion: async (node, input, ctx) => {
    const apiKey = node.config?.api_key || ctx?.userSettings?.notion_api_key;
    if (!apiKey) throw new Error("Notion API 키가 없습니다. ⚙ 설정 → Notion API Key를 입력하세요.");
    const databaseId = node.config?.database_id;
    if (!databaseId) throw new Error("Notion Database ID가 필요합니다. 노드 설정에서 입력하세요.");
    const title = resolveTemplate(node.config?.title || "{{input.result}}", input);
    const content = resolveTemplate(node.config?.content || "", input);
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: { title: { title: [{ text: { content: title } }] } },
        children: content ? [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ text: { content } }] } }] : [],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Notion 오류: ${err.message || res.status}`);
    }
    const data = await res.json();
    return { output: { pageId: data.id, url: data.url, title } };
  },

  email: async (node, input, ctx) => {
    const apiKey = node.config?.api_key || ctx?.userSettings?.sendgrid_api_key;
    if (!apiKey) throw new Error("SendGrid API 키가 없습니다. ⚙ 설정 → SendGrid API Key를 입력하세요.");
    const to = resolveTemplate(node.config?.to || "", input);
    if (!to) throw new Error("받는 사람 이메일 주소가 필요합니다.");
    const subject = resolveTemplate(node.config?.subject || "FlowAgent 알림", input);
    const body = resolveTemplate(node.config?.body || "{{input.result}}", input);
    const from = node.config?.from || "noreply@flowagent.app";
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: "text/plain", value: body }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.status);
      throw new Error(`SendGrid 오류 (${res.status}): ${String(text).slice(0, 200)}`);
    }
    return { output: { sent: true, to, subject } };
  },

  output: async (node, input) => {
    const format = node.config?.format || "json";
    let formatted;
    if (format === "text") formatted = typeof input === "string" ? input : JSON.stringify(input, null, 2);
    else if (format === "summary" && input) {
      const keys = Object.keys(input);
      formatted = keys.map(k => `${k}: ${String(input[k]).slice(0, 100)}`).join("\n");
    } else formatted = input;
    return { output: { delivered: true, format, data: formatted, timestamp: new Date().toISOString() } };
  },

  // ── 새 노드 타입 ───────────────────────────────────────────

  filter: async (node, input) => {
    // 배열에서 조건에 맞는 항목만 통과
    const raw = input?.items ?? input;
    const items = Array.isArray(raw) ? raw : [raw].filter(Boolean);
    const field = node.config?.field || "$..*";
    const operator = node.config?.operator || "exists";
    const value = node.config?.value ?? "";

    const filtered = items.filter(item => {
      try {
        const matches = JSONPath({ path: field, json: item });
        const actual = matches[0];
        switch (operator) {
          case "exists":      return matches.length > 0;
          case "not_exists":  return matches.length === 0;
          case "equals":      return String(actual) === String(value);
          case "not_equals":  return String(actual) !== String(value);
          case "contains":    return String(actual ?? "").toLowerCase().includes(String(value).toLowerCase());
          case "not_contains":return !String(actual ?? "").toLowerCase().includes(String(value).toLowerCase());
          case "gt":          return Number(actual) > Number(value);
          case "gte":         return Number(actual) >= Number(value);
          case "lt":          return Number(actual) < Number(value);
          case "lte":         return Number(actual) <= Number(value);
          case "starts_with": return String(actual ?? "").startsWith(String(value));
          case "ends_with":   return String(actual ?? "").endsWith(String(value));
          case "regex":       return new RegExp(value, "i").test(String(actual ?? ""));
          default:            return true;
        }
      } catch { return true; }
    });
    return { output: { items: filtered, count: filtered.length, total: items.length, filtered_out: items.length - filtered.length } };
  },

  loop: async (node, input) => {
    // 배열의 각 항목에 JS 코드를 적용
    const raw = input?.items ?? input;
    const items = Array.isArray(raw) ? raw : [raw].filter(Boolean);
    const code = node.config?.code || "return item;";
    const limit = Math.min(node.config?.limit || 100, 500);

    const utils = {
      pick: (obj, keys) => keys.reduce((a, k) => { a[k] = obj?.[k]; return a; }, {}),
      omit: (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !keys.includes(k))),
      format: (date) => new Date(date).toLocaleString("ko-KR"),
      trim: (s, n = 200) => String(s || "").slice(0, n),
    };

    const results = [];
    const errors = [];

    for (let i = 0; i < Math.min(items.length, limit); i++) {
      try {
        // 항목마다 vm 샌드박스 실행 — process/require/global 접근 불가, 3초 타임아웃
        const r = runSandboxed(
          `const item = __item; const index = __index; const _ = __utils; ${code}`,
          { __item: items[i], __index: i, __utils: utils },
          3000
        );
        results.push(r ?? items[i]);
      } catch (e) {
        errors.push({ index: i, error: e.message });
        results.push(items[i]); // keep original on error
      }
    }

    return { output: { items: results, count: results.length, original_count: items.length, errors } };
  },

  delay: async (node) => {
    const seconds = Math.min(Math.max(node.config?.seconds || 1, 0), 300); // max 5 min
    await sleep(seconds * 1000);
    return { output: { waited_seconds: seconds, timestamp: new Date().toISOString() } };
  },

  http_response: async (node, input) => {
    // 웹훅 호출자에게 응답 데이터를 기록 (실제 응답은 webhook 엔드포인트에서 처리됨)
    const status = node.config?.status || 200;
    const message = resolveTemplate(node.config?.message || "", input);
    const includeData = node.config?.include_data !== false;
    return {
      output: {
        http_status: status,
        message,
        ...(includeData ? { data: input } : {}),
        timestamp: new Date().toISOString(),
      },
      _httpResponse: { status, body: message || input },
    };
  },
};

function resolveTemplate(template, input) {
  if (!template) return "";
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const keys = path.trim().split(".");
    let val = input;
    for (const k of keys) { val = val?.[k]; }
    if (val !== undefined && val !== null) return String(val);
    // 미해결 변수는 빈 문자열로 처리 (리터럴 {{...}} 노출 방지)
    return "";
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(n) { return Math.random() * n; }

// ── Workflow execution engine ────────────────────────────────

function topoSort(nodes, edges) {
  const adj = new Map();
  const inDeg = new Map();
  nodes.forEach(n => { adj.set(n.id, []); inDeg.set(n.id, 0); });
  edges.forEach(([from, to]) => {
    adj.get(from)?.push(to);
    inDeg.set(to, (inDeg.get(to) || 0) + 1);
  });
  const queue = nodes.filter(n => (inDeg.get(n.id) || 0) === 0);
  const sorted = [];
  while (queue.length) {
    const n = queue.shift();
    sorted.push(n);
    (adj.get(n.id) || []).forEach(nid => {
      inDeg.set(nid, inDeg.get(nid) - 1);
      if (inDeg.get(nid) === 0) {
        const node = nodes.find(nd => nd.id === nid);
        if (node) queue.push(node);
      }
    });
  }
  return sorted;
}

// 같은 depth(레벨)의 노드들을 그룹으로 묶어 병렬 실행 지원
function topoLevels(nodes, edges) {
  const adj = new Map();
  const inDeg = new Map();
  nodes.forEach(n => { adj.set(n.id, []); inDeg.set(n.id, 0); });
  edges.forEach(([from, to]) => {
    adj.get(from)?.push(to);
    inDeg.set(to, (inDeg.get(to) || 0) + 1);
  });
  const levels = [];
  let current = nodes.filter(n => inDeg.get(n.id) === 0);
  const visited = new Set();
  while (current.length) {
    levels.push(current);
    current.forEach(n => visited.add(n.id));
    const next = [];
    current.forEach(n => {
      (adj.get(n.id) || []).forEach(nid => {
        inDeg.set(nid, inDeg.get(nid) - 1);
        if (inDeg.get(nid) === 0 && !visited.has(nid)) {
          const node = nodes.find(nd => nd.id === nid);
          if (node) next.push(node);
        }
      });
    });
    current = next;
  }
  return levels;
}

async function executeWorkflow(workflowId, userId, ws, webhookPayload = null) {
  const wf = db.getWorkflow(workflowId);
  if (!wf || wf.userId !== userId) {
    ws.send(JSON.stringify({ type: "error", message: "Workflow not found" }));
    return;
  }

  // Load user's API keys (fall back to server .env keys)
  const userSettings = db.getSettings(userId);

  db.incrementRunCount(userId);

  const execId = uuidv4();
  const execution = {
    id: execId,
    workflowId,
    workflowName: wf.name,
    status: "running",
    startedAt: new Date().toISOString(),
    nodeResults: {},
    logs: [],
  };
  db.createExecution({ id: execId, workflowId, workflowName: wf.name, userId });

  const send = (type, data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type, executionId: execId, ...data }));
    }
  };

  send("execution:start", { workflowId, workflowName: wf.name });

  const levels = topoLevels(wf.nodes, wf.edges);
  const outputs = new Map();
  let failed = false;

  for (const levelNodes of levels) {
    if (failed) break;

    // 같은 레벨의 노드는 병렬로 실행
    const levelResults = await Promise.allSettled(
      levelNodes.map(async (node) => {
        const nodeType = node.type;
        const executor = NODE_EXECUTORS[nodeType];
        if (!executor) return;

        // Gather inputs from parent nodes
        const parentEdges = wf.edges.filter(([, to]) => to === node.id);
        const input = parentEdges.length > 0
          ? parentEdges.map(([from]) => outputs.get(from)).filter(Boolean)
          : null;
        const mergedInput = input && input.length === 1 ? input[0] : input;

        send("node:start", { nodeId: node.id, nodeType, nodeName: node.config?.name || nodeType });

        const log = (msg) => {
          const entry = { time: new Date().toISOString(), nodeId: node.id, msg };
          execution.logs.push(entry);
          send("log", entry);
        };

        // 재시도 로직
        const retryCount = Math.min(node.config?.retry_count || 0, 5);
        const retryDelay = Math.min(node.config?.retry_delay_ms || 2000, 30000);
        let lastError;

        for (let attempt = 0; attempt <= retryCount; attempt++) {
          try {
            if (attempt > 0) {
              const wait = retryDelay * attempt;
              log(`↺ 재시도 ${attempt}/${retryCount} (${wait}ms 대기)`);
              send("log", { time: new Date().toISOString(), nodeId: node.id, msg: `↺ 재시도 ${attempt}/${retryCount}` });
              await sleep(wait);
            }
            log(`▶ ${node.config?.name || nodeType} 실행${attempt > 0 ? ` (재시도 ${attempt})` : ""}`);
            const result = await executor(node, mergedInput, { webhookPayload, userSettings });
            outputs.set(node.id, result.output);
            execution.nodeResults[node.id] = { status: "done", output: result.output };
            log(`✓ ${node.config?.name || nodeType} 완료`);
            send("node:done", { nodeId: node.id, result: result.output });
            return; // success
          } catch (err) {
            lastError = err;
          }
        }

        // All retries exhausted
        execution.nodeResults[node.id] = { status: "error", error: lastError.message };
        log(`✗ ${node.config?.name || nodeType} 오류: ${lastError.message}`);
        send("node:error", { nodeId: node.id, error: lastError.message });
        throw lastError;
      })
    );

    // 레벨 내 실패 노드 확인
    for (const r of levelResults) {
      if (r.status === "rejected") {
        failed = true;
        execution.status = "failed";
        db.saveExecution({ id: execId, status: "failed", completedAt: new Date().toISOString(), nodeResults: execution.nodeResults, logs: execution.logs });
        send("execution:error", { error: r.reason?.message || "Unknown error" });
        break;
      }
    }
  }

  execution.status = "completed";
  execution.completedAt = new Date().toISOString();
  db.saveExecution({ id: execId, status: "completed", completedAt: execution.completedAt, nodeResults: execution.nodeResults, logs: execution.logs });
  send("execution:complete", {
    duration: new Date(execution.completedAt) - new Date(execution.startedAt),
    nodeCount: sorted.length,
  });
}

// ── WebSocket handler ────────────────────────────────────────

wss.on("connection", (ws) => {
  ws.userId = null;

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case "auth":
          try {
            const payload = jwt.verify(msg.token, JWT_SECRET);
            ws.userId = payload.id;
            ws.send(JSON.stringify({ type: "auth:ok", userId: ws.userId }));
          } catch {
            ws.send(JSON.stringify({ type: "error", message: "토큰이 유효하지 않습니다" }));
          }
          break;

        case "workflow:run":
          if (!ws.userId) {
            ws.send(JSON.stringify({ type: "error", message: "인증이 필요합니다" }));
            return;
          }
          if (!msg.workflowId) {
            ws.send(JSON.stringify({ type: "error", message: "workflowId required" }));
            return;
          }
          {
            const runUser = db.getUserById(ws.userId);
            if (runUser && runUser.plan === "free" && runUser.run_count >= 100) {
              ws.send(JSON.stringify({ type: "error", message: "무료 플랜 실행 한도(100회)를 초과했습니다. Pro로 업그레이드하세요." }));
              return;
            }
          }
          executeWorkflow(msg.workflowId, ws.userId, ws);
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        default:
          ws.send(JSON.stringify({ type: "error", message: `Unknown type: ${msg.type}` }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  ws.on("close", () => console.log("[WS] Client disconnected"));
});

// ── Seed demo workflows (only if DB is empty) ────────────────

if (db.isEmpty()) {
  db.createWorkflow({
    name: "이메일 자동 분류",
    nodes: [
      { id: "t1", type: "trigger", x: 80,  y: 200, config: { name: "이메일 수신", triggerType: "webhook" } },
      { id: "t2", type: "ai_agent", x: 380, y: 200, config: { name: "내용 분석", model: "gpt-4o", prompt: "이메일을 분류해주세요: 업무/스팸/개인" } },
      { id: "t3", type: "condition", x: 680, y: 200, config: { name: "분류 결과 확인", expression: "$.result", operator: "exists" } },
      { id: "t4", type: "output", x: 980, y: 200, config: { name: "라벨 적용" } },
    ],
    edges: [["t1", "t2"], ["t2", "t3"], ["t3", "t4"]],
  });
  db.createWorkflow({
    name: "뉴스 요약 → 슬랙",
    nodes: [
      { id: "n1", type: "trigger", x: 80,  y: 200, config: { name: "매일 아침 9시", triggerType: "schedule" } },
      { id: "n2", type: "api_call", x: 380, y: 200, config: { name: "뉴스 API 호출", url: "https://jsonplaceholder.typicode.com/posts/1", method: "GET" } },
      { id: "n3", type: "ai_agent", x: 680, y: 200, config: { name: "AI 요약", prompt: "다음 내용을 3줄로 요약해주세요." } },
      { id: "n4", type: "output",   x: 980, y: 200, config: { name: "슬랙 전송" } },
    ],
    edges: [["n1", "n2"], ["n2", "n3"], ["n3", "n4"]],
  });
  console.log("  ✓ Demo workflows seeded");
}

// ── Restore cron jobs on startup ─────────────────────────────
const scheduledWfs = db.listScheduledWorkflows();
scheduledWfs.forEach(registerCron);
if (scheduledWfs.length) console.log(`  ✓ Restored ${scheduledWfs.length} cron job(s)`);

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Server Error]", err.message);
  res.status(err.status || 500).json({ error: err.message || "서버 오류가 발생했습니다" });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: `API not found: ${req.method} ${req.path}` });
  }
});

// ── Start ────────────────────────────────────────────────────

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n  ◆ FlowAgent Server`);
  console.log(`  ├─ REST API:   http://localhost:${PORT}/api`);
  console.log(`  ├─ WebSocket:  ws://localhost:${PORT}/ws`);
  console.log(`  └─ Health:     http://localhost:${PORT}/api/health\n`);
});

// ── Graceful shutdown ─────────────────────────────────────────
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down...");
  server.close(() => { console.log("[Server] HTTP server closed"); process.exit(0); });
});
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught Exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled Rejection:", reason);
});
