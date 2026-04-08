"""
INTEKPLUS ALARM Manager - 자동 번역 스크립트
Firebase Realtime Database REST API + DeepL API
"""

import os, json, time, re, sys
import urllib.request, urllib.parse, urllib.error

# ── 환경변수 ──────────────────────────────────────
DEEPL_API_KEY         = os.environ.get('DEEPL_API_KEY', '')
FIREBASE_SERVICE_JSON = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '')
FIREBASE_DB_URL       = os.environ.get('FIREBASE_DB_URL', '').rstrip('/')

WARN_THRESHOLD    = 0.95
MAX_ITEMS_PER_RUN = 50

# ── Firebase 인증 토큰 ────────────────────────────
def get_firebase_token():
    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests

        info   = json.loads(FIREBASE_SERVICE_JSON)
        scopes = [
            'https://www.googleapis.com/auth/firebase.database',
            'https://www.googleapis.com/auth/userinfo.email',
        ]
        creds = service_account.Credentials.from_service_account_info(info, scopes=scopes)
        creds.refresh(google.auth.transport.requests.Request())
        print(f'[OK] Firebase 토큰 발급 완료 (만료: {creds.expiry})')
        return creds.token
    except ImportError as e:
        print(f'[ERROR] google-auth 패키지 없음: {e}')
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f'[ERROR] FIREBASE_SERVICE_ACCOUNT JSON 파싱 오류: {e}')
        sys.exit(1)
    except Exception as e:
        print(f'[ERROR] Firebase 토큰 발급 실패: {e}')
        sys.exit(1)

# ── Firebase REST ─────────────────────────────────
def fb_request(method, path, token, data=None):
    url = f"{FIREBASE_DB_URL}/{path}.json?access_token={token}"
    body = json.dumps(data).encode() if data is not None else None
    req  = urllib.request.Request(
        url, data=body, method=method,
        headers={'Content-Type': 'application/json'} if body else {}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'[ERROR] Firebase {method} /{path} → HTTP {e.code}: {body[:200]}')
        return None
    except Exception as e:
        print(f'[ERROR] Firebase {method} /{path}: {e}')
        return None

def fb_get(path, token):   return fb_request('GET',   path, token)
def fb_put(path, token, d): return fb_request('PUT',   path, token, d)
def fb_patch(path, token, d): return fb_request('PATCH', path, token, d)

