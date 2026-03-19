export const NODE_TYPES = {
  trigger:   { label: "Trigger",    icon: "⚡", color: "#F59E0B", desc: "워크플로우 시작점" },
  ai_agent:  { label: "AI Agent",   icon: "🤖", color: "#8B5CF6", desc: "LLM 기반 처리" },
  api_call:  { label: "API Call",   icon: "🔗", color: "#3B82F6", desc: "외부 API 호출" },
  condition: { label: "조건 분기",   icon: "◇",  color: "#EC4899", desc: "조건에 따라 분기" },
  transform: { label: "데이터 변환", icon: "⚙",  color: "#10B981", desc: "데이터 가공/변환" },
  slack:     { label: "Slack",      icon: "💬", color: "#4A154B", desc: "Slack 메시지 전송" },
  discord:   { label: "Discord",    icon: "🎮", color: "#5865F2", desc: "Discord 메시지 전송" },
  telegram:  { label: "Telegram",   icon: "✈️", color: "#26A5E4", desc: "Telegram 메시지 전송" },
  rss_feed:  { label: "RSS 피드",   icon: "📡", color: "#F97316", desc: "RSS/Atom 피드 가져오기" },
  notion:    { label: "Notion",     icon: "📝", color: "#FFFFFF", desc: "Notion 페이지/DB 생성" },
  email:     { label: "이메일",     icon: "📧", color: "#F59E0B", desc: "SendGrid로 이메일 발송" },
  output:    { label: "Output",     icon: "📤", color: "#EF4444", desc: "결과 출력" },
};

