const Database = require("better-sqlite3");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DB_PATH = path.join(__dirname, "data", "flowagent.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

// ── Migrations ───────────────────────────────────────────────
function columnExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
}

// ── Schema ───────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    plan          TEXT NOT NULL DEFAULT 'free',
    run_count     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workflows (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL DEFAULT 'demo',
    name       TEXT NOT NULL,
    nodes      TEXT NOT NULL DEFAULT '[]',
    edges      TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS executions (
    id            TEXT PRIMARY KEY,
    workflow_id   TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    user_id       TEXT NOT NULL DEFAULT 'demo',
    status        TEXT NOT NULL DEFAULT 'running',
    started_at    TEXT NOT NULL,
    completed_at  TEXT,
    node_results  TEXT NOT NULL DEFAULT '{}',
    logs          TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL,
    remind_at   TEXT NOT NULL,
    platform    TEXT,
    chat_id     TEXT,
    sent        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );
`);

// ── Apply migrations ─────────────────────────────────────────
if (!columnExists("workflows", "user_id")) {
  db.exec("ALTER TABLE workflows ADD COLUMN user_id TEXT NOT NULL DEFAULT 'demo'");
}
if (!columnExists("executions", "user_id")) {
  db.exec("ALTER TABLE executions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'demo'");
}
if (!columnExists("workflows", "schedule_cron")) {
  db.exec("ALTER TABLE workflows ADD COLUMN schedule_cron TEXT");
  db.exec("ALTER TABLE workflows ADD COLUMN schedule_enabled INTEGER NOT NULL DEFAULT 0");
}
if (!columnExists("workflows", "webhook_token")) {
  db.exec("ALTER TABLE workflows ADD COLUMN webhook_token TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_webhook_token ON workflows(webhook_token) WHERE webhook_token IS NOT NULL");
}
if (!columnExists("users", "settings")) {
  db.exec("ALTER TABLE users ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'");
}

// ── Helpers ──────────────────────────────────────────────────

function parseWf(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    nodes: JSON.parse(row.nodes),
    edges: JSON.parse(row.edges),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scheduleCron: row.schedule_cron || null,
    scheduleEnabled: !!row.schedule_enabled,
    webhookToken: row.webhook_token || null,
  };
}

function parseExec(row) {
  if (!row) return null;
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    nodeResults: JSON.parse(row.node_results),
    logs: JSON.parse(row.logs),
  };
}

// ── Statements ───────────────────────────────────────────────

const stmts = {
  // Users
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  getUserById:    db.prepare("SELECT * FROM users WHERE id = ?"),
  insertUser:     db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"),
  incrementRun:   db.prepare("UPDATE users SET run_count = run_count + 1 WHERE id = ?"),

  // Workflows
  listWorkflows:  db.prepare("SELECT * FROM workflows WHERE user_id = ? ORDER BY updated_at DESC"),
  getWorkflow:    db.prepare("SELECT * FROM workflows WHERE id = ?"),
  insertWorkflow: db.prepare(
    "INSERT INTO workflows (id, user_id, name, nodes, edges, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ),
  updateWorkflow: db.prepare(
    "UPDATE workflows SET name = ?, nodes = ?, edges = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ),
  deleteWorkflow: db.prepare("DELETE FROM workflows WHERE id = ? AND user_id = ?"),
  updateSchedule: db.prepare(
    "UPDATE workflows SET schedule_cron = ?, schedule_enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ),
  listScheduled:       db.prepare("SELECT * FROM workflows WHERE schedule_enabled = 1"),
  getByWebhookToken:   db.prepare("SELECT * FROM workflows WHERE webhook_token = ?"),
  setWebhookToken:     db.prepare("UPDATE workflows SET webhook_token = ?, updated_at = ? WHERE id = ? AND user_id = ?"),

  // Executions
  insertExecution: db.prepare(
    "INSERT INTO executions (id, workflow_id, workflow_name, user_id, status, started_at, node_results, logs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ),
  updateExecution: db.prepare(
    "UPDATE executions SET status = ?, completed_at = ?, node_results = ?, logs = ? WHERE id = ?"
  ),
  listExecutions: db.prepare(
    "SELECT * FROM executions WHERE user_id = ? ORDER BY started_at DESC LIMIT 50"
  ),
  countWorkflows: db.prepare("SELECT COUNT(*) as cnt FROM workflows"),

  // Waitlist
  insertWaitlist:   db.prepare("INSERT OR IGNORE INTO waitlist (id, email, created_at) VALUES (?, ?, ?)"),
  countWaitlist:    db.prepare("SELECT COUNT(*) as cnt FROM waitlist"),

  // Plan upgrade
  upgradePlan:      db.prepare("UPDATE users SET plan = ? WHERE id = ?"),
};

// ── Users ────────────────────────────────────────────────────

module.exports = {
  getUserByEmail(email) { return stmts.getUserByEmail.get(email); },
  getUserById(id)        { return stmts.getUserById.get(id); },
  createUser({ email, passwordHash }) {
    const id = uuidv4();
    stmts.insertUser.run(id, email, passwordHash, new Date().toISOString());
    return this.getUserById(id);
  },
  incrementRunCount(userId) { stmts.incrementRun.run(userId); },

  // ── Workflows ──────────────────────────────────────────────
  listWorkflows(userId) {
    return stmts.listWorkflows.all(userId).map(parseWf);
  },
  getWorkflow(id) {
    return parseWf(stmts.getWorkflow.get(id));
  },
  createWorkflow({ userId = "demo", name, nodes = [], edges = [] }) {
    const id = uuidv4();
    const now = new Date().toISOString();
    stmts.insertWorkflow.run(id, userId, name || "Untitled Workflow", JSON.stringify(nodes), JSON.stringify(edges), now, now);
    return this.getWorkflow(id);
  },
  updateWorkflow(id, userId, { name, nodes, edges }) {
    const wf = this.getWorkflow(id);
    if (!wf) return null;
    stmts.updateWorkflow.run(
      name ?? wf.name,
      nodes !== undefined ? JSON.stringify(nodes) : JSON.stringify(wf.nodes),
      edges !== undefined ? JSON.stringify(edges) : JSON.stringify(wf.edges),
      new Date().toISOString(),
      id, userId
    );
    return this.getWorkflow(id);
  },
  deleteWorkflow(id, userId) { stmts.deleteWorkflow.run(id, userId); },
  setSchedule(id, userId, { cron, enabled }) {
    stmts.updateSchedule.run(cron || null, enabled ? 1 : 0, new Date().toISOString(), id, userId);
    return this.getWorkflow(id);
  },
  listScheduledWorkflows() {
    return stmts.listScheduled.all().map(parseWf);
  },
  getByWebhookToken(token) {
    return parseWf(stmts.getByWebhookToken.get(token));
  },
  setWebhookToken(id, userId, token) {
    stmts.setWebhookToken.run(token, new Date().toISOString(), id, userId);
    return this.getWorkflow(id);
  },

  // ── Executions ─────────────────────────────────────────────
  createExecution({ id, workflowId, workflowName, userId = "demo" }) {
    const now = new Date().toISOString();
    stmts.insertExecution.run(id, workflowId, workflowName, userId, "running", now, "{}", "[]");
  },
  saveExecution({ id, status, completedAt, nodeResults, logs }) {
    stmts.updateExecution.run(status, completedAt || null, JSON.stringify(nodeResults), JSON.stringify(logs), id);
  },
  listExecutions(userId) {
    return stmts.listExecutions.all(userId).map(parseExec);
  },

  // ── Waitlist ───────────────────────────────────────────────
  addToWaitlist(email) {
    const existing = db.prepare("SELECT id FROM waitlist WHERE email = ?").get(email);
    if (existing) return { alreadyExists: true };
    stmts.insertWaitlist.run(uuidv4(), email, new Date().toISOString());
    return { alreadyExists: false };
  },
  getWaitlistCount() { return stmts.countWaitlist.get().cnt; },

  // ── Plan ──────────────────────────────────────────────────
  upgradePlan(userId, plan) { stmts.upgradePlan.run(plan, userId); },

  // ── Reminders ─────────────────────────────────────────────
  createReminder({ userId, title, remindAt, platform, chatId }) {
    const id = uuidv4();
    db.prepare(
      "INSERT INTO reminders (id, user_id, title, remind_at, platform, chat_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, userId, title, remindAt, platform || null, chatId || null, new Date().toISOString());
    return db.prepare("SELECT * FROM reminders WHERE id = ?").get(id);
  },
  listReminders(userId) {
    return db.prepare("SELECT * FROM reminders WHERE user_id = ? AND sent = 0 ORDER BY remind_at ASC").all(userId);
  },
  deleteReminder(id, userId) {
    db.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?").run(id, userId);
  },
  getDueReminders() {
    const now = new Date().toISOString();
    return db.prepare("SELECT * FROM reminders WHERE remind_at <= ? AND sent = 0").all(now);
  },
  markReminderSent(id) {
    db.prepare("UPDATE reminders SET sent = 1 WHERE id = ?").run(id);
  },
  // chatId로 유저 찾기 (settings JSON에 저장된 chat_id 매칭)
  findUsersByChatId(platform, chatId) {
    const allUsers = db.prepare("SELECT * FROM users").all();
    return allUsers.filter(u => {
      try {
        const s = JSON.parse(u.settings || "{}");
        if (platform === "telegram") return s.telegram_chat_id === chatId;
        if (platform === "discord") return s.discord_channel_id === chatId;
        if (platform === "slack")   return s.slack_channel_id === chatId;
      } catch { return false; }
    });
  },

  // ── Settings ──────────────────────────────────────────────
  getSettings(userId) {
    const row = stmts.getUserById.get(userId);
    if (!row) return {};
    try { return JSON.parse(row.settings || "{}"); } catch { return {}; }
  },
  saveSettings(userId, settings) {
    db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(settings), userId);
  },

  // ── Seed ───────────────────────────────────────────────────
  isEmpty() { return stmts.countWorkflows.get().cnt === 0; },
};
