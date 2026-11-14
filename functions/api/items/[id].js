import { json, noDb, ensureReady, isAdmin, denied } from '../../_lib.js';

// PUT /api/items/:id : 수정 (보낸 필드만 바뀜). hold: true = 보류 사항으로, false = 다시 공개
export async function onRequestPut({ env, request, params }) {
  if (!isAdmin(request, env)) return denied();
  if (!env.DB) return noDb();
  await ensureReady(env, request);
  const b = await request.json();
  const cur = await env.DB.prepare('SELECT * FROM items WHERE id=?').bind(params.id).first();
  if (!cur) return json({ error: '항목을 찾을 수 없습니다.' }, 404);
  await env.DB.prepare(
    'UPDATE items SET cat_id=?, title=?, meta=?, chk=?, body=?, sort=?, updated_at=?, kind=?, result=?, course=?, hold=? WHERE id=?',
  ).bind(
    b.cat_id ?? cur.cat_id, b.title ?? cur.title, b.meta ?? cur.meta, b.check ?? cur.chk,
    b.text ?? cur.body, b.sort ?? cur.sort, new Date().toISOString(),
    b.kind ? (b.kind === 'example' ? 'example' : 'template') : (cur.kind || 'template'),
    b.result ?? (cur.result || ''), b.course ?? (cur.course || ''),
    b.hold === undefined ? (cur.hold ? 1 : 0) : (b.hold ? 1 : 0), params.id,
  ).run();
  return json({ ok: true });
}

// DELETE /api/items/:id
export async function onRequestDelete({ env, request, params }) {
  if (!isAdmin(request, env)) return denied();
  if (!env.DB) return noDb();
  await env.DB.prepare('DELETE FROM items WHERE id=?').bind(params.id).run();
  return json({ ok: true });
}
