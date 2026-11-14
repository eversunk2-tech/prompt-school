import { json, noDb, ensureReady, readAll, isAdmin } from '../_lib.js';

// GET /api/data : 사이트 전체 데이터(분류 + 프롬프트)
// 보류 사항은 관리자 비밀번호(x-admin-key)가 맞을 때만 함께 보낸다. 사이트 방문자에게는 서버에서 빼고 보낸다.
export async function onRequestGet({ env, request }) {
  if (!env.DB) return noDb();
  await ensureReady(env, request);
  return json(await readAll(env, { admin: isAdmin(request, env) }));
}
