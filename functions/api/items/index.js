import { json, noDb, ensureReady, isAdmin, denied, newId } from '../../_lib.js';

// POST /api/items : 프롬프트 새로 추가
export async function onRequestPost({ env, request }) {
  if (!isAdmin(request, env)) return denied();
  if (!env.DB) return noDb();
  await ensureReady(env, request);
  const b = await request.json();
  if (!b.cat_id || !b.title) return json({ error: '분류와 제목은 꼭 필요합니다.' }, 400);
  const id = b.id || newId('p');
  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM items WHERE cat_id=?').bind(b.cat_id).first();
  await env.DB.prepare(
    'INSERT INTO items (id, cat_id, title, meta, chk, body, sort, updated_at) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(id, b.cat_id, b.title, b.meta || '', b.check || '', b.text || '', (max?.m || 0) + 10, new Date().toISOString()).run();
  return json({ ok: true, id });
}
