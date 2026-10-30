import json, re, sys, io, urllib.request, urllib.parse, html, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
UA = {'User-Agent': 'taiwan-bird-atlas-build/1.0 (https://github.com/M255525)'}
def get(url):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read())
data = subprocess.run(['node', '-e', "global.window={};eval(require('fs').readFileSync('data.js','utf8'));console.log(JSON.stringify(window.BA.BIRDS.map(b=>[b.id,b.sci,b.en])))"], capture_output=True, text=True, encoding='utf-8').stdout
birds = json.loads(data)
OK = re.compile(r'^(CC0|Public domain|PD.*|CC BY(-SA)? [0-9.]+.*)$', re.I)
out = {}
for bid, sci, en in birds:
    title = ' '.join(sci.split()[:2])
    q = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action':'query','format':'json','prop':'pageimages','piprop':'name','pilicense':'free','redirects':1,'titles':title})
    pages = get(q)['query']['pages']
    p = next(iter(pages.values()))
    f = p.get('pageimage')
    if not f:
        print('NOIMG', bid, title); continue
    q2 = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':800,'titles':'File:' + f})
    pg = next(iter(get(q2)['query']['pages'].values()))
    if 'imageinfo' not in pg:
        print('NOCOMMONS', bid, f); continue
    ii = pg['imageinfo'][0]; md = ii.get('extmetadata', {})
    lic = md.get('LicenseShortName', {}).get('value', '')
    art = html.unescape(re.sub(r'<[^>]+>', '', md.get('Artist', {}).get('value', ''))).strip()
    art = re.sub(r'\s+', ' ', art)[:80] or '（未具名）'
    if not OK.match(lic):
        print('BADLIC', bid, lic, f); continue
    out[bid] = {'src': ii['thumburl'].split('?')[0], 'file': f.replace('_', ' '), 'page': ii['descriptionurl'], 'author': art, 'license': lic,
                'licenseUrl': md.get('LicenseUrl', {}).get('value', ''), 'article': p['title']}
    print('OK', bid, '|', p['title'], '|', lic, '|', art, '|', f)
js = '/* 實景照片：取自 Wikimedia Commons，僅收錄 CC0／公有領域／CC BY／CC BY-SA 授權，頁面上逐張標示作者、授權與來源。\n * 由建置腳本查詢各物種英文維基百科條目的代表圖（pilicense=free）後產生；未收錄者在圖鑑中改用 3D 模型。 */\nBA.PHOTOS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n'
open('photos.js', 'w', encoding='utf-8').write(js)
print('total', len(out), '/', len(birds))
