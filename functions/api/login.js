import { json, isAdmin, denied } from '../_lib.js';

// POST /api/login : 비밀번호 확인만 함(세션은 브라우저 sessionStorage에 보관)
export async function onRequestPost({ env, request }) {
  if (!env.ADMIN_PASSWORD) {
    return json({ error: 'ADMIN_PASSWORD 환경 변수가 설정되지 않았습니다.' }, 503);
  }
  if (!isAdmin(request, env)) return denied();
  return json({ ok: true, db: !!env.DB });
}
