import { json, noDb, ensureReady, isAdmin, denied } from '../../_lib.js';

// PUT /api/categories/:id : 탭 이름·소개·그룹·순서 수정
export async function onRequestPut({ env, request, params }) {
  if (!isAdmin(request, env)) return denied();
  if (!env.DB) return noDb();
  await ensureReady(env, request);
  const b = await request.json();
  const cur = await env.DB.prepare('SELECT * FROM categories WHERE id=?').bind(params.id).first();
  if (!cur) return json({ error: '탭을 찾을 수 없습니다.' }, 404);
  await env.DB.prepare('UPDATE categories SET grp=?, label=?, intro=?, sort=? WHERE id=?')
    .bind(b.grp ?? cur.grp, b.label ?? cur.label, b.intro ?? cur.intro, b.sort ?? cur.sort, params.id).run();
  return json({ ok: true });
}

// DELETE /api/categories/:id : 탭과 그 안의 프롬프트 모두 삭제
export async function onRequestDelete({ env, request, params }) {
  if (!isAdmin(request, env)) return denied();
  if (!env.DB) return noDb();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM items WHERE cat_id=?').bind(params.id),
    env.DB.prepare('DELETE FROM categories WHERE id=?').bind(params.id),
  ]);
  return json({ ok: true });
}
