# 한판 검 강화

녹슨 철검을 **+29 태초의 불꽃검**까지 두들기는 검 강화 게임이에요.
옛 플래시 게임 「검 강화하기」(NBS)를 바탕으로 새로 만든 팬 게임이고, 검 이름·그림·수치는 따로 정했어요.

- 바로 하기: https://2juwon.github.io/sword-master/
- 랭킹·의견 서버: https://sword-master.2juwon.workers.dev (관리 페이지 `/admin`)

## 이렇게 놀아요

- **강화하기**를 누르면 망치가 내려칩니다. 성공하면 한 단계 오르고, 실패하면 검이 부서져요.
- **빠른 강화**(+0~+14): 누르는 대로 바로바로.
- **집중 강화**(+15부터): 망치 세 번 + 뜸 들이기. 바늘이 금색 칸에서 +5%p, 주황 칸에서 +2%p.
- **한 번 버팀**: 성공 확률 70% 이상에서 실패하면 금만 가요. 금 간 채로 또 실패하면 부서져요.
- **집념**: +8 이상에서 부서질 때마다 다음 성공까지 +0.5%p (최대 +5%p).
- **깨짐 방지권**으로 부서진 검을 되살려요(+26부터는 안 돼요). 돈은 검을 팔아서만 벌어요.
- +6~+16에서 부서지면 **잔해**가 나와요. 조합소에서 방지권이나 검으로 바꿔요.
- +21·+22·+24 강화에는 **보관한 검**이, +23·+25·+27엔 잔해가 재료로 들어가요.
- **랭킹**: 최고 강화(이번 도전에서 오른 가장 높은 단계) / +29 클리어 시간(서버 시계로 잼).

## 파일

| 경로 | 내용 |
|---|---|
| `src/sword.html` | 게임 전부 (화면·규칙·검 그림·효과음) |
| `build.js` | `src/sword.html` → `index.html`(Pages, 서버 주소 넣음), `dist/sword.html`(claude.ai 아티팩트용, 서버 없음) |
| `config.json` | 서버 주소 |
| `server/` | Cloudflare Workers + Durable Objects (랭킹 `Rank`, 의견함 `Inbox`, 관리 페이지) |
| `test/sim.js` | 봇으로 +29까지 걸리는 시도·시간 추정 (`node test/sim.js avg 30`) |
| `server/test/rank.test.mjs` | 서버 시험 |

## 고치는 법

1. `src/sword.html`을 고치고 `node build.js` → `index.html` 커밋·푸시 (Pages가 다시 올림)
2. 서버(`server/`)를 고치면 `main`에 푸시할 때 Actions '서버 배포'가 Cloudflare에 올려요.
   저장소 Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_KEY`(관리 페이지 비밀번호)
3. 서버 시험: `cd server && npx wrangler dev --var FAST_TEST:1 --var ADMIN_KEY:test` → `node test/rank.test.mjs`

저장은 각자 브라우저에만 돼요(localStorage `hanpan-sword-v1`).
