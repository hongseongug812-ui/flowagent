const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Router } = require("express");
const db = require("./db");

const SECRET = process.env.JWT_SECRET || "flowagent-dev-secret";
const FREE_RUN_LIMIT = 100;

// ── Helpers ──────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, plan: user.plan }, SECRET, { expiresIn: "7d" });
}

// ── Middleware ───────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "인증이 필요합니다" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "토큰이 유효하지 않습니다" });
  }
}

function checkRunLimit(req, res, next) {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(401).json({ error: "유저를 찾을 수 없습니다" });
  if (user.plan === "free" && user.run_count >= FREE_RUN_LIMIT) {
    return res.status(403).json({ error: `무료 플랜은 월 ${FREE_RUN_LIMIT}회 실행 제한입니다. 업그레이드하세요.` });
  }
  next();
}

// ── Auth Router ──────────────────────────────────────────────

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "이메일과 비밀번호를 입력하세요" });
  if (password.length < 6) return res.status(400).json({ error: "비밀번호는 6자 이상이어야 합니다" });

  if (db.getUserByEmail(email)) return res.status(409).json({ error: "이미 사용 중인 이메일입니다" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = db.createUser({ email, passwordHash });
  res.status(201).json({ token: signToken(user), user: { id: user.id, email: user.email, plan: user.plan } });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "이메일과 비밀번호를 입력하세요" });

  const user = db.getUserByEmail(email);
  if (!user) return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });

  res.json({ token: signToken(user), user: { id: user.id, email: user.email, plan: user.plan } });
});

// GET /api/auth/me
router.get("/me", authMiddleware, (req, res) => {
  const user = db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ id: user.id, email: user.email, plan: user.plan, runCount: user.run_count });
});

module.exports = { router, authMiddleware, checkRunLimit, signToken };
