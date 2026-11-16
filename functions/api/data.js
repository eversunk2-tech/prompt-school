import { json, noDb, ensureReady, readAll, isAdmin } from '../_lib.js';

// 관리자에게만 보이는 연수 과정(차시 배치의 모듈 키 첫 글자). 'A' = 심화과정
const ADMIN_ONLY_COURSES = ['A'];

// GET /api/data : 사이트 전체 데이터(분류 + 프롬프트)
// 관리자 비밀번호(x-admin-key)가 없으면 심화과정에 배치된 프롬프트를 통째로 빼고 돌려준다.
export async function onRequestGet({ env, request }) {
  if (!env.DB) return noDb();
  await ensureReady(env, request);
  const data = await readAll(env);
  const admin = isAdmin(request, env);
  if (!admin) {
    for (const c of data.categories) {
      c.items = c.items.filter((it) => !ADMIN_ONLY_COURSES.includes(String(it.course || '').charAt(0)));
    }
    data.categories = data.categories.filter((c) => c.items.length); // 남은 프롬프트가 없는 탭은 보이지 않게
  }
  return json({ ...data, admin });
}
