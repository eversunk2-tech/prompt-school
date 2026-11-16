import { json, noDb, ensureReady, readAll } from '../_lib.js';

// GET /api/data : 사이트 전체 데이터(분류 + 프롬프트)
export async function onRequestGet({ env, request }) {
  if (!env.DB) return noDb();
  await ensureReady(env, request);
  return json(await readAll(env));
}
