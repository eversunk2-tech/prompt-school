"""프롬프트 원본(prompts/*.md)을 public/data/seed.json으로 묶는다.

prompts/ 폴더의 각 .md 파일 = 탭 하나.
파일 머리말:
  ---
  id: saenggibu
  grp: notebook        # notebook | gemini | etc
  label: 생활기록부
  intro: 한 줄 소개
  sort: 30
  ---
본문은 '### 제목' 으로 프롬프트를 나누고, 그 아래
  meta: 설명 (실제 사례는 '어디에서 썼는지')
  check: 확인할 것
  id: 고정 아이디(선택)
  kind: template(기본) | example(실제 적용 프롬프트)
  result: 실제로 나온 결과(실제 사례일 때)
다음에 ``` 코드 블록으로 프롬프트 본문을 넣는다.
"""
import json, re, sys, pathlib, hashlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'prompts'
OUT = ROOT / 'public' / 'data' / 'seed.json'


def parse(path):
    raw = path.read_text(encoding='utf-8')
    m = re.match(r'^---\n(.*?)\n---\n', raw, re.S)
    if not m:
        sys.exit(f'{path.name}: 머리말(---)이 없습니다')
    head = dict(line.split(':', 1) for line in m.group(1).splitlines() if ':' in line)
    head = {k.strip(): v.strip() for k, v in head.items()}
    body = raw[m.end():]
    cat = {
        'id': head['id'], 'grp': head.get('grp', 'notebook'), 'label': head['label'],
        'intro': head.get('intro', ''), 'sort': int(head.get('sort', 0)), 'items': [],
    }
    # '### 제목'으로 나누되, ``` 코드 블록 안의 ###(프롬프트 본문의 소제목)는 건드리지 않음
    parts, cur, fence = [], None, False
    for line in body.split('\n'):
        if line.startswith('```'):
            fence = not fence
        if not fence and line.startswith('### '):
            if cur is not None:
                parts.append('\n'.join(cur))
            cur = [line[4:]]
        elif cur is not None:
            cur.append(line)
    if cur is not None:
        parts.append('\n'.join(cur))
    for i, part in enumerate(parts):
        title, rest = part.split('\n', 1)
        code = re.search(r'```[a-z]*\n(.*?)\n```', rest, re.S)
        if not code:
            sys.exit(f'{path.name}: "{title}"에 ``` 프롬프트 블록이 없습니다')
        before = rest[:code.start()]
        fields = dict(re.findall(r'^(meta|check|id|kind|result):\s*(.*)$', before, re.M))
        pid = fields.get('id') or cat['id'] + '-' + hashlib.md5(title.strip().encode()).hexdigest()[:6]
        cat['items'].append({
            'id': pid, 'title': title.strip(), 'meta': fields.get('meta', ''),
            'check': fields.get('check', ''), 'text': code.group(1).strip('\n'), 'sort': i * 10,
            'kind': 'example' if fields.get('kind', '').strip() == 'example' else 'template',
            'result': fields.get('result', ''),
        })
    return cat


def load_course():
    """prompts/COURSE: '[모듈 키]' 아래 강의 순서대로 아이디 → {아이디: '모듈:순번'}"""
    f = SRC / 'COURSE'
    out, cur, n = {}, None, 0
    if not f.exists():
        return out
    for line in f.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('[') and line.endswith(']'):
            cur, n = line[1:-1], 0
            continue
        n += 1
        if line in out:
            sys.exit(f'COURSE: {line}가 두 번 나옵니다')
        out[line] = f'{cur}:{n:02d}'
    return out


def main():
    cats = [parse(p) for p in sorted(SRC.glob('*.md'))]
    course = load_course()
    allids = {it['id'] for c in cats for it in c['items']}
    miss = sorted(set(course) - allids)
    if miss:
        sys.exit(f'COURSE에 있지만 프롬프트에 없는 아이디: {miss}')
    for c in cats:
        for it in c['items']:
            it['course'] = course.get(it['id'], '')
    cats.sort(key=lambda c: c['sort'])
    ids = [it['id'] for c in cats for it in c['items']]
    dup = {x for x in ids if ids.count(x) > 1}
    if dup:
        sys.exit(f'중복 아이디: {dup}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    ver_file = SRC / 'VERSION'
    version = int(ver_file.read_text().strip()) if ver_file.exists() else 1
    rm_file = SRC / 'REMOVE'  # 사이트 DB에서도 지울 예전 항목 아이디(한 줄에 하나)
    remove = [x.strip() for x in rm_file.read_text(encoding='utf-8').splitlines() if x.strip()] if rm_file.exists() else []
    OUT.write_text(json.dumps({'version': version, 'remove': remove, 'categories': cats}, ensure_ascii=False, indent=1), encoding='utf-8')
    ex = sum(1 for c in cats for it in c['items'] if it['kind'] == 'example')
    nc = sum(1 for c in cats for it in c['items'] if it.get('course'))
    print(f'버전 {version}: {len(cats)}개 탭, {len(ids)}개 프롬프트(실제 사례 {ex}, 템플릿 {len(ids) - ex}, 연수 배치 {nc}) → {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
