// 공통 도우미: 응답, 스키마 준비, 최초 데이터 채우기, 관리자 확인

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
     kind TEXT DEFAULT 'template', result TEXT DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`,
];

let ready = false;

// 예전 표에 새 칸(kind: 템플릿/실제 사례, result: 실제 결과)이 없으면 추가
async function migrate(env) {
  const cols = await env.DB.prepare('PRAGMA table_info(items)').all();
  const names = new Set(cols.results.map((c) => c.name));
  const add = [];
  if (!names.has('kind')) add.push(`ALTER TABLE items ADD COLUMN kind TEXT DEFAULT 'template'`);
  if (!names.has('result')) add.push(`ALTER TABLE items ADD COLUMN result TEXT DEFAULT ''`);
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
    for (let i = 0; i < rm.length; i += 80) {
      await env.DB.batch(rm.slice(i, i + 80).map((id) => env.DB.prepare('DELETE FROM items WHERE id=?').bind(id)));
    }
    await importData(env, seed, 'merge');
    await env.DB.batch([
      env.DB.prepare(`INSERT OR REPLACE INTO settings (k, v) VALUES ('seed_version', ?)`).bind(String(want)),
      env.DB.prepare(`INSERT OR REPLACE INTO settings (k, v) VALUES ('seeded', ?)`).bind(new Date().toISOString()),
    ]);
  }
  ready = true;
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

// mode: 'merge' = 없는 항목만 추가, 'replace' = 전체 교체
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
        env.DB.prepare(`${verb} INTO items (id, cat_id, title, meta, chk, body, sort, updated_at, kind, result) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .bind(it.id, c.id, it.title, it.meta || '', it.check || '', it.text || '', it.sort ?? ii * 10, now,
            it.kind === 'example' ? 'example' : 'template', it.result || ''),
      );
    });
  });
  // D1 batch는 한 번에 너무 많으면 실패할 수 있어 나눠 실행
  for (let i = 0; i < stmts.length; i += 80) {
    await env.DB.batch(stmts.slice(i, i + 80));
  }
}

export async function readAll(env) {
  const cats = await env.DB.prepare('SELECT * FROM categories ORDER BY sort, label').all();
  const items = await env.DB.prepare('SELECT * FROM items ORDER BY sort, title').all();
  const byCat = {};
  for (const it of items.results) {
    (byCat[it.cat_id] ||= []).push({
      id: it.id, title: it.title, meta: it.meta, check: it.chk, text: it.body,
      kind: it.kind === 'example' ? 'example' : 'template', result: it.result || '',
      sort: it.sort, updated_at: it.updated_at,
    });
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
