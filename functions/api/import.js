import { json, noDb, ensureReady, isAdmin, denied, importData, loadSeedAll } from '../_lib.js';

// POST /api/import
//  { source: 'seed', mode: 'merge' }  → 저장소의 seed.json(+보류 항목)에서 새 항목만 추가
//  { data: {...}, mode: 'replace' }   → 백업 JSON으로 전체 복원
export async function onRequestPost({ env, request }) {
  if (!isAdmin(request, env)) return denied();
  if (!env.DB) return noDb();
  await ensureReady(env, request);
  const b = await request.json();
  const mode = b.mode === 'replace' ? 'replace' : 'merge';
  const data = b.source === 'seed' ? await loadSeedAll(env, request) : b.data;
  if (!data || !Array.isArray(data.categories)) return json({ error: '가져올 데이터 형식이 맞지 않습니다.' }, 400);
  await importData(env, data, mode);
  return json({ ok: true, mode });
}
