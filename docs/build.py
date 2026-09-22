#!/usr/bin/env python3
"""Assemble the Inborn spec + demo into artifact fragments and standalone HTML files."""
import os, glob, re, sys, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
# docs/spec and docs/demo were renamed to spec-src and demo-src on 3.9.2026 (commit 077aacf,
# the Autark -> Inborn rename); this script was never updated and has failed with a missing-file
# exit ever since (verified 22.9.2026 -- every "rebuilt from docs/build.py" commit message since
# then was wrong). Final HTML lives directly in docs/, not docs/out/, so OUT = ROOT.
SPEC = os.path.join(ROOT, 'spec-src')
OUT = ROOT
os.makedirs(OUT, exist_ok=True)

BRAND = 'Inborn'
DOMAIN = 'inbornapp.com'
SUBS = {
    '{{BRAND}}': BRAND,
    '{{DOMAIN}}': DOMAIN,
    '{{TAGLINE_HE}}': 'AI that never leaves your phone: עוזר בינה מלאכותית שרץ כולו על המכשיר, בלי חשבון, בלי ענן, ובאנדרואיד בלי הרשאת אינטרנט.',
    # "voice" is a docs/store voice_lines item: drop it with the voice sentences if M5b misses 1.0.
    '{{IOS_KEYWORDS}}': "assistant,secure,encrypted,gguf,deepseek,qwen,gemma,mistral,phi,documents,pdf,notes,voice,incognito",
    '{{IOS_PROMO}}': "Private AI chat that runs 100% on your phone. No account, no cloud, no analytics. Works in Airplane Mode. One-time purchase for Pro. Verify it yourself.",
    '{{PLAY_OPENING}}': "Inborn is an offline AI chat app. The AI model runs 100% on your phone, so it works with no internet connection: on a plane, on the subway, abroad, or with Wi-Fi off. Nothing you type ever leaves your device.",
}

def apply(s):
    for k, v in SUBS.items():
        s = s.replace(k, v)
    left = re.findall(r'\{\{[A-Z_]+\}\}', s)
    if left:
        print('WARNING unresolved placeholders:', sorted(set(left)))
    return s

CM_SRC = os.path.expanduser('~/.claude/skills/doc-comments/comments.src.html')  # global skill = single source of truth
if not os.path.exists(CM_SRC):
    CM_SRC = os.path.join(ROOT, 'comments', 'comments.src.html')
def comments_layer(doc):
    """Google-Docs-style comment layer appended to both outputs; seeds carry Claude's replies back in."""
    if not os.path.exists(CM_SRC):
        return ''
    seed_path = os.path.join(ROOT, 'comments', doc + '-seed.json')
    seed = open(seed_path, encoding='utf-8').read().strip() if os.path.exists(seed_path) else '{"threads":[]}'
    seed = seed.replace('</script', '<\\/script')
    return '\n' + open(CM_SRC, encoding='utf-8').read().replace('{{CMDOC}}', doc).replace('{{CMMODE}}', 'auto').replace('{{CMSEED}}', seed)

def wrap(fragment, lang, dirn):
    return ('<!doctype html>\n<html lang="%s" dir="%s">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n%s\n</body>\n</html>\n') % (lang, dirn, fragment)

# ---- spec ----
parts = sorted(glob.glob(os.path.join(SPEC, '*.html')))
order = ['00-head','01-summary','02-vision','03-brand','04-platforms','05-architecture','06-models','07-features',
         '08-screens','09-design','10-edgecases','11-store-legal','12-monetization','13-aso','14-plan','15-metrics',
         '16-risks','17-sources']
import html as _html
TIERS = {'01':'must','02':'must','03':'must','04':'must','07':'must','12':'must','16':'must',
         '05':'rec','06':'rec','09':'rec','13':'rec','14':'rec','15':'rec',
         '08':'ref','10':'ref','11':'ref','17':'ref'}
TIER_LABEL = {'must':'MUST','rec':'RECOMMENDED','ref':'REFERENCE'}
WPM = 200
def words_of(h):
    tx = re.sub(r'<style[\s\S]*?</style>|<script[\s\S]*?</script>', '', h)
    tx = _html.unescape(re.sub(r'<[^>]+>', ' ', tx))
    return len(tx.split())