# ── DeepL 사용량 ──────────────────────────────────
def get_deepl_usage():
    url = 'https://api-free.deepl.com/v2/usage'
    req = urllib.request.Request(url, headers={'Authorization': f'DeepL-Auth-Key {DEEPL_API_KEY}'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.loads(r.read())
            cnt, lim = d.get('character_count', 0), d.get('character_limit', 500000)
            return cnt, lim, cnt / lim if lim else 0
    except Exception as e:
        print(f'[ERROR] DeepL 사용량 조회 실패: {e}')
        return 0, 500000, 0

# ── DeepL 번역 ────────────────────────────────────
def deepl_translate(text, glossary_map):
    if not text or not text.strip():
        return text

    # 보존 용어 플레이스홀더 처리
    placeholders, processed = {}, text
    for i, term in enumerate(sorted(glossary_map.get('preserve', {}), key=len, reverse=True)):
        ph = f'__T{i}__'
        if term in processed:
            processed = processed.replace(term, ph)
            placeholders[ph] = term

    # DeepL 호출
    url    = 'https://api-free.deepl.com/v2/translate'
    params = urllib.parse.urlencode({
        'auth_key': DEEPL_API_KEY,
        'text': processed,
        'source_lang': 'KO',
        'target_lang': 'EN-US',
        'preserve_formatting': '1',
    }).encode()
    try:
        req = urllib.request.Request(url, data=params, method='POST')
        with urllib.request.urlopen(req, timeout=15) as r:
            translated = json.loads(r.read())['translations'][0]['text']
    except urllib.error.HTTPError as e:
        if e.code == 456:
            print('[WARN] DeepL 월 한도 초과 (456)')
            return None
        print(f'[ERROR] DeepL API HTTP {e.code}: {e.read().decode()[:200]}')
        return text
    except Exception as e:
        print(f'[ERROR] DeepL 번역 실패: {e}')
        return text

    # 플레이스홀더 복원
    for ph, term in placeholders.items():
        translated = translated.replace(ph, term)

    # 용어집 강제 치환
    for ko, en in sorted(glossary_map.get('translate', {}).items(), key=lambda x: -len(x[0])):
        if not ko.startswith('_'):
            translated = translated.replace(ko, en)

    return translated

# ── 메인 ─────────────────────────────────────────
def main():
    print('=' * 55)
    print('INTEKPLUS ALARM Manager — 자동 번역 스크립트')
    print('=' * 55)

    # 환경변수 검증
    missing = [k for k, v in [
        ('DEEPL_API_KEY', DEEPL_API_KEY),
        ('FIREBASE_SERVICE_ACCOUNT', FIREBASE_SERVICE_JSON),
        ('FIREBASE_DB_URL', FIREBASE_DB_URL),
    ] if not v]
    if missing:
        print(f'[ERROR] 환경변수 없음: {", ".join(missing)}')
        sys.exit(1)

    print(f'[INFO] Firebase DB URL: {FIREBASE_DB_URL}')

    # glossary.json 로드
    gpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'glossary.json')
    if os.path.exists(gpath):
        with open(gpath, 'r', encoding='utf-8') as f:
            glossary = json.load(f)
        print(f'[OK] glossary.json: {len(glossary.get("translate", {}))}개 용어')
    else:
        glossary = {'preserve': {}, 'translate': {}}
        print('[WARN] glossary.json 없음')

    # Firebase 토큰
    print('[INFO] Firebase 인증 중...')
    token = get_firebase_token()

    # DeepL 사용량 확인
    cnt, lim, pct = get_deepl_usage()
    print(f'[INFO] DeepL 사용량: {cnt:,} / {lim:,} ({pct*100:.1f}%)')

    # Firebase에 상태 저장
    status = {
        'usage_count': cnt, 'usage_limit': lim,
        'usage_pct': round(pct * 100, 1),
        'warning': pct >= WARN_THRESHOLD,
        'last_checked': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
        'last_error': ''
    }
    fb_put('translationStatus', token, status)

    if pct >= WARN_THRESHOLD:
        print(f'[WARN] 사용량 {pct*100:.1f}% — 번역 중단')
        return

    # ── actions 번역 ──
    print('[INFO] actions 조회 중...')
    actions = fb_get('actions', token)
    translated_count = 0

    if actions and isinstance(actions, dict):
        to_do = []
        for alarm_key, acts in actions.items():
            if not isinstance(acts, list):
                continue
            for i, act in enumerate(acts):
                if isinstance(act, dict) and not act.get('is_translated') and act.get('text','').strip():
                    to_do.append((alarm_key, i, act))

        print(f'[INFO] 조치방안 번역 대상: {len(to_do)}건')

        for alarm_key, idx, act in to_do[:MAX_ITEMS_PER_RUN]:
            text = act.get('text', '')
            if not re.search(r'[가-힣]', text):
                fb_patch(f'actions/{alarm_key}/{idx}', token, {'is_translated': True, 'text_en': text})
                translated_count += 1
                continue

            print(f'  [{translated_count+1}] {alarm_key}[{idx}]: {text[:40]}...')
            result = deepl_translate(text, glossary)
            if result is None:
                print('[WARN] 한도 초과 — 중단')
                break

            fb_patch(f'actions/{alarm_key}/{idx}', token, {
                'is_translated': True,
                'text_en': result
            })
            translated_count += 1
            time.sleep(0.3)
    else:
        print('[INFO] actions 없음')

    # ── customAlarms(Trouble) 번역 ──
    remaining = MAX_ITEMS_PER_RUN - translated_count
    if remaining > 0:
        print('[INFO] Trouble 조회 중...')
        custom = fb_get('customAlarms', token)
        if custom and isinstance(custom, list):
            trouble_todo = [
                (i, a) for i, a in enumerate(custom)
                if isinstance(a, dict)
                and a.get('type') == 'Trouble'
                and not a.get('is_translated')
                and any(re.search(r'[가-힣]', a.get(f, '')) for f in ['name','tr_desc','direct_cause'])
            ]
            print(f'[INFO] Trouble 번역 대상: {len(trouble_todo)}건')

            for idx, alarm in trouble_todo[:remaining]:
                updates = {'is_translated': True}
                stopped = False
                for field in ['name', 'tr_desc', 'direct_cause']:
                    val = alarm.get(field, '')
                    if not val or not re.search(r'[가-힣]', val):
                        updates[f'{field}_en'] = val
                        continue
                    result = deepl_translate(val, glossary)
                    if result is None:
                        stopped = True; break
                    updates[f'{field}_en'] = result
                    time.sleep(0.2)
                if stopped:
                    break
                fb_patch(f'customAlarms/{idx}', token, updates)
                translated_count += 1

    # 최종 사용량 업데이트
    cnt2, lim2, pct2 = get_deepl_usage()
    fb_put('translationStatus', token, {**status,
        'usage_count': cnt2, 'usage_pct': round(pct2*100,1),
        'warning': pct2 >= WARN_THRESHOLD,
        'last_checked': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
    })

    print('=' * 55)
    print(f'[완료] 번역: {translated_count}건')
    print(f'[완료] DeepL 사용량: {cnt2:,} / {lim2:,} ({pct2*100:.1f}%)')
    print('=' * 55)

if __name__ == '__main__':
    main()
