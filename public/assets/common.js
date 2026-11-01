// 사이트·관리자 화면 공용 함수
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TAG = [
  [/^(#\s?역할)/, 't-role'],
  [/^(#\s?(명령|지시|과제))/, 't-cmd'],
  [/^(#\s?(맥락|상황|조건|제한|규칙|자료))/, 't-ctx'],
  [/^(#\s?(형식|출력|예시))/, 't-fmt'],
];

// 프롬프트 본문을 줄 단위로 색칠: #역할/#명령/#맥락/#형식, ##소제목, [자리표시]
export function highlight(text, query = '') {
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      let html = esc(line);
      html = html.replace(/\[([^\]\n]{1,40})\]/g, '<span class="ph">[$1]</span>');
      if (/^##/.test(line)) {
        html = html.replace(/^(##[^:：]*)/, '<span class="t-sub">$1</span>');
      } else {
        for (const [re, cls] of TAG) {
          if (re.test(line)) { html = html.replace(/^(#[^:：\s]*\s?[^:：\s]*)/, `<span class="${cls}">$1</span>`); break; }
        }
      }
      if (query) html = mark(html, query);
      return html;
    })
    .join('\n');
}

export function mark(html, query) {
  if (!query) return html;
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 태그 밖 글자만 표시
  return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, txt) => (tag ? tag : txt.replace(new RegExp(q, 'gi'), (x) => `<span class="hit">${x}</span>`)));
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }
}

export function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch (e) { return null; }
  return val;
}

export const GROUPS = { notebook: '제미나이 노트북', gemini: '제미나이', etc: '기타' };

export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), 1800);
}

// 데이터 읽기: API가 안 되면 seed.json으로 대체
export async function loadData() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' });
    if (r.ok) return { data: await r.json(), live: true };
  } catch (e) { /* 아래로 */ }
  const r2 = await fetch('/data/seed.json', { cache: 'no-store' });
  return { data: await r2.json(), live: false };
}