frag = []; meta = {}
for name in order:
    fn = os.path.join(SPEC, name + '.html')
    if not os.path.exists(fn):
        sys.exit('missing ' + fn)
    h = open(fn, encoding='utf-8').read()
    num = name[:2]
    if num == '00':
        frag.append(h); continue
    tier = TIERS[num]; w = words_of(h); mins = max(1, round(w / WPM))
    meta[num] = (tier, w, mins)
    # reading time + tier pill inside the section heading
    h = re.sub(r'</h2>', '<span class="tierpill">%s</span><span class="h2min">~%d min</span></h2>' % (TIER_LABEL[tier], mins), h, count=1)
    frag.append('<section class="sec" data-tier="%s" data-words="%d">\n%s\n</section>' % (tier, w, h))
spec = apply('\n'.join(frag))
# TOC: tier + minutes per entry
def toc_sub(m):
    n = int(m.group(1)); num = '%02d' % n; tier, w, mins = meta[num]
    return '<li data-tier="%s"><a href="#s%d"><span>%s</span><span class="min">%d\u2032</span></a></li>' % (tier, n, m.group(2), mins)
spec = re.sub(r'<li><a href="#s(\d+)">(.*?)</a></li>', toc_sub, spec)
# reading guide
def tier_sum(tr): return sum(v[1] for k, v in meta.items() if v[0] == tr)
def tier_min(tr): return round(tier_sum(tr) / WPM)
total_min = round(sum(v[1] for v in meta.values()) / WPM)
guide = ('<section class="guide" aria-label="מדריך קריאה">\n<div class="row">'
  '<div class="tier must"><span class="k">MUST · ~%d MIN</span><p class="t">חובה לפני החלטה</p><p class="l">תקציר מנהלים, חזון וחוקים, שוק ומותג, פלטפורמות וקוד אחד, מפת הפיצ\'רים, תמחור, סיכונים והחלטות.</p></div>'
  '<div class="tier rec"><span class="k">RECOMMENDED · ~%d MIN</span><p class="t">מומלץ למי שרוצה להבין איך</p><p class="l">ארכיטקטורה, מודלים ומכשירים, מערכת העיצוב, ASO ויציאה לשוק, תוכנית עבודה, מדדים.</p></div>'
  '<div class="tier ref"><span class="k">REFERENCE · ~%d MIN</span><p class="t">עיון בעת הצורך, לבנייה</p><p class="l">מסך אחר מסך (הדמו מציג אותם), 70 מקרי קצה, חנויות ורישוי, מקורות. נכתבו כדי שהמפתח לא יצטרך לנחש.</p></div>'
  '</div>\n<div class="viewsw" role="group" aria-label="מה להציג"><button type="button" data-view="all" class="on">הכל · ~%d דק\'</button><button type="button" data-view="rec">חובה + מומלץ · ~%d דק\'</button><button type="button" data-view="must">חובה בלבד · ~%d דק\'</button></div>'
  '<p class="l" style="margin-top:8px">המסנן רק מסתיר סעיפים; שום דבר לא נמחק והבחירה נשמרת בדפדפן. ההערות שלך נשמרות גם על סעיפים מוסתרים.</p>\n</section>'
  ) % (tier_min('must'), tier_min('rec'), tier_min('ref'), total_min, tier_min('must') + tier_min('rec'), tier_min('must'))
spec = spec.replace('{{GUIDE}}', guide) + comments_layer('spec')
# demo link placeholder (filled after the demo is published)
demo_url = os.environ.get('DEMO_URL', '') or 'inborn-demo.html'
spec = spec.replace('{{DEMO_URL}}', demo_url)
open(os.path.join(OUT, 'inborn-spec.artifact.html'), 'w', encoding='utf-8').write(spec)
open(os.path.join(OUT, 'inborn-spec.html'), 'w', encoding='utf-8').write(wrap(spec, 'he', 'rtl'))

# ---- demo ----
demo_src = os.path.join(ROOT, 'demo-src', 'inborn-demo.src.html')
if os.path.exists(demo_src):
    demo = apply(open(demo_src, encoding='utf-8').read()) + comments_layer('demo')
    spec_url = os.environ.get('SPEC_URL', '')
    demo = demo.replace('{{SPEC_URL}}', spec_url or 'inborn-spec.html')
    open(os.path.join(OUT, 'inborn-demo.artifact.html'), 'w', encoding='utf-8').write(demo)
    open(os.path.join(OUT, 'inborn-demo.html'), 'w', encoding='utf-8').write(wrap(demo, 'en', 'ltr'))

for f in sorted(glob.glob(os.path.join(OUT, '*.html'))):
    print('%-40s %8d bytes' % (os.path.basename(f), os.path.getsize(f)))
