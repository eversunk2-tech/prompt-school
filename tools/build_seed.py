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
  meta: 설명
  check: 확인할 것
  id: 고정 아이디(선택)
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
    parts = re.split(r'^### ', body, flags=re.M)[1:]
    for i, part in enumerate(parts):
        title, rest = part.split('\n', 1)
        code = re.search(r'```[a-z]*\n(.*?)\n```', rest, re.S)
        if not code:
            sys.exit(f'{path.name}: "{title}"에 ``` 프롬프트 블록이 없습니다')
        before = rest[:code.start()]
        fields = dict(re.findall(r'^(meta|check|id):\s*(.*)$', before, re.M))
        pid = fields.get('id') or cat['id'] + '-' + hashlib.md5(title.strip().encode()).hexdigest()[:6]
        cat['items'].append({
            'id': pid, 'title': title.strip(), 'meta': fields.get('meta', ''),
            'check': fields.get('check', ''), 'text': code.group(1).strip('\n'), 'sort': i * 10,
        })
    return cat


def main():
    cats = [parse(p) for p in sorted(SRC.glob('*.md'))]
    cats.sort(key=lambda c: c['sort'])
    ids = [it['id'] for c in cats for it in c['items']]
    dup = {x for x in ids if ids.count(x) > 1}
    if dup:
        sys.exit(f'중복 아이디: {dup}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'categories': cats}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(cats)}개 탭, {len(ids)}개 프롬프트 → {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
