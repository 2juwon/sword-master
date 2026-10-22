/* 랭킹 두 가지
 *  - 최고 강화: 한 도전(새 게임)에서 올라간 가장 높은 단계 (높을수록 위, 같으면 시도가 적은 사람, 그다음 먼저 올린 사람)
 *  - 클리어: 새 게임부터 +29 완성까지 걸린 실제 시간 (서버 시계로 잼, 짧을수록 위)
 * 새 게임을 시작할 때 서버가 도전 번호와 열쇠를 주고 시작 시각을 적어 둠.
 * 한계: 강화는 브라우저에서 돌아가서 저장 내용을 고친 기록까지는 막지 못함
 *   → 시작하고 너무 빨리 올라온 기록은 거절하고, 이상한 기록은 관리 페이지에서 지움
 */
import { DurableObject } from 'cloudflare:workers';

export const MAX_TIER = 29;
const KEEP = 100;
const RUN_TTL = 120 * 24 * 3600 * 1000;   // 시작하고 120일 지나면 도전 정보 정리
const STARTS_PER_HOUR = 20;
const BEST_GAP = 3000;                     // 같은 도전의 최고 기록은 3초에 한 번까지
export const MIN_CLEAR_MS = 60 * 60 * 1000; // +29까지 1시간보다 빠르면 받지 않음

// 단계 t까지 오르는 데 걸릴 수 있는 가장 짧은 시간 (빠른 강화 0.25초, 집중 강화 2초씩)
export function minMsFor(t) { return 250 * Math.min(t, 15) + 2000 * Math.max(0, t - 15); }

const hex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
export function cleanRankName(s) {
  s = String(s || '').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, 8).join('');
}
const num = (x, lo, hi) => { x = Math.floor(+x || 0); return Math.max(lo, Math.min(hi, x)); };
const pub = (e) => { const { run, ...rest } = e; return rest; };
const bestOrder = (x, y) => y.tier - x.tier || x.attempts - y.attempts || x.at - y.at;
const clearOrder = (x, y) => x.ms - y.ms || x.at - y.at;

