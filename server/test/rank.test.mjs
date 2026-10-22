// 로컬 서버 시험: cd server && npx wrangler dev --var FAST_TEST:1 --var ADMIN_KEY:test  →  node test/rank.test.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗', m); } else console.log('✓', m); };
const post = (p, b, h = {}) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b || {}) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const get = (p, h = {}) => fetch(BASE + p, { headers: h }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const a = await post('/api/run/start');
ok(a.run && a.token && a.at, '새 게임 시작하면 도전 번호·열쇠를 줌');
const bad = await post('/api/run/best', { run: a.run, token: 'x' + a.token.slice(1), tier: 5, attempts: 6 });
ok(bad.error, '열쇠가 틀리면 거절');
const b1 = await post('/api/run/best', { run: a.run, token: a.token, tier: 12, attempts: 40 });
ok(b1.ok && b1.best === 12 && b1.place === null && !b1.named, '이름 없으면 최고 기록만 적어 둠');
const nm = await post('/api/run/name', { run: a.run, token: a.token, name: '  <대장장이>   김씨이름이길어 ' });
ok(nm.ok && nm.name === '대장장이 김씨이' && nm.bestPlace === 1, '이름 정하면 바로 표에 들어감 ' + nm.name);
const nm2 = await post('/api/run/name', { run: a.run, token: a.token, name: '또' });
ok(nm2.error, '이름은 한 도전에 한 번');
const low = await post('/api/run/best', { run: a.run, token: a.token, tier: 8, attempts: 99 });
ok(low.ok && low.best === 12, '더 낮은 단계는 최고 기록을 바꾸지 않음');
const up = await post('/api/run/best', { run: a.run, token: a.token, tier: 17, attempts: 120 });
ok(up.ok && up.best === 17 && up.place === 1, '더 높아지면 같은 줄이 고쳐짐');

const c = await post('/api/run/start');
await post('/api/run/name', { run: c.run, token: c.token, name: '둘째' });
const c1 = await post('/api/run/best', { run: c.run, token: c.token, tier: 17, attempts: 300 });
ok(c1.place === 2, '같은 단계면 시도가 많은 사람이 아래');
const c2 = await post('/api/run/best', { run: c.run, token: c.token, tier: 18, attempts: 320 });
ok(c2.place === 1, '더 높은 단계면 위로');
let bd = await get('/api/rank');
ok(bd.best.length === 2 && bd.best[0].name === '둘째' && bd.best[1].tier === 17 && !('run' in bd.best[0]), '최고 강화 표 (도전 번호는 안 보임)');

// 클리어
const early = await post('/api/run/clear', { run: c.run, token: c.token, attempts: 5000 });
ok(early.error && /빨라서/.test(early.error), '1초 안에 깬 기록은 너무 빠르다고 거절');
await sleep(1200);
const cl = await post('/api/run/clear', { run: a.run, token: a.token, attempts: 77777, breaks: 9000 });
ok(cl.ok && cl.ms >= 1200 && cl.place === 1 && cl.named, '서버 시계로 걸린 시간을 재고 클리어 표에 들어감 ' + cl.ms);
await sleep(200);
const cl2 = await post('/api/run/clear', { run: a.run, token: a.token, attempts: 1 });
ok(cl2.ms === cl.ms, '다시 알려도 처음 잰 시간 그대로');
const d = await post('/api/run/start');
await sleep(1500);
const dc = await post('/api/run/clear', { run: d.run, token: d.token, attempts: 50000 });
ok(dc.ok && !dc.named && dc.place === 2, '이름 없이 깨면 예상 순위만');
const dn = await post('/api/run/name', { run: d.run, token: d.token, name: '셋째' });
ok(dn.ok && dn.clearPlace === 2 && dn.bestPlace === 1, '깬 뒤에 이름을 정해도 두 표에 다 들어감');
bd = await get('/api/rank');
ok(bd.clear.length === 2 && bd.clear[0].name === '대장장이 김씨이' && bd.best[0].tier === 29, '클리어 표 시간 순서, 최고 강화는 +29 ' + bd.best.map((e) => e.name + e.tier).join(','));
ok(bd.starts >= 3 && bd.clears === 2, '시작·클리어 횟수 ' + bd.starts + '/' + bd.clears);

// 관리
const adm0 = await get('/api/admin/rank', { 'x-admin-key': 'nope' });
ok(adm0.status === 401, '관리자 비밀번호 틀리면 거절');
const adm = await get('/api/admin/rank', { 'x-admin-key': 'test' });
const del = await fetch(BASE + '/api/admin/rank/best/' + adm.best[1].id, { method: 'DELETE', headers: { 'x-admin-key': 'test' } }).then((r) => r.json());
ok(del.ok, '관리자가 기록 지우기');
const fb = await get('/api/admin/feedback', { 'x-admin-key': 'test' });
ok(fb.items.some((i) => /너무 빠른 클리어/.test(i.text)), '너무 빠른 클리어는 의견함에 자동 신고');
const f = await post('/api/feedback', { kind: 'idea', text: '재밌어요', context: { tier: 3 } });
ok(f.ok, '의견 보내기');
const f2 = await post('/api/feedback', { kind: 'idea', text: '또' });
ok(f2.error, '연달아 보내면 잠시 뒤에');
console.log(`\n${n - fails}/${n} 통과`);
process.exit(fails ? 1 : 0);
