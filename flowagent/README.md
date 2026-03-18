# ◆ FlowAgent - AI Workflow Builder MVP

노코드로 AI 에이전트 워크플로우를 만드는 빌더.  
노드를 드래그 앤 드롭으로 연결하고, 실행하면 WebSocket으로 실시간 로그가 스트리밍됩니다.

## 스택

- **Frontend**: React 18 + CSS-in-JS
- **Backend**: Express + WebSocket (ws)
- **실행 엔진**: 토폴로지 정렬 기반 순차 실행 (병렬 확장 가능)
- **상태**: In-memory (DB 연결 TODO)

## 빠른 시작

```bash
# 1. 의존성 설치
cd server && npm install
cd ../client && npm install
cd ..

# 2. 서버 실행 (터미널 1)
cd server && node server.js

# 3. 클라이언트 실행 (터미널 2)
cd client && npm start
```

서버: `http://localhost:4000` (REST + WebSocket)  
클라이언트: `http://localhost:3000` (proxy → 4000)

## 프로젝트 구조

```
flowagent/
├── server/
│   ├── server.js          # Express + WS + 워크플로우 실행 엔진
│   └── package.json
├── client/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.js             # 메인 캔버스 + 상태 관리
│       ├── index.js
│       ├── index.css
│       ├── components/
│       │   ├── NodeCard.js    # 드래그 가능한 노드 카드
│       │   ├── EdgeLine.js    # 베지어 커브 연결선
│       │   ├── Sidebar.js     # 노드 추가 / 템플릿 / 저장 목록
│       │   ├── ConfigPanel.js # 노드별 설정 패널
│       │   └── LogPanel.js    # 실행 로그 뷰
│       ├── hooks/
│       │   ├── useWebSocket.js    # WS 연결 + 실행 상태 관리
│       │   └── useWorkflowAPI.js  # REST CRUD 훅
│       └── utils/
│           └── constants.js   # 노드 타입, 템플릿, API 설정
└── package.json               # 루트 (concurrently)
```

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/workflows` | 워크플로우 목록 |
| GET | `/api/workflows/:id` | 워크플로우 상세 |
| POST | `/api/workflows` | 워크플로우 생성 |
| PUT | `/api/workflows/:id` | 워크플로우 수정 |
| DELETE | `/api/workflows/:id` | 워크플로우 삭제 |
| GET | `/api/executions` | 실행 이력 |

## WebSocket 메시지

**Client → Server:**
```json
{ "type": "workflow:run", "workflowId": "uuid" }
```

**Server → Client:**
```json
{ "type": "execution:start", "executionId": "uuid", "workflowName": "..." }
{ "type": "node:start", "nodeId": "n1", "nodeType": "trigger" }
{ "type": "node:done", "nodeId": "n1", "result": { ... } }
{ "type": "log", "nodeId": "n1", "msg": "▶ 이메일 수신 실행 시작" }
{ "type": "execution:complete", "duration": 3200, "nodeCount": 4 }
```

## 노드 타입

| 타입 | 아이콘 | 설명 |
|------|--------|------|
| trigger | ⚡ | Webhook, 스케줄, 수동, 이메일 트리거 |
| ai_agent | 🤖 | LLM 호출 (모델/프롬프트/온도 설정) |
| api_call | 🔗 | 외부 HTTP API 호출 |
| condition | ◇ | 조건 분기 |
| transform | ⚙ | 데이터 변환 (JS 코드) |
| output | 📤 | 결과 출력/전송 |

## 다음 단계 (TODO)

### Phase 1 - 실제 동작
- [ ] AI Agent 노드에 실제 LLM API 연결 (Anthropic SDK)
- [ ] API Call 노드에 실제 HTTP 요청 연결
- [ ] Transform 노드에 샌드박스 JS 실행기 연결
- [ ] Condition 노드에 JSONPath 기반 조건 평가

### Phase 2 - 인프라
- [ ] SQLite/PostgreSQL로 영속 저장소 전환
- [ ] 사용자 인증 (JWT)
- [ ] Docker Compose 배포 설정
- [ ] Cloudflare Workers 엣지 배포

### Phase 3 - 제품
- [ ] 워크플로우 공유/마켓플레이스
- [ ] Webhook 엔드포인트 자동 생성
- [ ] 스케줄 실행 (node-cron)
- [ ] 에러 알림 (Slack, 이메일)
- [ ] 실행 이력 대시보드

## 라이선스

MIT