export class Rank extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.fast = !!(env && env.FAST_TEST);
  }
  async tidy() {
    const now = Date.now();
    if (now - (this.lastTidy || 0) < 3600 * 1000) return;
    this.lastTidy = now;
    const old = await this.ctx.storage.list({ prefix: 'r:', end: 'r:' + (now - RUN_TTL).toString(36), limit: 500 });
    if (old.size) await this.ctx.storage.delete([...old.keys()]);
  }
  minMs(t) { return this.fast ? 0 : minMsFor(t); }
  minClear() { return this.fast ? 1000 : MIN_CLEAR_MS; }
  async stats() { return (await this.ctx.storage.get('stats')) || { starts: 0, clears: 0 }; }

  async start(who) {
    await this.tidy();
    const hour = Math.floor(Date.now() / 3600000);
    const lk = 'l:' + who;
    const l = (await this.ctx.storage.get(lk)) || { hour, n: 0 };
    if (l.hour !== hour) { l.hour = hour; l.n = 0; }
    if (l.n >= STARTS_PER_HOUR) return { error: '새 게임을 너무 자주 시작했어요. 잠시 뒤에 다시 해 주세요' };
    l.n += 1;
    await this.ctx.storage.put(lk, l);
    const at = Date.now();
    const id = at.toString(36) + hex(6);
    const token = hex(16);
    await this.ctx.storage.put('r:' + id, { token, at, best: 0, attempts: 0 });
    const st = await this.stats();
    st.starts += 1;
    await this.ctx.storage.put('stats', st);
    return { run: id, token, at };
  }
  async getRun(id, token) {
    if (!/^[a-z0-9]{6,12}[a-f0-9]{12}$/.test(String(id || ''))) return null;
    const r = await this.ctx.storage.get('r:' + id);
    if (!r || r.token !== String(token || '')) return null;
    return r;
  }
  // 이름이 있으면 표에 넣거나 고침 (한 도전에 한 줄)
  async upsert(board, runId, entry, order) {
    const key = 'b:' + board;
    const b = (await this.ctx.storage.get(key)) || { list: [] };
    const old = b.list.find((e) => e.run === runId);
    if (old) Object.assign(old, entry);
    else b.list.push({ id: hex(6), run: runId, ...entry });
    b.list.sort(order);
    const idx = b.list.findIndex((e) => e.run === runId);
    b.list = b.list.slice(0, KEEP);
    await this.ctx.storage.put(key, b);
    return idx >= 0 && idx < KEEP ? idx + 1 : null;
  }
  async placeIn(board, test) {
    const b = (await this.ctx.storage.get('b:' + board)) || { list: [] };
    return b.list.filter(test).length + 1;
  }

  // 최고 단계 알리기 (높아졌을 때만 바뀜)
  async best(body) {
    const r = await this.getRun(body.run, body.token);
    if (!r) return { error: '이 게임은 랭킹 도전으로 시작하지 않았어요' };
    const tier = num(body.tier, 0, MAX_TIER), attempts = num(body.attempts, 0, 1e9);
    const now = Date.now();
    if (tier > r.best) {
      if (now - r.at < this.minMs(tier)) return { error: '기록을 확인할 수 없어요 (너무 빨라요)' };
      if (r.bestAt && now - r.bestAt < BEST_GAP && !this.fast) return { error: '조금 뒤에 다시 올려 주세요' };
      r.best = tier; r.attempts = attempts; r.bestAt = now;
      await this.ctx.storage.put('r:' + body.run, r);
    }
    let place = null;
    if (r.name && r.best > 0) place = await this.upsert('best', body.run, { name: r.name, tier: r.best, attempts: r.attempts, at: r.bestAt || now }, bestOrder);
    return { ok: true, best: r.best, place, named: !!r.name };
  }
  // +29 완성 (같은 도전으로 여러 번 불러도 처음 잰 시간 그대로)
  async clear(body) {
    const r = await this.getRun(body.run, body.token);
    if (!r) return { error: '이 게임은 랭킹 도전으로 시작하지 않았어요' };
    if (!r.clearAt) {
      const now = Date.now();
      r.clearAt = now; r.ms = now - r.at;
      r.cAttempts = num(body.attempts, 0, 1e9); r.breaks = num(body.breaks, 0, 1e9);
      if (r.ms < this.minClear()) {
        r.rejected = true;
        await this.report(`너무 빠른 클리어 (${Math.round(r.ms / 60000)}분, 강화 ${r.cAttempts}번)`, body.run, r);
      } else {
        r.best = MAX_TIER; r.attempts = r.cAttempts; r.bestAt = now;
        const st = await this.stats(); st.clears += 1; await this.ctx.storage.put('stats', st);
      }
      await this.ctx.storage.put('r:' + body.run, r);
    }
    if (r.rejected) return { error: '기록이 너무 빨라서 확인할 수 없어요. 관리자에게 자동으로 알렸어요', ms: r.ms };
    let place;
    if (r.name) {
      place = await this.upsert('clear', body.run, { name: r.name, ms: r.ms, attempts: r.cAttempts, at: r.clearAt }, clearOrder);
      await this.upsert('best', body.run, { name: r.name, tier: MAX_TIER, attempts: r.cAttempts, at: r.clearAt }, bestOrder);
    } else place = await this.placeIn('clear', (e) => e.ms <= r.ms);
    return { ok: true, ms: r.ms, place, named: !!r.name };
  }
  // 이름 정하기 (한 도전에 한 번). 이미 올라간 기록이 있으면 바로 표에 들어감
  async setName(body) {
    const r = await this.getRun(body.run, body.token);
    if (!r) return { error: '이 게임은 랭킹 도전으로 시작하지 않았어요' };
    if (r.name) return { error: '이 도전은 이미 이름을 정했어요' };
    const name = cleanRankName(body.name);
    if (!name) return { error: '이름을 넣어 주세요' };
    r.name = name;
    await this.ctx.storage.put('r:' + body.run, r);
    const out = { ok: true, name };
    if (r.best > 0) out.bestPlace = await this.upsert('best', body.run, { name, tier: r.best, attempts: r.attempts, at: r.bestAt || Date.now() }, bestOrder);
    if (r.clearAt && !r.rejected) out.clearPlace = await this.upsert('clear', body.run, { name, ms: r.ms, attempts: r.cAttempts, at: r.clearAt }, clearOrder);
    return out;
  }
  async board() {
    const best = (await this.ctx.storage.get('b:best')) || { list: [] };
    const clear = (await this.ctx.storage.get('b:clear')) || { list: [] };
    const st = await this.stats();
    return { best: best.list.map(pub), clear: clear.list.map(pub), starts: st.starts, clears: st.clears };
  }
  async remove(board, id) {
    if (board !== 'best' && board !== 'clear') return false;
    const b = await this.ctx.storage.get('b:' + board);
    if (!b) return false;
    const before = b.list.length;
    b.list = b.list.filter((e) => e.id !== id);
    await this.ctx.storage.put('b:' + board, b);
    return b.list.length < before;
  }
  async report(why, id, r) {
    try {
      const inbox = this.env.INBOX.get(this.env.INBOX.idFromName('main'));
      await inbox.add({ kind: 'bug', text: '[자동] 랭킹 — ' + why, context: { auto: 'rank', run: id, at: r.at, ms: r.ms, attempts: r.cAttempts, breaks: r.breaks } }, 'rank-auto-' + id);
    } catch (e) { console.error('report', e); }
  }
}
