export const NODE_TYPES = {
  trigger:   { label: "Trigger",    icon: "⚡", color: "#F59E0B", desc: "워크플로우 시작점" },
  ai_agent:  { label: "AI Agent",   icon: "🤖", color: "#8B5CF6", desc: "LLM 기반 처리" },
  api_call:  { label: "API Call",   icon: "🔗", color: "#3B82F6", desc: "외부 API 호출" },
  condition: { label: "조건 분기",   icon: "◇",  color: "#EC4899", desc: "조건에 따라 분기" },
  transform: { label: "데이터 변환", icon: "⚙",  color: "#10B981", desc: "데이터 가공/변환" },
  output:    { label: "Output",     icon: "📤", color: "#EF4444", desc: "결과 출력" },
};

export const TEMPLATES = [
  {
    name: "이메일 자동 분류",
    desc: "수신 이메일을 AI로 분석하여 자동 분류",
    nodes: [
      { id: "t1", type: "trigger", x: 80, y: 200, config: { name: "이메일 수신", triggerType: "webhook" } },
      { id: "t2", type: "ai_agent", x: 380, y: 200, config: { name: "내용 분석", model: "claude-sonnet", prompt: "이메일을 분류해주세요: 업무/스팸/개인" } },
      { id: "t3", type: "condition", x: 680, y: 200, config: { name: "분류 결과 확인" } },
      { id: "t4", type: "output", x: 980, y: 200, config: { name: "라벨 적용" } },
    ],
    edges: [["t1", "t2"], ["t2", "t3"], ["t3", "t4"]],
  },
  {
    name: "콘텐츠 생성 파이프라인",
    desc: "멀티 에이전트로 리서치 + 작성 자동화",
    nodes: [
      { id: "c1", type: "trigger", x: 80, y: 200, config: { name: "주제 입력", triggerType: "manual" } },
      { id: "c2", type: "ai_agent", x: 380, y: 120, config: { name: "리서치 에이전트", model: "claude-sonnet", prompt: "주제에 대해 핵심 포인트 5개를 조사해주세요" } },
      { id: "c3", type: "ai_agent", x: 380, y: 300, config: { name: "작성 에이전트", model: "claude-sonnet", prompt: "리서치 결과를 바탕으로 블로그 글을 작성해주세요" } },
      { id: "c4", type: "transform", x: 680, y: 200, config: { name: "포맷 변환" } },
      { id: "c5", type: "output", x: 980, y: 200, config: { name: "발행" } },
    ],
    edges: [["c1", "c2"], ["c1", "c3"], ["c2", "c4"], ["c3", "c4"], ["c4", "c5"]],
  },
  {
    name: "고객 문의 자동 응답",
    desc: "문의 분석 → 답변 생성 → 자동 발송",
    nodes: [
      { id: "s1", type: "trigger", x: 80, y: 200, config: { name: "문의 접수", triggerType: "webhook" } },
      { id: "s2", type: "ai_agent", x: 380, y: 200, config: { name: "문의 분석", model: "claude-haiku", prompt: "고객 문의를 분석하고 카테고리를 분류해주세요" } },
      { id: "s3", type: "ai_agent", x: 680, y: 200, config: { name: "답변 생성", model: "claude-sonnet", prompt: "분석 결과를 바탕으로 정중한 답변을 작성해주세요" } },
      { id: "s4", type: "api_call", x: 980, y: 200, config: { name: "이메일 발송", url: "https://api.sendgrid.com/v3/mail/send" } },
    ],
    edges: [["s1", "s2"], ["s2", "s3"], ["s3", "s4"]],
  },
];

export const API_BASE = "/api";
export const WS_URL = `ws://${window.location.hostname}:4000/ws`;
