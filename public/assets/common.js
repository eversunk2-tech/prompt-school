// 사이트·관리자 화면 공용 함수
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TAG = [
  [/^(#\s?(역할|대상))/, 't-role'],
  [/^(#\s?(명령|지시|과제|목적))/, 't-cmd'],
  [/^(#\s?(맥락|상황|조건|제한|규칙|자료))/, 't-ctx'],
  [/^(#\s?(형식|출력|예시|구성))/, 't-fmt'],
];

// 프롬프트 본문을 줄 단위로 색칠: #역할/#명령/#맥락/#형식, ##소제목, [자리표시]
export function highlight(text, query = '', opts = {}) {
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      let html = esc(line);
      if (opts.ph !== false) html = html.replace(/\[([^\]\n]{1,40})\]/g, '<span class="ph">[$1]</span>');
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

// 연수 과정·차시(강의원고 목차와 같음). 프롬프트의 course 값 = '모듈 키:순번' (예: 'B3:05')
export const COURSES = {
  basic: {
    label: '기본과정', title: '칼퇴를 부르는 AI 비서', icon: 'seedling', tone: 'mint',
    lead: '노트북·소스·스튜디오로 업무와 수업 자료를 바로 만드는 150분',
    modules: [
      { key: 'B2', num: 'Ⅱ', label: '첫걸음：세 칸과 인용 번호', icon: 'magnifying-glass-tilted-left', time: '15:38', desc: '근거 확인 꼬리말, 소스 켜고 끄기 · 실습①' },
      { key: 'B3', num: 'Ⅲ', label: '우리 학교 전용 업무 비서', icon: 'briefcase', time: '16:05', desc: '생활기록부·중입·수학여행·학년 협의록 · 종합 실습② 프로젝트 노트북 한 바퀴' },
      { key: 'B4', num: 'Ⅳ', label: '지도서 한 권, 수업 자료 공장', icon: 'artist-palette', time: '17:00', desc: '오개념·퀴즈·슬라이드·영상·오디오·학습 개요 · 실습③' },
      { key: 'B9', num: '+', label: '연수 뒤 더 해 보기', icon: 'light-bulb', time: '', desc: '회의록, 인수인계, 한 쪽 참고 자료' },
    ],
  },
  advanced: {
    label: '심화과정', title: 'AI 조교를 설계하는 교사', icon: 'rocket', tone: 'peach',
    lead: '소스를 설계해 단원 설계부터 수업 뒤 분석까지 잇는 150분 · 실습 5회',
    modules: [
      { key: 'A2', num: 'Ⅱ', label: '소스 설계', icon: 'card-index-dividers', time: '15:40', desc: '층위별 소스와 교사용 기본 지침, 체크로 근거 범위 정하기 · 실습①' },
      { key: 'A3', num: 'Ⅲ', label: '단원 설계 사슬', icon: 'bullseye', time: '16:05', desc: '바라는 결과 → 수행과제 → 동료 검토, 답을 소스로 쌓기와 관문 1·2 · 실습②' },
      { key: 'A5', num: 'Ⅳ', label: '차시 수업 설계：‘!’ 소스와 제미나이', icon: 'memo', time: '16:30', desc: '‘!’ 소스 10가지 → 감사 → 제미나이 지도안 · 실습③' },
      { key: 'AF', num: 'Ⅴ', label: '학년 업무 노트북과 동학년 공유', icon: 'briefcase', time: '17:00', desc: '공유 전 점검과 업무 비서 Gem. 업무 비서 지침·할 일 표는 기본과정 Ⅲ 항목을 씁니다 · 실습④' },
      { key: 'A7', num: 'Ⅵ', label: '우리 반 AI 튜터', icon: 'robot', time: '17:30', desc: '튜터 지침과 학생 역할 시험 ①~⑦ · 실습⑤' },
      { key: 'A6', num: 'Ⅶ', label: '수업 뒤 분석', icon: 'bar-chart', time: '17:45', desc: '형성평가 결과 분석, 배움 공책 질문, 결과물 근거 되묻기(관문 3), 피드백 초안' },
      { key: 'A9', num: '+', label: '연수 뒤 더 해 보기', icon: 'light-bulb', time: '', desc: '백워드 3·4단계, 학급교육과정, 복습 게임 웹페이지, 복습 루틴' },
    ],
  },
};
export const CAT_ICON = { basics: 'magnifying-glass-tilted-left', work: 'briefcase', saenggibu: 'bookmark-tabs', lesson: 'artist-palette', design: 'card-index-dividers', tutor: 'robot', gplan: 'memo', canvas: 'laptop', gems: 'gem-stone' };

// course 값 → { course: 'basic'|'advanced', mod, order }
export function courseOf(it) {
  const [key, n] = String(it.course || '').split(':');
  if (!key) return null;
  for (const [cid, c] of Object.entries(COURSES)) {
    const mod = c.modules.find((m) => m.key === key);
    if (mod) return { course: cid, mod, order: Number(n) || 99 };
  }
  return null;
}
export const icon3d = (name) => `/assets/3d/${name}.webp`;
