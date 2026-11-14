// 공통 도우미: 응답, 스키마 준비, 최초 데이터 채우기, 관리자 확인
import { HELD } from './_held.js'; // 보류 사항 항목(tools/build_seed.py가 만듦). 공개 seed.json에는 없다

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function noDb() {
  return json(
    { error: 'D1 데이터베이스가 연결되지 않았습니다. Cloudflare Pages 설정 → 바인딩에서 변수 이름 DB로 D1을 연결하세요.' },
    503,
  );
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS categories (
     id TEXT PRIMARY KEY, grp TEXT NOT NULL DEFAULT 'notebook',
     label TEXT NOT NULL, intro TEXT DEFAULT '', sort INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS items (
     id TEXT PRIMARY KEY, cat_id TEXT NOT NULL, title TEXT NOT NULL,
     meta TEXT DEFAULT '', chk TEXT DEFAULT '', body TEXT DEFAULT '',
     sort INTEGER DEFAULT 0, updated_at TEXT,
     kind TEXT DEFAULT 'template', result TEXT DEFAULT '', course TEXT DEFAULT '',
     hold INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`,
];

let ready = false;

// 예전 표에 새 칸(kind: 템플릿/실제 사례, result: 실제 결과, course: 연수 과정·차시, hold: 보류 여부)이 없으면 추가.
// hold는 0(공개)이 기본값이라 예전 항목은 모두 공개로 남는다.
async function migrate(env) {
  const cols = await env.DB.prepare('PRAGMA table_info(items)').all();
  const names = new Set(cols.results.map((c) => c.name));
  const add = [];
  if (!names.has('kind')) add.push(`ALTER TABLE items ADD COLUMN kind TEXT DEFAULT 'template'`);
  if (!names.has('result')) add.push(`ALTER TABLE items ADD COLUMN result TEXT DEFAULT ''`);
  if (!names.has('course')) add.push(`ALTER TABLE items ADD COLUMN course TEXT DEFAULT ''`);
  if (!names.has('hold')) add.push(`ALTER TABLE items ADD COLUMN hold INTEGER DEFAULT 0`);
  if (add.length) await env.DB.batch(add.map((q) => env.DB.prepare(q)));
}

export async function ensureReady(env, request) {
  if (ready) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  await migrate(env);
  // seed.json의 version이 올라가면 새 항목만 자동으로 더함(이미 있는 항목·관리자 수정 내용은 그대로)
  const row = await env.DB.prepare(`SELECT v FROM settings WHERE k='seed_version'`).first();
  const seeded = await env.DB.prepare(`SELECT v FROM settings WHERE k='seeded'`).first();
  const have = row ? Number(row.v) : (seeded ? 1 : 0);
  const seed = await loadSeed(env, request);
  const want = Number(seed?.version || 1);
  if (seed && want > have) {
    const rm = (seed.remove || []).filter((x) => typeof x === 'string' && x);
    // REMOVE 항목은 지웠다가 seed 내용으로 다시 넣는다. 그때 관리자가 정해 둔 보류/공개 상태가 사라지지 않게 미리 적어 둔다.
    const before = await env.DB.prepare('SELECT id, hold FROM items').all();
    const prevHold = new Map(before.results.map((r) => [r.id, r.hold ? 1 : 0]));
    for (let i = 0; i < rm.length; i += 80) {
      await env.DB.batch(rm.slice(i, i + 80).map((id) => (id.startsWith('cat:')
        ? env.DB.prepare('DELETE FROM categories WHERE id=?').bind(id.slice(4))
        : env.DB.prepare('DELETE FROM items WHERE id=?').bind(id))));
    }
    await importData(env, seed, 'merge');
    await importData(env, HELD, 'merge');
    await runAll(env, rm.filter((id) => prevHold.has(id))
      .map((id) => env.DB.prepare('UPDATE items SET hold=? WHERE id=?').bind(prevHold.get(id), id)));
    await applySeedHold(env, seed);
    const all = { categories: [...(seed.categories || []), ...(HELD.categories || [])] };
    if (seed.course_reset && Number(seed.course_reset.version) > have) await resetCourse(env, all, String(seed.course_reset.prefix || ''));
    await fillCourse(env, all);
    await env.DB.batch([
      env.DB.prepare(`INSERT OR REPLACE INTO settings (k, v) VALUES ('seed_version', ?)`).bind(String(want)),
      env.DB.prepare(`INSERT OR REPLACE INTO settings (k, v) VALUES ('seeded', ?)`).bind(new Date().toISOString()),
    ]);
  }
  ready = true;
}

async function runAll(env, stmts) {
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
}

// 보류 사항(prompts/HOLD → seed.hold)을 DB에 반영한다.
// 선택한 방식: 버전이 오를 때만 실행하고, 이미 한 번 반영한 아이디는 settings의 'seed_hold'에 적어 두어 다시 건드리지 않는다.
// 그래서 HOLD에 '새로 적힌' 아이디만 보류로 바뀌고, 관리자가 '다시 공개'한 항목은 HOLD 목록에 남아 있어도
// 다음 배포나 버전 올림에서 다시 보류되지 않는다. HOLD에서 뺀 아이디는 기록에서도 빠지므로, 나중에 다시 적으면 또 한 번 보류된다.
// (HOLD에서 뺀다고 저절로 공개되지는 않는다. 공개는 관리자 화면의 '다시 공개'로 한다.)
async function applySeedHold(env, seed) {
  const want = (seed.hold || []).filter((x) => typeof x === 'string' && x);
  const row = await env.DB.prepare(`SELECT v FROM settings WHERE k='seed_hold'`).first();
  let done = [];
  try { done = JSON.parse(row?.v || '[]'); } catch (e) { done = []; }
  const seen = new Set(done);
  await runAll(env, want.filter((id) => !seen.has(id)).map((id) => env.DB.prepare('UPDATE items SET hold=1 WHERE id=?').bind(id)));
  await env.DB.prepare(`INSERT OR REPLACE INTO settings (k, v) VALUES ('seed_hold', ?)`).bind(JSON.stringify(want)).run();
}

// 차시 배치를 통째로 바꾼 버전(prompts/COURSE_RESET)을 지날 때 한 번만: 모듈 키가 prefix(예: 'A' = 심화과정)로 시작하는 배치를 seed대로 다시 맞춘다.
// seed에서 배치가 빠진 항목은 예전 prefix 배치를 비운다. 다른 과정의 배치와 그 뒤 관리자가 고친 값은 건드리지 않는다.
async function resetCourse(env, seed, prefix) {
  if (!prefix) return;
  const stmts = [];
  for (const c of seed.categories || []) for (const it of c.items || []) {
    if ((it.course || '').startsWith(prefix)) stmts.push(env.DB.prepare('UPDATE items SET course=? WHERE id=?').bind(it.course, it.id));
    else if (!it.course) stmts.push(env.DB.prepare(`UPDATE items SET course='' WHERE id=? AND course LIKE ?`).bind(it.id, prefix + '%'));
  }
  await runAll(env, stmts);
}

// 연수 과정·차시(course)는 저장소의 seed.json이 정한다. 관리자가 직접 정한 값(비어 있지 않은 값)은 그대로 둔다.
async function fillCourse(env, seed) {
  const stmts = [];
  for (const c of seed.categories || []) for (const it of c.items || []) {
    if (it.course) stmts.push(env.DB.prepare(`UPDATE items SET course=? WHERE id=? AND (course IS NULL OR course='')`).bind(it.course, it.id));
  }
  await runAll(env, stmts);
}

// 관리자 화면의 'seed.json 새 항목 가져오기'용: 공개 seed와 보류 항목을 함께 돌려준다
export async function loadSeedAll(env, request) {
  const seed = await loadSeed(env, request);
  if (!seed) return null;
  return { ...seed, categories: [...(seed.categories || []), ...(HELD.categories || [])] };
}

export async function loadSeed(env, request) {
  try {
    const url = new URL('/data/seed.json', request.url);
    const res = env.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// mode: 'merge' = 없는 항목만 추가, 'replace' = 전체 교체. 항목의 hold(보류)도 함께 넣는다(없으면 공개)
export async function importData(env, data, mode = 'merge') {
  const stmts = [];
  const now = new Date().toISOString();
  if (mode === 'replace') {
    stmts.push(env.DB.prepare('DELETE FROM items'));
    stmts.push(env.DB.prepare('DELETE FROM categories'));
  }
  const verb = mode === 'replace' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
  (data.categories || []).forEach((c, ci) => {
    stmts.push(
      env.DB.prepare(`${verb} INTO categories (id, grp, label, intro, sort) VALUES (?,?,?,?,?)`)
        .bind(c.id, c.grp || 'notebook', c.label, c.intro || '', c.sort ?? ci * 10),
    );
    (c.items || []).forEach((it, ii) => {
      stmts.push(
        env.DB.prepare(`${verb} INTO items (id, cat_id, title, meta, chk, body, sort, updated_at, kind, result, course, hold) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(it.id, c.id, it.title, it.meta || '', it.check || '', it.text || '', it.sort ?? ii * 10, now,
            it.kind === 'example' ? 'example' : 'template', it.result || '', it.course || '', it.hold ? 1 : 0),
      );
    });
  });
  // D1 batch는 한 번에 너무 많으면 실패할 수 있어 나눠 실행
  for (let i = 0; i < stmts.length; i += 80) {
    await env.DB.batch(stmts.slice(i, i + 80));
  }
}

