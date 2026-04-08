"""
INTEKPLUS ALARM Manager - 자동 번역 스크립트
Firebase Realtime Database에서 is_translated=false 항목을 찾아
DeepL API로 번역 후 저장합니다.
glossary.json 용어집을 참조하여 전문 용어를 강제 치환합니다.
"""

import os
import json
import time
import re
import sys
import urllib.request
import urllib.parse
import urllib.error

# ── 환경변수에서 키 로드 ──────────────────────────
DEEPL_API_KEY        = os.environ.get('DEEPL_API_KEY', '')
FIREBASE_SERVICE_JSON = os.environ.get('FIREBASE_SERVICE_ACCOUNT', '')
FIREBASE_DB_URL      = os.environ.get('FIREBASE_DB_URL', '')

WARN_THRESHOLD = 0.95   # 95% 초과 시 경고
MAX_ITEMS_PER_RUN = 50  # 1회 실행당 최대 번역 건수 (API 절약)

# ── Firebase REST 인증 토큰 발급 ──────────────────
def get_firebase_token():
    """서비스 계정 JSON으로 Firebase 액세스 토큰 발급"""
    try:
        import google.auth
        import google.auth.transport.requests
        from google.oauth2 import service_account

        creds_info = json.loads(FIREBASE_SERVICE_JSON)
        scopes = ['https://www.googleapis.com/auth/firebase.database',
                  'https://www.googleapis.com/auth/userinfo.email']
        credentials = service_account.Credentials.from_service_account_info(
            creds_info, scopes=scopes)
        request = google.auth.transport.requests.Request()
        credentials.refresh(request)
        return credentials.token
    except Exception as e:
        print(f'[ERROR] Firebase 토큰 발급 실패: {e}')
        sys.exit(1)

# ── Firebase REST API 헬퍼 ────────────────────────
def fb_get(path, token):
    url = f"{FIREBASE_DB_URL}/{path}.json?access_token={token}"
    try:
        with urllib.request.urlopen(url) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f'[ERROR] Firebase GET {path}: {e}')
        return None

def fb_patch(path, data, token):
    url = f"{FIREBASE_DB_URL}/{path}.json?access_token={token}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        method='PATCH',
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f'[ERROR] Firebase PATCH {path}: {e}')
        return None

def fb_put(path, data, token):
    url = f"{FIREBASE_DB_URL}/{path}.json?access_token={token}"
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        method='PUT',
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f'[ERROR] Firebase PUT {path}: {e}')
        return None

# ── DeepL API ─────────────────────────────────────
def get_deepl_usage():
    """현재 사용량 조회"""
    url = 'https://api-free.deepl.com/v2/usage'
    req = urllib.request.Request(url, headers={'Authorization': f'DeepL-Auth-Key {DEEPL_API_KEY}'})
    try:
        with urllib.request.urlopen(req) as r:
            data = json.loads(r.read())
            count = data.get('character_count', 0)
            limit = data.get('character_limit', 500000)
            pct   = count / limit if limit else 0
            return count, limit, pct
    except Exception as e:
        print(f'[ERROR] DeepL 사용량 조회 실패: {e}')
        return 0, 500000, 0

def deepl_translate(text, glossary_map):
    """텍스트 번역 (용어집 전처리 → DeepL → 용어집 후처리)"""
    if not text or not text.strip():
        return text

    # 1. 용어집 전처리: 보존 용어에 플레이스홀더 삽입
    placeholders = {}
    processed = text
    preserve_terms = list(glossary_map.get('preserve', {}).keys())
    # 긴 용어 먼저 처리
    for i, term in enumerate(sorted(preserve_terms, key=len, reverse=True)):
        ph = f'__TERM{i}__'
        if term in processed:
            processed = processed.replace(term, ph)
            placeholders[ph] = term

    # 2. DeepL 번역
    url = 'https://api-free.deepl.com/v2/translate'
    params = urllib.parse.urlencode({
        'auth_key': DEEPL_API_KEY,
        'text': processed,
        'source_lang': 'KO',
        'target_lang': 'EN-US',
        'preserve_formatting': '1'
    }).encode()

    try:
        req = urllib.request.Request(url, data=params, method='POST')
        with urllib.request.urlopen(req) as r:
            result = json.loads(r.read())
            translated = result['translations'][0]['text']
    except urllib.error.HTTPError as e:
        if e.code == 456:
            print('[WARN] DeepL 사용량 초과 (456)')
            return None  # None 반환 시 중단 신호
        print(f'[ERROR] DeepL API: {e.code} {e.reason}')
        return text
    except Exception as e:
        print(f'[ERROR] DeepL 번역 실패: {e}')
        return text

    # 3. 플레이스홀더 복원
    for ph, term in placeholders.items():
        translated = translated.replace(ph, term)

    # 4. 번역 용어 강제 치환
    for ko, en in sorted(glossary_map.get('translate', {}).items(), key=lambda x: -len(x[0])):
        if ko.startswith('_'):
            continue
        translated = translated.replace(ko, en)

    return translated

