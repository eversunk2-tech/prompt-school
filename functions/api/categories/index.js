import { json, noDb, ensureReady, isAdmin, denied, newId } from '../../_lib.js';

// POST /api/categories : 분류(탭) 추가
export async function onRequestPost({ env, request }) {
  if (!isAdmin(request, env)) return denied();
  if (!env.DB) return noDb();
  await ensureReady(env, request);
  const b = await request.json();
  if (!b.label) return json({ error: '탭 이름은 꼭 필요합니다.' }, 400);
  const id = b.id || newId('c');
  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM categories').first();
  await env.DB.prepare('INSERT INTO categories (id, grp, label, intro, sort) VALUES (?,?,?,?,?)')
    .bind(id, b.grp || 'notebook', b.label, b.intro || '', (max?.m || 0) + 10).run();
  return json({ ok: true, id });
}