// admin이 아니면 보류 항목은 DB에서 읽을 때부터 뺀다(브라우저에서 감추는 것이 아니라 응답에 아예 싣지 않음).
// 관리자에게는 모든 항목을 주고 hold: true/false를 붙인다.
export async function readAll(env, { admin = false } = {}) {
  const cats = await env.DB.prepare('SELECT * FROM categories ORDER BY sort, label').all();
  const items = await env.DB.prepare(`SELECT * FROM items ${admin ? '' : 'WHERE COALESCE(hold, 0) = 0'} ORDER BY sort, title`).all();
  const byCat = {};
  for (const it of items.results) {
    const row = {
      id: it.id, title: it.title, meta: it.meta, check: it.chk, text: it.body,
      kind: it.kind === 'example' ? 'example' : 'template', result: it.result || '', course: it.course || '',
      sort: it.sort, updated_at: it.updated_at,
    };
    if (admin) row.hold = !!it.hold;
    (byCat[it.cat_id] ||= []).push(row);
  }
  return {
    categories: cats.results.map((c) => ({
      id: c.id, grp: c.grp, label: c.label, intro: c.intro, sort: c.sort,
      items: byCat[c.id] || [],
    })),
  };
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function isAdmin(request, env) {
  const key = request.headers.get('x-admin-key') || '';
  return !!env.ADMIN_PASSWORD && safeEqual(key, env.ADMIN_PASSWORD);
}

export function denied() {
  return json({ error: '관리자 비밀번호가 맞지 않습니다.' }, 401);
}

export function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