# ── 메인 로직 ─────────────────────────────────────
def main():
    print('=' * 50)
    print('INTEKPLUS ALARM Manager - 자동 번역 스크립트')
    print('=' * 50)

    # 필수 환경변수 확인
    if not DEEPL_API_KEY:
        print('[ERROR] DEEPL_API_KEY 환경변수 없음')
        sys.exit(1)
    if not FIREBASE_SERVICE_JSON:
        print('[ERROR] FIREBASE_SERVICE_ACCOUNT 환경변수 없음')
        sys.exit(1)
    if not FIREBASE_DB_URL:
        print('[ERROR] FIREBASE_DB_URL 환경변수 없음')
        sys.exit(1)

    # glossary.json 로드
    glossary_path = os.path.join(os.path.dirname(__file__), 'glossary.json')
    if os.path.exists(glossary_path):
        with open(glossary_path, 'r', encoding='utf-8') as f:
            glossary = json.load(f)
        print(f'[OK] glossary.json 로드: {len(glossary.get("translate",{}))}개 용어')
    else:
        glossary = {'preserve': {}, 'translate': {}}
        print('[WARN] glossary.json 없음, 용어집 없이 진행')

    # Firebase 토큰
    print('[INFO] Firebase 인증 중...')
    token = get_firebase_token()
    print('[OK] Firebase 인증 완료')

    # DeepL 사용량 확인
    count, limit, pct = get_deepl_usage()
    print(f'[INFO] DeepL 사용량: {count:,} / {limit:,} ({pct*100:.1f}%)')

    # Firebase에 사용량 저장 (Admin UI 표시용)
    status = {
        'usage_count': count,
        'usage_limit': limit,
        'usage_pct':   round(pct * 100, 1),
        'warning':     pct >= WARN_THRESHOLD,
        'last_checked': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
        'last_error':  ''
    }
    fb_put('translationStatus', status, token)

    # 95% 이상이면 번역 중단
    if pct >= WARN_THRESHOLD:
        print(f'[WARN] 사용량 {pct*100:.1f}% - 번역 중단 (임계값: {WARN_THRESHOLD*100}%)')
        print('[INFO] Firebase에 경고 상태 저장 완료')
        return

    # actions에서 is_translated=false 항목 조회
    print('[INFO] 번역 대상 조회 중...')
    actions = fb_get('actions', token)

    if not actions:
        print('[INFO] actions 데이터 없음 - 종료')
        return

    # 번역 대상 수집
    to_translate = []
    for alarm_key, acts in actions.items():
        if not isinstance(acts, list):
            continue
        for i, act in enumerate(acts):
            if not isinstance(act, dict):
                continue
            if not act.get('is_translated', False) and act.get('text', '').strip():
                to_translate.append((alarm_key, i, act))

    print(f'[INFO] 번역 대상: {len(to_translate)}건')

    if not to_translate:
        print('[INFO] 번역할 항목 없음 - 종료')
        return

    # customAlarms(트러블)에서 is_translated=false 조회
    custom_alarms = fb_get('customAlarms', token) or []
    trouble_to_translate = []
    if isinstance(custom_alarms, list):
        for i, alarm in enumerate(custom_alarms):
            if not isinstance(alarm, dict):
                continue
            if alarm.get('type') == 'Trouble' and not alarm.get('is_translated', False):
                fields = ['name', 'tr_desc', 'direct_cause']
                needs = any(bool(alarm.get(f,'').strip()) and re.search(r'[가-힣]', alarm.get(f,'')) for f in fields)
                if needs:
                    trouble_to_translate.append((i, alarm))

    print(f'[INFO] Trouble 번역 대상: {len(trouble_to_translate)}건')

    # 번역 실행 (최대 MAX_ITEMS_PER_RUN건)
    translated_count = 0
    error_count = 0
    total_limit = MAX_ITEMS_PER_RUN

    # 조치방안 번역
    for alarm_key, idx, act in to_translate[:total_limit]:
        text = act.get('text', '')
        if not re.search(r'[가-힣]', text):
            # 한글 없으면 그냥 완료 처리
            fb_patch(f'actions/{alarm_key}/{idx}', {'is_translated': True, 'text_en': text}, token)
            translated_count += 1
            continue

        print(f'  번역 중: {alarm_key} [{idx}] - {text[:30]}...')
        translated = deepl_translate(text, glossary)

        if translated is None:  # 사용량 초과
            print('[WARN] 사용량 초과로 번역 중단')
            break

        fb_patch(f'actions/{alarm_key}/{idx}', {
            'is_translated': True,
            'text_en': translated
        }, token)
        translated_count += 1
        time.sleep(0.3)  # API 요청 간격

    # Trouble 번역 (남은 한도 내에서)
    remaining = total_limit - translated_count
    for idx, alarm in trouble_to_translate[:remaining]:
        fields_to_translate = ['name', 'tr_desc', 'direct_cause']
        updates = {'is_translated': True}
        skip = False

        for field in fields_to_translate:
            val = alarm.get(field, '')
            if not val or not re.search(r'[가-힣]', val):
                updates[f'{field}_en'] = val
                continue
            print(f'  Trouble 번역: [{idx}] {field} - {val[:30]}...')
            result = deepl_translate(val, glossary)
            if result is None:
                skip = True
                break
            updates[f'{field}_en'] = result
            time.sleep(0.3)

        if skip:
            print('[WARN] 사용량 초과로 Trouble 번역 중단')
            break

        fb_patch(f'customAlarms/{idx}', updates, token)
        translated_count += 1

    # 최종 사용량 업데이트
    count2, limit2, pct2 = get_deepl_usage()
    status.update({
        'usage_count': count2,
        'usage_pct':   round(pct2 * 100, 1),
        'warning':     pct2 >= WARN_THRESHOLD,
        'last_checked': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
    })
    fb_put('translationStatus', status, token)

    print('=' * 50)
    print(f'[완료] 번역: {translated_count}건 / 오류: {error_count}건')
    print(f'[완료] DeepL 사용량: {count2:,} / {limit2:,} ({pct2*100:.1f}%)')
    print('=' * 50)

if __name__ == '__main__':
    main()
