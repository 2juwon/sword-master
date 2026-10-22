/* 계정 연동: 연동 코드 하나에 저장 하나 (코드마다 Durable Object 하나)
 * - 코드는 12자리(헷갈리는 0·O·1·I 뺀 32글자) = 약 60비트라 맞혀서 찾기 어려움. 코드가 곧 열쇠
 * - rev(고친 횟수)로 두 기기가 동시에 덮어쓰는 걸 막음: 보낸 baseRev가 지금 rev와 다르면 409와 함께 서버 기록을 돌려줌
 * - 'limits' 이름의 인스턴스는 IP별 횟수 제한에만 씀
 */
import { DurableObject } from 'cloudflare:workers';

export const CODE_ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const MAX_SAVE = 40000;

export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (let i = 0; i < 12; i++) s += CODE_ABC[b[i] & 31];
  return s;
}
// 사람이 넣은 코드 다듬기: 대소문자·띄어쓰기·하이픈 무시
export function cleanCode(s) {
  const c = String(s || '').toUpperCase().replace(/[\s-]/g, '');
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(c) ? c : null;
}
export const fmtCode = (c) => c.slice(0, 4) + '-' + c.slice(4, 8) + '-' + c.slice(8);

export class Save extends DurableObject {
  async read() {
    const s = await this.ctx.storage.get('s');
    return s ? { rev: s.rev, at: s.at, data: s.data } : null;
  }
  async create(data) {
    if (await this.ctx.storage.get('s')) return { error: 'exists' };
    const s = { rev: 1, at: Date.now(), data };
    await this.ctx.storage.put('s', s);
    return { rev: s.rev, at: s.at };
  }
  async write(data, baseRev) {
    const s = await this.ctx.storage.get('s');
    if (!s) return { missing: true };
    if (+baseRev !== s.rev) return { conflict: true, rev: s.rev, at: s.at, data: s.data };
    s.rev += 1; s.at = Date.now(); s.data = data;
    await this.ctx.storage.put('s', s);
    return { rev: s.rev, at: s.at };
  }
  // IP별 시간당 횟수 제한 (limits 인스턴스 전용)
  async hit(kind, who, max) {
    const hour = Math.floor(Date.now() / 3600000);
    const k = kind + ':' + who;
    const v = (await this.ctx.storage.get(k)) || { hour, n: 0 };
    if (v.hour !== hour) { v.hour = hour; v.n = 0; }
    if (v.n >= max) return false;
    v.n += 1;
    await this.ctx.storage.put(k, v);
    if (Math.random() < 0.01) await this.tidy(hour);
    return true;
  }
  async tidy(hour) {
    const all = await this.ctx.storage.list({ limit: 1000 });
    const old = [...all].filter(([, v]) => v && v.hour < hour - 1).map(([k]) => k);
    if (old.length) await this.ctx.storage.delete(old.slice(0, 128));
  }
}
