/* 한판 검 강화 서버 (Cloudflare Workers + Durable Objects)
 * - Rank: 최고 강화 랭킹 + 클리어(+29) 시간 랭킹
 * - Inbox: 의견·고장 신고함, 관리 페이지 /admin
 * - Save: 계정 연동(연동 코드로 다른 기기에서 이어 하기)
 */
import { Inbox, ADMIN_HTML } from './inbox.js';
import { Rank } from './rank.js';
import { Save, newCode, cleanCode, fmtCode, MAX_SAVE } from './save.js';
export { Inbox, Rank, Save };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
});
const inboxStub = (env) => env.INBOX.get(env.INBOX.idFromName('main'));
const rankStub = (env) => env.RANK.get(env.RANK.idFromName('main'));
function adminOk(request, env) {
  const want = env.ADMIN_KEY || '';
  const got = request.headers.get('x-admin-key') || '';
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
async function body(request, max = 8000) {
  if (+(request.headers.get('content-length') || 0) > max) return null;
  try { const b = await request.json(); return b && typeof b === 'object' ? b : {}; } catch (e) { return null; }
}
const saveStub = (env, code) => env.SAVE.get(env.SAVE.idFromName('code:' + code));
const limits = (env) => env.SAVE.get(env.SAVE.idFromName('limits'));
// 저장 내용: 게임 상태 객체만, 크기 제한
function saveData(b) {
  const d = b && b.data;
  if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.money !== 'number' || typeof d.tier !== 'number') return null;
  const s = JSON.stringify(d);
  return s.length <= MAX_SAVE ? JSON.parse(s) : null;
}
const who = (request) => request.headers.get('CF-Connecting-IP') || 'anon';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (p === '/api/run/start' && request.method === 'POST') {
        const r = await rankStub(env).start(who(request));
        return json(r, r.error ? 429 : 200);
      }
      const m = p.match(/^\/api\/run\/(best|clear|name)$/);
      if (m && request.method === 'POST') {
        const b = await body(request);
        if (!b) return json({ error: '보낸 내용을 읽지 못했어요' }, 400);
        const s = rankStub(env);
        const r = m[1] === 'best' ? await s.best(b) : m[1] === 'clear' ? await s.clear(b) : await s.setName(b);
        return json(r, r.error ? 400 : 200);
      }
      if (p === '/api/save' && request.method === 'POST') {
        const data = saveData(await body(request, MAX_SAVE + 2000));
        if (!data) return json({ error: '저장할 게임 내용이 이상해요' }, 400);
        if (!(await limits(env).hit('new', who(request), 10))) return json({ error: '연동 코드를 너무 자주 만들었어요. 잠시 뒤에 다시 해 주세요' }, 429);
        for (let i = 0; i < 3; i++) {
          const code = newCode();
          const r = await saveStub(env, code).create(data);
          if (!r.error) return json({ code: fmtCode(code), rev: r.rev, at: r.at });
        }
        return json({ error: '코드를 만들지 못했어요. 다시 해 주세요' }, 500);
      }
      const sm = p.match(/^\/api\/save\/([A-Za-z0-9-]{12,16})$/);
      if (sm) {
        const code = cleanCode(sm[1]);
        if (!code) return json({ error: '연동 코드는 12자리예요' }, 400);
        if (request.method === 'GET') {
          const r = await saveStub(env, code).read();
          if (r) return json({ code: fmtCode(code), ...r });
          if (!(await limits(env).hit('miss', who(request), 30))) return json({ error: '없는 코드를 너무 많이 넣었어요. 한 시간 뒤에 다시 해 주세요' }, 429);
          return json({ error: '그런 연동 코드가 없어요' }, 404);
        }
        if (request.method === 'POST') {
          const b = await body(request, MAX_SAVE + 2000);
          const data = saveData(b);
          if (!data) return json({ error: '저장할 게임 내용이 이상해요' }, 400);
          if (!(await limits(env).hit('put', who(request), 1200))) return json({ error: '너무 자주 저장했어요' }, 429);
          const r = await saveStub(env, code).write(data, b.baseRev);
          if (r.missing) return json({ error: '그런 연동 코드가 없어요' }, 404);
          if (r.conflict) return json({ conflict: true, rev: r.rev, at: r.at, data: r.data }, 409);
          return json(r);
        }
      }
      if (p === '/api/rank' && request.method === 'GET') return json(await rankStub(env).board());
      if (p === '/api/stats') { const b = await rankStub(env).board(); return json({ starts: b.starts, clears: b.clears }); }
      if (p === '/api/feedback' && request.method === 'POST') {
        const b = await body(request, 40000);
        if (!b) return json({ error: '보낸 내용을 읽지 못했어요' }, 400);
        const r = await inboxStub(env).add({ ...b, ua: request.headers.get('User-Agent') || '' }, who(request));
        return json(r, r.error ? 429 : 200);
      }
      if (p === '/admin') return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex', 'cache-control': 'no-store' } });
      if (p.startsWith('/api/admin/')) {
        if (!env.ADMIN_KEY) return json({ error: '관리자 비밀번호(ADMIN_KEY)가 아직 설정되지 않았어요' }, 503);
        if (!adminOk(request, env)) return json({ error: '비밀번호가 맞지 않아요' }, 401);
        if (p === '/api/admin/feedback' && request.method === 'GET') return json({ items: await inboxStub(env).list() });
        const fm = p.match(/^\/api\/admin\/feedback\/([\w-]{6,40})$/);
        if (fm && request.method === 'POST') {
          const b = (await body(request)) || {};
          return json({ ok: await inboxStub(env).setStatus(fm[1], b.status) });
        }
        if (fm && request.method === 'DELETE') return json({ ok: await inboxStub(env).remove(fm[1]) });
        if (p === '/api/admin/rank' && request.method === 'GET') return json(await rankStub(env).board());
        const rm = p.match(/^\/api\/admin\/rank\/(best|clear)\/([a-f0-9]{12})$/);
        if (rm && request.method === 'DELETE') return json({ ok: await rankStub(env).remove(rm[1], rm[2]) });
        return json({ error: 'not found' }, 404);
      }
      if (p === '/') return new Response('한판 검 강화 서버가 돌고 있어요', { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
      return json({ error: 'not found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: '서버 오류가 났어요' }, 500);
    }
  },
};