export const TEMPLATES = [
  // ── 기존 ────────────────────────────────────────────────────
  {
    name: "이메일 자동 분류",
    desc: "수신 이메일을 AI로 분석하여 자동 분류",
    category: "AI",
    nodes: [
      { id: "t1", type: "trigger",  x: 80,  y: 200, config: { name: "이메일 수신", triggerType: "webhook" } },
      { id: "t2", type: "ai_agent", x: 380, y: 200, config: { name: "내용 분석", model: "claude-sonnet", prompt: "이메일을 분류해주세요: 업무/스팸/개인" } },
      { id: "t3", type: "condition",x: 680, y: 200, config: { name: "분류 결과 확인" } },
      { id: "t4", type: "output",   x: 980, y: 200, config: { name: "라벨 적용" } },
    ],
    edges: [["t1","t2"],["t2","t3"],["t3","t4"]],
  },
  {
    name: "콘텐츠 생성 파이프라인",
    desc: "멀티 에이전트로 리서치 + 작성 자동화",
    category: "AI",
    nodes: [
      { id: "c1", type: "trigger",  x: 80,  y: 230, config: { name: "주제 입력", triggerType: "manual" } },
      { id: "c2", type: "ai_agent", x: 360, y: 110, config: { name: "리서치 에이전트", model: "claude-sonnet", prompt: "주제에 대해 핵심 포인트 5개를 조사해주세요" } },
      { id: "c3", type: "ai_agent", x: 360, y: 340, config: { name: "작성 에이전트", model: "claude-sonnet", prompt: "리서치 결과를 바탕으로 블로그 글을 작성해주세요" } },
      { id: "c4", type: "transform",x: 660, y: 230, config: { name: "포맷 변환" } },
      { id: "c5", type: "output",   x: 940, y: 230, config: { name: "발행" } },
    ],
    edges: [["c1","c2"],["c1","c3"],["c2","c4"],["c3","c4"],["c4","c5"]],
  },
  {
    name: "고객 문의 자동 응답",
    desc: "문의 분석 → 답변 생성 → 이메일 자동 발송",
    category: "이메일",
    nodes: [
      { id: "s1", type: "trigger",  x: 80,  y: 200, config: { name: "문의 접수", triggerType: "webhook" } },
      { id: "s2", type: "ai_agent", x: 360, y: 200, config: { name: "문의 분석", model: "gpt-4o-mini", prompt: "고객 문의를 분석하고 카테고리를 분류해주세요" } },
      { id: "s3", type: "ai_agent", x: 640, y: 200, config: { name: "답변 생성", model: "claude-sonnet", prompt: "분석 결과를 바탕으로 정중한 답변을 작성해주세요" } },
      { id: "s4", type: "email",    x: 920, y: 200, config: { name: "이메일 발송", subject: "문의 답변", body: "{{input.result}}" } },
    ],
    edges: [["s1","s2"],["s2","s3"],["s3","s4"]],
  },

  // ── RSS ─────────────────────────────────────────────────────
  {
    name: "뉴스 요약 → Slack",
    desc: "매일 아침 RSS 뉴스를 AI 요약해 Slack으로 전송",
    category: "RSS",
    nodes: [
      { id: "r1", type: "trigger",  x: 80,  y: 200, config: { name: "매일 오전 9시", triggerType: "schedule", cron: "0 9 * * *" } },
      { id: "r2", type: "rss_feed", x: 360, y: 200, config: { name: "뉴스 수집", url: "https://feeds.bbci.co.uk/korean/rss.xml", limit: 5 } },
      { id: "r3", type: "ai_agent", x: 640, y: 200, config: { name: "AI 요약", model: "gpt-4o-mini", prompt: "다음 뉴스 목록을 3줄로 핵심만 요약해주세요. 한국어로 작성해주세요.\n\n{{input.items}}" } },
      { id: "r4", type: "slack",    x: 920, y: 200, config: { name: "Slack 전송", message: "📰 오늘의 뉴스 요약\n\n{{input.result}}" } },
    ],
    edges: [["r1","r2"],["r2","r3"],["r3","r4"]],
  },
  {
    name: "뉴스 요약 → Telegram",
    desc: "RSS 뉴스를 AI 요약해 텔레그램으로 브리핑",
    category: "RSS",
    nodes: [
      { id: "rt1", type: "trigger",  x: 80,  y: 200, config: { name: "매일 오전 8시", triggerType: "schedule", cron: "0 8 * * *" } },
      { id: "rt2", type: "rss_feed", x: 360, y: 200, config: { name: "뉴스 수집", url: "https://feeds.bbci.co.uk/korean/rss.xml", limit: 5 } },
      { id: "rt3", type: "ai_agent", x: 640, y: 200, config: { name: "AI 요약", model: "gpt-4o-mini", prompt: "뉴스 목록을 보기 좋게 요약해주세요. 이모지 포함, 한국어로.\n\n{{input.items}}" } },
      { id: "rt4", type: "telegram", x: 920, y: 200, config: { name: "텔레그램 전송", message: "🗞 *오늘의 뉴스 브리핑*\n\n{{input.result}}" } },
    ],
    edges: [["rt1","rt2"],["rt2","rt3"],["rt3","rt4"]],
  },
  {
    name: "RSS → Notion DB 저장",
    desc: "피드 아이템을 AI 정리 후 Notion DB에 자동 저장",
    category: "RSS",
    nodes: [
      { id: "rn1", type: "trigger",  x: 80,  y: 200, config: { name: "매일 정오", triggerType: "schedule", cron: "0 12 * * *" } },
      { id: "rn2", type: "rss_feed", x: 360, y: 200, config: { name: "RSS 수집", url: "", limit: 10 } },
      { id: "rn3", type: "ai_agent", x: 640, y: 200, config: { name: "내용 정리", model: "gpt-4o-mini", prompt: "RSS 항목들의 제목과 요약을 한국어로 정리해주세요.\n\n{{input.items}}" } },
      { id: "rn4", type: "notion",   x: 920, y: 200, config: { name: "Notion 저장", title: "{{input.result}}", content: "자동 수집: {{input.url}}" } },
    ],
    edges: [["rn1","rn2"],["rn2","rn3"],["rn3","rn4"]],
  },

  // ── 알림 ────────────────────────────────────────────────────
  {
    name: "웹훅 → Discord 알림",
    desc: "외부 이벤트를 받아 AI 분석 후 Discord 전송",
    category: "알림",
    nodes: [
      { id: "w1", type: "trigger",  x: 80,  y: 200, config: { name: "웹훅 수신", triggerType: "webhook" } },
      { id: "w2", type: "ai_agent", x: 360, y: 200, config: { name: "이벤트 분석", model: "gpt-4o-mini", prompt: "수신된 데이터를 분석하고 중요도와 요약을 작성해주세요." } },
      { id: "w3", type: "discord",  x: 640, y: 200, config: { name: "Discord 알림", message: "🔔 새 이벤트\n{{input.result}}" } },
    ],
    edges: [["w1","w2"],["w2","w3"]],
  },
  {
    name: "멀티채널 알림",
    desc: "하나의 이벤트를 Slack + Discord + Telegram 동시 전송",
    category: "알림",
    nodes: [
      { id: "m1", type: "trigger",  x: 80,  y: 230, config: { name: "이벤트 수신", triggerType: "webhook" } },
      { id: "m2", type: "ai_agent", x: 360, y: 230, config: { name: "메시지 작성", model: "gpt-4o-mini", prompt: "이벤트를 간결하고 명확한 알림 메시지로 작성해주세요." } },
      { id: "m3", type: "slack",    x: 660, y: 100, config: { name: "Slack 전송", message: "{{input.result}}" } },
      { id: "m4", type: "discord",  x: 660, y: 240, config: { name: "Discord 전송", message: "{{input.result}}" } },
      { id: "m5", type: "telegram", x: 660, y: 380, config: { name: "Telegram 전송", message: "{{input.result}}" } },
    ],
    edges: [["m1","m2"],["m2","m3"],["m2","m4"],["m2","m5"]],
  },

  // ── Notion ───────────────────────────────────────────────────
  {
    name: "아이디어 → Notion 메모",
    desc: "웹훅으로 받은 아이디어를 AI 정리 후 Notion 저장",
    category: "Notion",
    nodes: [
      { id: "n1", type: "trigger",  x: 80,  y: 200, config: { name: "아이디어 입력", triggerType: "webhook" } },
      { id: "n2", type: "ai_agent", x: 360, y: 200, config: { name: "아이디어 정리", model: "claude-sonnet", prompt: "입력된 아이디어를 구조화하고 실행 가능한 액션 아이템으로 정리해주세요." } },
      { id: "n3", type: "notion",   x: 640, y: 200, config: { name: "Notion 저장", title: "아이디어: {{input.result}}", content: "{{input.result}}" } },
      { id: "n4", type: "slack",    x: 920, y: 200, config: { name: "Slack 알림", message: "✅ 새 아이디어가 Notion에 저장됐습니다." } },
    ],
    edges: [["n1","n2"],["n2","n3"],["n3","n4"]],
  },
  {
    name: "일일 리포트 → Notion + 이메일",
    desc: "매일 API 데이터를 분석해 Notion 저장 + 이메일 발송",
    category: "Notion",
    nodes: [
      { id: "d1", type: "trigger",  x: 80,  y: 230, config: { name: "매일 오후 6시", triggerType: "schedule", cron: "0 18 * * *" } },
      { id: "d2", type: "api_call", x: 340, y: 230, config: { name: "데이터 수집", url: "https://jsonplaceholder.typicode.com/posts", method: "GET" } },
      { id: "d3", type: "ai_agent", x: 600, y: 230, config: { name: "리포트 생성", model: "claude-sonnet", prompt: "수집된 데이터를 분석해 일일 리포트를 작성해주세요. 핵심 지표와 인사이트를 포함해주세요." } },
      { id: "d4", type: "notion",   x: 880, y: 110, config: { name: "Notion 저장", title: "일일 리포트", content: "{{input.result}}" } },
      { id: "d5", type: "email",    x: 880, y: 350, config: { name: "이메일 발송", subject: "일일 리포트", body: "{{input.result}}" } },
    ],
    edges: [["d1","d2"],["d2","d3"],["d3","d4"],["d3","d5"]],
  },

  // ── 모니터링 ─────────────────────────────────────────────────
  {
    name: "API 모니터링",
    desc: "주기적으로 API 상태를 체크하고 이상 시 알림",
    category: "모니터링",
    nodes: [
      { id: "ap1", type: "trigger",  x: 80,  y: 200, config: { name: "5분마다", triggerType: "schedule", cron: "*/5 * * * *" } },
      { id: "ap2", type: "api_call", x: 360, y: 200, config: { name: "헬스체크", url: "https://api.example.com/health", method: "GET" } },
      { id: "ap3", type: "condition",x: 640, y: 200, config: { name: "상태 확인" } },
      { id: "ap4", type: "slack",    x: 920, y: 200, config: { name: "장애 알림", message: "🚨 API 이상 감지!\n상태: {{input.status}}\n시간: {{input.timestamp}}" } },
    ],
    edges: [["ap1","ap2"],["ap2","ap3"],["ap3","ap4"]],
  },
  {
    name: "소셜 미디어 모니터링",
    desc: "RSS로 멘션 수집 → AI 감성 분석 → Slack 리포트",
    category: "모니터링",
    nodes: [
      { id: "sm1", type: "trigger",  x: 80,  y: 200, config: { name: "매시간", triggerType: "schedule", cron: "0 * * * *" } },
      { id: "sm2", type: "rss_feed", x: 360, y: 200, config: { name: "피드 수집", url: "", limit: 10 } },
      { id: "sm3", type: "ai_agent", x: 640, y: 200, config: { name: "감성 분석", model: "gpt-4o-mini", prompt: "다음 피드 항목들의 감성을 분석하고(긍정/부정/중립) 주요 키워드를 추출해주세요.\n\n{{input.items}}" } },
      { id: "sm4", type: "slack",    x: 920, y: 200, config: { name: "분석 리포트", message: "📊 소셜 미디어 분석\n{{input.result}}" } },
    ],
    edges: [["sm1","sm2"],["sm2","sm3"],["sm3","sm4"]],
  },
];

export const API_BASE = "/api";
export const WS_URL = `ws://${window.location.hostname}:4000/ws`;
