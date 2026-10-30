/* ================= 台灣賞鳥地圖：介面 ================= */
(function(){
'use strict';
var $ = function(id){ return document.getElementById(id); };
var PREF_KEY = 'birdAtlasPrefs', SET_KEY = 'birdAtlasSettings', SEEN_KEY = 'birdAtlasSeenWarning';
var SEASON = {12:'冬', 1:'冬', 2:'冬', 3:'春', 4:'春', 5:'春', 6:'夏', 7:'夏', 8:'夏', 9:'秋', 10:'秋', 11:'秋'};
var SKY = {春:['#a8e2ff', '#eaf9ee'], 夏:['#73cbff', '#d6f2ff'], 秋:['#ffd2a8', '#e3f2ff'], 冬:['#aebfe3', '#e2ebf7']};
var ICON = {wet:'🦢', low:'🐦', mtn:'🌲'};
var NOW = new Date().getMonth() + 1;

function lsGet(k, d){ try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e){ return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e){} }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }

var set = Object.assign({hab:'last', labels:true, motion:'auto', theme:'auto', play:2800}, lsGet(SET_KEY, {}));
var pref = lsGet(PREF_KEY, {});
var startHab = set.hab !== 'last' ? set.hab : pref.hab;
var st = {month:NOW, hab:BA.HABITATS[startHab] ? startHab : 'wet', region:BA.regionById[pref.region] ? pref.region : 'all', spot:BA.spotById[pref.spot] ? pref.spot : null, hl:null};
if (st.spot) st.region = BA.spotById[st.spot].r;
function save(){ lsSet(PREF_KEY, {hab:st.hab, region:st.region, spot:st.spot}); }
function reduceOn(){ return set.motion === 'reduce' || (set.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function applyTheme(){ if (set.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', set.theme); }
applyTheme();

/* ---------- 照片 ---------- */
function photoOf(b){ return BA.PHOTOS && BA.PHOTOS[b.id] || null; }
function thumbOf(ph, w){ return ph.src.indexOf('/960px-') > 0 ? ph.src.replace('/960px-', '/' + w + 'px-') : ph.src; }

/* ---------- 選擇器 ---------- */
function fillSelectors(){
  var r = $('selRegion');
  r.innerHTML = '<option value="all">全台灣（各區代表）</option>' + BA.REGIONS.map(function(x){ return '<option value="' + x.id + '">' + x.name + '｜' + x.sub + '</option>'; }).join('');
  r.value = st.region;
  var spots = BA.SPOTS.filter(function(p){ return st.region === 'all' || p.r === st.region; });
  $('selSpot').innerHTML = '<option value="">' + (st.region === 'all' ? '選一個賞鳥熱點…' : '整個' + BA.regionById[st.region].name) + '</option>' +
    spots.map(function(p){ return '<option value="' + p.id + '">' + p.name + '（' + p.h.map(function(h){ return BA.HABITATS[h].short; }).join('・') + '）</option>'; }).join('');
  $('selSpot').value = st.spot || '';
}
function buildMonths(){
  var h = '';
  for (var m = 1; m <= 12; m++) h += '<button class="mbtn' + (m === NOW ? ' now' : '') + '" data-m="' + m + '" type="button" role="tab">' + m + '月<small>' + SEASON[m] + '</small></button>';
  $('months').innerHTML = h;
  var SC = {春:'#a8e6a1', 夏:'#ffd166', 秋:'#ff9f6e', 冬:'#9ec5ff'}, line = '';
  for (m = 1; m <= 12; m++) line += '<span style="background:' + SC[SEASON[m]] + '" title="' + SEASON[m] + '季"></span>';
  $('axLine').innerHTML = line;
}

/* ---------- 查詢 ---------- */
function birdsAt(hab, m){
  if (st.spot){ var p = BA.spotById[st.spot]; return p.h.indexOf(hab) >= 0 ? BA.birdsFor(p.r, hab, m, p.id) : []; }
  if (st.region !== 'all') return BA.birdsFor(st.region, hab, m);
  return BA.BIRDS.filter(function(b){ return BA.REGIONS.some(function(r){ return BA.birdsFor(r.id, hab, m).indexOf(b) >= 0; }); });
}
function renderAxis(){
  var c = {}, max = 1, m;
  BA.HAB_ORDER.forEach(function(h){ c[h] = []; for (m = 1; m <= 12; m++){ c[h][m] = birdsAt(h, m).length; max = Math.max(max, c[h][m]); } });
  var html = '';
  for (m = 1; m <= 12; m++){
    html += '<div class="axc' + (m === st.month ? ' on' : '') + '" title="' + m + ' 月：' + BA.HAB_ORDER.map(function(h){ return BA.HABITATS[h].short + ' ' + c[h][m] + ' 種'; }).join('、') + '"><b>' + c[st.hab][m] + '</b>' +
      BA.HAB_ORDER.map(function(h){ return '<i class="' + h + (h === st.hab ? '' : ' dim') + '" style="height:' + Math.round(c[h][m] / max * 30 + 2) + 'px"></i>'; }).join('') + '</div>';
  }
  $('axBars').innerHTML = html;
  $('mRange').value = st.month;
  $('mRange').setAttribute('aria-valuetext', st.month + ' 月');
}
function byHot(a, b){ return (b.hot ? 1 : 0) - (a.hot ? 1 : 0); }
function listNow(){
  var m = st.month, h = st.hab;
  if (st.spot) return birdsAt(h, m).map(function(b){ return {b:b, hot:b.hot.indexOf(st.spot) >= 0}; }).sort(byHot);
  if (st.region !== 'all'){
    var ids = BA.SPOTS.filter(function(p){ return p.r === st.region; }).map(function(p){ return p.id; });
    return birdsAt(h, m).map(function(b){ return {b:b, hot:b.hot.some(function(x){ return ids.indexOf(x) >= 0; })}; }).sort(byHot);
  }
  return birdsAt(h, m).map(function(b){ return {b:b, hot:false, regions:BA.REGIONS.filter(function(r){ return BA.birdsFor(r.id, h, m).indexOf(b) >= 0; })}; });
}
/* 地圖上放哪些鳥：選熱點放完整清單，選區域／全台放代表熱點 */
function repSpot(region, hab){
  var sp = BA.SPOTS.filter(function(p){ return p.r === region && p.h.indexOf(hab) >= 0; });
  sp.sort(function(a, b){ return BA.birdsFor(b.r, hab, st.month, b.id).length - BA.birdsFor(a.r, hab, st.month, a.id).length; });
  return sp[0] || null;
}
function groups3D(){
  var m = st.month, h = st.hab;
  if (st.spot) return [{spotId:st.spot, hab:h, list:listNow().slice(0, 12)}];
  var regs = st.region !== 'all' ? [st.region] : BA.REGIONS.map(function(r){ return r.id; }), used = {};
  return regs.map(function(rid){
    var sp = repSpot(rid, h); if (!sp) return null;
    var l = BA.birdsFor(rid, h, m, sp.id).map(function(b){ return {b:b, hot:b.hot.indexOf(sp.id) >= 0}; });
    l.sort(function(a, b){ return byHot(a, b) || ((used[a.b.id] || 0) - (used[b.b.id] || 0)); });
    l = l.slice(0, st.region !== 'all' ? 8 : 3); l.forEach(function(x){ used[x.b.id] = (used[x.b.id] || 0) + 1; });
    return {spotId:sp.id, hab:h, list:l};
  }).filter(Boolean);
}
/* 鷹河：秋季 9 月赤腹鷹、10 月灰面鵟鷹南下，春季 3–4 月北返 */
function hawkOpt(){
  var m = st.month, rel = !st.spot ? (st.region === 'all' || st.region === 'C' || st.region === 'S') : ['sheding', 'manzhou', 'baguashan'].indexOf(st.spot) >= 0;
  if (!rel || st.hab !== 'low' && st.region !== 'all' || [3, 4, 9, 10].indexOf(m) < 0) return null;
  var b = m === 9 ? 'sparrowhawk' : 'greyfacedbuzzard', north = m < 6;
  return {birdId:b, north:north, label:'🦅 鷹河：' + BA.birdById[b].name + (north ? '北返' : '南下'), scale:st.region === 'all' && !st.spot ? 1.6 : 1};
}

/* ---------- 畫面 ---------- */
function birdCard(x){
  var b = x.b, ph = photoOf(b), sub = x.regions ? x.regions.map(function(r){ return r.name; }).join('・') : b.en;
  return '<button class="bcard' + (st.hl === b.id ? ' on' : '') + '" type="button" data-bird="' + b.id + '"><span class="pic">' + ICON[st.hab] +
    (ph ? '<img loading="lazy" referrerpolicy="no-referrer" alt="" src="' + esc(thumbOf(ph, 330)) + '" onerror="this.remove()">' : '') +
    '<span class="st">' + BA.STATUS[b.st] + '</span></span>' +
    '<b>' + esc(b.name) + (x.hot ? '<em title="代表鳥種">★</em>' : '') + (b.endemic === 1 ? '<em style="color:#2f8a57">特有</em>' : '') + '</b><small>' + esc(sub) + '</small></button>';
}
function render(opts){
  opts = opts || {};
  document.querySelectorAll('.mbtn').forEach(function(b){ var on = +b.dataset.m === st.month; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  var mb = document.querySelector('.mbtn.on'), mc = $('months');
  if (mb && mc.scrollWidth > mc.clientWidth) mc.scrollLeft = mb.offsetLeft - mc.offsetLeft - (mc.clientWidth - mb.offsetWidth) / 2;
  var sp = st.spot ? BA.spotById[st.spot] : null;
  document.querySelectorAll('.hbtn').forEach(function(b){
    var on = b.dataset.h === st.hab; b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    b.classList.toggle('na', !!sp && sp.h.indexOf(b.dataset.h) < 0);
  });
  renderAxis();
  var sky = SKY[SEASON[st.month]], stage = $('stage');
  stage.style.setProperty('--sky1', sky[0]); stage.style.setProperty('--sky2', sky[1]);
  var place = $('place'), H = BA.HABITATS[st.hab];
  if (sp){
    place.innerHTML = '<h2>' + esc(sp.name) + '<small>' + esc(sp.city) + '・' + BA.regionById[sp.r].name + '</small></h2>' +
      '<div class="meta">' + sp.h.map(function(h){ return '<span class="h-' + h + '">' + BA.HABITATS[h].name + '</span>'; }).join('') + '<span>海拔約 ' + sp.elev.toLocaleString() + ' m</span><span>最佳：' + esc(sp.best) + '</span></div>' +
      '<p>' + esc(sp.note) + '</p><details class="tips"' + (innerWidth > 760 ? ' open' : '') + '><summary>📌 這裡要注意</summary><ul>' + sp.tips.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>';
  } else if (st.region !== 'all'){
    var r = BA.regionById[st.region];
    place.innerHTML = '<h2>' + r.name + '<small>' + r.sub + '</small></h2><p>本區有 ' + BA.SPOTS.filter(function(x){ return x.r === r.id; }).length + ' 個賞鳥熱點，點地圖上的賞鳥小屋或上方選單看單一熱點。</p>';
  } else {
    place.innerHTML = '<h2>全台灣<small>本島＋金門、馬祖、澎湖、蘭嶼</small></h2><p>地圖上每區先放幾種代表鳥。點賞鳥小屋或上方選單選熱點，可以看完整清單與當地注意事項。</p>';
  }
  var L = listNow();
  $('sum').innerHTML = '<span>' + st.month + ' 月・' + SEASON[st.month] + '季・<span title="' + esc(H.desc) + '">' + H.name + '</span></span><b>' + L.length + '</b><span>種鳥</span>';
  var list = $('list');
  if (sp && sp.h.indexOf(st.hab) < 0){
    list.innerHTML = '<div class="empty">' + esc(sp.name) + '以「' + sp.h.map(function(h){ return BA.HABITATS[h].name; }).join('、') + '」為主。<br>' +
      sp.h.map(function(h){ return '<button class="pbtn" type="button" data-sethab="' + h + '">切到' + BA.HABITATS[h].short + '</button>'; }).join(' ') + '</div>';
  } else if (!L.length) list.innerHTML = '<div class="empty">這個月份在這裡的' + H.short + '鳥種較少。<br>換個月份或棲地看看。</div>';
  else list.innerHTML = L.map(birdCard).join('');
  if (window.BirdScene && BirdScene.ready){
    BirdScene.setHabitat(st.hab);
    BirdScene.selectSpot(st.spot);
    BirdScene.showBirds(sp && sp.h.indexOf(st.hab) < 0 ? [] : groups3D(), {overview:!st.spot && st.region === 'all'});
    BirdScene.setHawks(hawkOpt());
    if (opts.fly){
      if (st.spot) BirdScene.focusSpot(st.spot);
      else if (st.region !== 'all') BirdScene.focusRegion(BA.SPOTS.filter(function(p){ return p.r === st.region; }).map(function(p){ return p.id; }));
      else BirdScene.overview();
    }
  }
  save();
}

/* ---------- 動作 ---------- */
function setMonth(m){ st.month = ((m - 1 + 12) % 12) + 1; render(); }
function setHabitat(h){ if (h === st.hab || !BA.HABITATS[h]) return; st.hab = h; render(); }
function selectSpot(id){
  st.spot = id || null;
  if (st.spot){ var sp = BA.spotById[st.spot]; st.region = sp.r; if (sp.h.indexOf(st.hab) < 0) st.hab = sp.h[0]; }
  fillSelectors(); render({fly:true});
}
function selectRegion(r){ st.region = r; st.spot = null; fillSelectors(); render({fly:true}); }
function hover(id){
  st.hl = id || null;
  if (window.BirdScene && BirdScene.ready) BirdScene.highlight(st.hl);
  document.querySelectorAll('.bcard').forEach(function(c){ c.classList.toggle('on', c.dataset.bird === st.hl); });
}

/* ---------- 圖鑑彈窗 ---------- */
var pvRun = null, lastFocus = null;
function calRows(b){
  var region = st.spot ? BA.spotById[st.spot].r : st.region !== 'all' ? st.region : null;
  var h = '<div class="cal"><span></span>';
  for (var m = 1; m <= 12; m++) h += '<span class="h' + (m === st.month ? ' cur' : '') + '">' + m + '</span>';
  BA.HAB_ORDER.forEach(function(z){
    var all = BA.monthsOf(b, z), here = region ? BA.monthsOf(b, z, region) : {};
    if (!Object.keys(all).length) return;
    h += '<span class="z">' + BA.HABITATS[z].short + '</span>';
    for (var m = 1; m <= 12; m++) h += '<span class="c' + (all[m] ? ' yes ' + z : '') + (here[m] ? ' here' : '') + (m === st.month ? ' cur' : '') + '" title="' + m + ' 月' + (all[m] ? '看得到' : '') + '"></span>';
  });
  return h + '</div><div class="calnote">色塊＝全台看得到的月份' + (region ? '；白點＝' + BA.regionById[region].name + '也看得到' : '') + '；紅框＝目前選的月份。</div>';
}
function showPhoto(b){
  var ph = photoOf(b), img = $('phImg'), cv = $('pv'), cr = $('phCredit');
  if (pvRun){ pvRun.stop(); pvRun = null; }
  function fallback(){
    img.hidden = true; img.removeAttribute('src');
    cr.innerHTML = '<span class="note">目前無法載入實景照片，改以 3D 模型示意。</span>';
    if (window.BirdScene && BirdScene.ready){ cv.hidden = false; requestAnimationFrame(function(){ pvRun = BirdScene.preview(cv, b.id); }); }
    else { cv.hidden = true; cr.innerHTML = '<span class="note">目前無法載入實景照片與 3D 模型（可能沒有網路）。</span>'; }
  }
  if (!ph){ fallback(); return; }
  cv.hidden = true; img.hidden = false;
  img.onerror = fallback;
  img.alt = b.name + '（' + b.en + '）實景照片';
  img.src = ph.src;
  cr.innerHTML = '📷 ' + esc(ph.author) + '｜<a href="' + esc(ph.licenseUrl || ph.page) + '" target="_blank" rel="noopener">' + esc(ph.license) + '</a>｜來源：<a href="' + esc(ph.page) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' +
    '<br><span class="note">照片為物種示意，拍攝地點、亞種或性別可能與台灣個體不同；未經修改。</span>';
}
function openBird(id){
  var b = BA.birdById[id]; if (!b) return;
  lastFocus = document.activeElement;
  var habs = BA.HAB_ORDER.filter(function(h){ return b.at.some(function(a){ return a.h === h; }); });
  $('birdTitle').innerHTML = '<h2 id="birdName">' + esc(b.name) + '</h2><div class="en">' + esc(b.en) + '</div><div class="sci">' + esc(b.sci) + '</div>' +
    '<div class="tags"><span class="tag st">' + BA.STATUS[b.st] + '</span>' + habs.map(function(h){ return '<span class="tag ' + h + '">' + BA.HABITATS[h].name + '</span>'; }).join('') +
    (b.endemic ? '<span class="tag end">' + BA.ENDEMIC[b.endemic] + '</span>' : '') + (b.cons ? '<span class="tag cons">保育類・' + BA.CONS[b.cons] + '</span>' : '') +
    '<span class="tag">' + (BA.SHAPE_NAME[b.body] || '') + '</span></div>' +
    '<div class="quick"><b>辨識重點：</b>' + esc(b.feat) + '</div>';
  var byRegion = {};
  BA.spotsOf(b).forEach(function(p){ (byRegion[p.r] = byRegion[p.r] || []).push(p); });
  var spotHtml = BA.REGIONS.filter(function(r){ return byRegion[r.id]; }).map(function(r){
    return '<div style="margin-bottom:6px"><b style="font-size:13px;color:var(--ink2)">' + r.name + '</b> <span class="chips" style="display:inline-flex">' +
      byRegion[r.id].map(function(p){ var hot = b.hot.indexOf(p.id) >= 0; return '<button type="button" class="chip' + (hot ? ' hot' : '') + '" data-gospot="' + p.id + '">' + (hot ? '★ ' : '') + esc(p.name) + '</button>'; }).join('') + '</span></div>';
  }).join('');
  $('birdBody').innerHTML =
    '<div class="sec cols"><div><h3>棲地環境</h3><p>' + esc(b.hab) + '</p></div><div><h3>行為與叫聲</h3><p>' + esc(b.behav) + '</p></div></div>' +
    '<div class="sec"><h3>觀察小撇步</h3><div class="tipbox">🔭 ' + esc(b.tips) + '</div></div>' +
    '<div class="sec"><h3>出現月曆</h3>' + calRows(b) + '</div>' +
    '<div class="sec"><h3>哪裡看得到</h3>' + (spotHtml || '<p>本工具收錄的熱點中較少紀錄。</p>') + '<div class="calnote">點地點會飛到該熱點；★＝代表熱點。</div></div>' +
    '<div class="sec cols"><div><h3>容易混淆的鳥</h3><p>' + esc(b.similar) + '</p></div><div><h3>保育與分布</h3><p>' +
      (b.cons ? '列為《野生動物保育法》' + BA.CONS[b.cons].replace('　', '：') + '保育類野生動物，禁止獵捕、騷擾、飼養與買賣。' : '非保育類，但仍受《野生動物保育法》保護，請勿捕捉或騷擾。') +
      (b.endemic === 1 ? '是只分布在台灣的特有種。' : b.endemic === 2 ? '在台灣的族群為特有亞種。' : '') + '</p></div></div>';
  $('bird').classList.add('show');
  $('bird').querySelector('.sheet').scrollTop = 0;
  showPhoto(b);
  hover(id);
  $('bird').querySelector('.x').focus();
}
function openModal(id){ lastFocus = document.activeElement; $(id).classList.add('show'); $(id).querySelector('.x').focus(); }
function closeModal(el){
  el.classList.remove('show');
  if (el.id === 'bird'){ if (pvRun){ pvRun.stop(); pvRun = null; } hover(null); }
  if (el.id === 'about') lsSet(SEEN_KEY, 1);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function buildEtiquette(){
  $('etqBody').innerHTML = BA.ETIQUETTE.map(function(e){
    return '<section><h3>' + e.icon + ' ' + esc(e.title) + '</h3><ul>' + e.items.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
  }).join('');
}

/* ---------- 常用設定 ---------- */
function fillSettings(){
  $('setHab').value = set.hab; $('setLabels').checked = !!set.labels; $('setMotion').value = set.motion; $('setTheme').value = set.theme; $('setPlay').value = String(set.play);
}
function saveSettings(){
  set = {hab:$('setHab').value, labels:$('setLabels').checked, motion:$('setMotion').value, theme:$('setTheme').value, play:+$('setPlay').value};
  lsSet(SET_KEY, set); applyTheme();
  if (window.BirdScene && BirdScene.ready){ BirdScene.setLabels(set.labels); BirdScene.setReduce(reduceOn()); }
  if (playT){ stopPlay(); startPlay(); }
}

/* ---------- 事件 ---------- */
function bind(){
  $('months').addEventListener('click', function(e){ var b = e.target.closest('.mbtn'); if (b){ stopPlay(); setMonth(+b.dataset.m); } });
  document.querySelectorAll('.hbtn').forEach(function(b){ b.addEventListener('click', function(){ setHabitat(b.dataset.h); }); });
  $('mRange').addEventListener('input', function(){ stopPlay(); if (+this.value !== st.month) setMonth(+this.value); });
  $('selRegion').addEventListener('change', function(){ selectRegion(this.value); });
  $('selSpot').addEventListener('change', function(){ if (this.value) selectSpot(this.value); else selectRegion(st.region); });
  $('list').addEventListener('click', function(e){
    var c = e.target.closest('.bcard'); if (c){ openBird(c.dataset.bird); return; }
    var h = e.target.closest('[data-sethab]'); if (h) setHabitat(h.dataset.sethab);
  });
  $('list').addEventListener('mouseover', function(e){ var c = e.target.closest('.bcard'); if (c && c.dataset.bird !== st.hl) hover(c.dataset.bird); });
  $('list').addEventListener('mouseleave', function(){ hover(null); });
  $('btnAll').addEventListener('click', function(){ st.region = 'all'; st.spot = null; fillSelectors(); render({fly:true}); });
  $('btnAbout').addEventListener('click', function(){ openModal('about'); });
  ['btnEtq', 'btnEtq2', 'btnEtq3'].forEach(function(id){ $(id).addEventListener('click', function(){ if (id === 'btnEtq3') closeModal($('about')); openModal('etq'); }); });
  $('btnSet').addEventListener('click', function(){ fillSettings(); openModal('settings'); });
  $('settings').addEventListener('change', saveSettings);
  function openAbout(creator){
    if ($('settings').classList.contains('show')) closeModal($('settings'));
    openModal('about'); if (creator) $('creatorBox').scrollIntoView({block:'nearest'});
  }
  $('btnCreator').addEventListener('click', function(){ openAbout(true); });
  document.querySelectorAll('[data-open-about]').forEach(function(b){ b.addEventListener('click', function(){ openAbout(b.dataset.openAbout === 'creator'); }); });
  document.querySelectorAll('[data-open-etq]').forEach(function(b){ b.addEventListener('click', function(){ closeModal($('settings')); openModal('etq'); }); });
  $('btnPrint').addEventListener('click', function(){ window.print(); });
  $('sheetBtn').addEventListener('click', function(){
    var min = $('panel').classList.toggle('min'); document.body.classList.toggle('sheet-min', min); this.textContent = min ? '展開' : '收合';
  });
  document.querySelectorAll('.modal').forEach(function(m){
    m.addEventListener('click', function(e){ if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });
  $('birdBody').addEventListener('click', function(e){
    var g = e.target.closest('[data-gospot]');
    if (g){ closeModal($('bird')); selectSpot(g.dataset.gospot); }
  });
  document.addEventListener('keydown', function(e){
    var open = document.querySelector('.modal.show');
    if (e.key === 'Escape' && open){ closeModal(open); return; }
    if (open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight'){ stopPlay(); setMonth(st.month + 1); }
    if (e.key === 'ArrowLeft'){ stopPlay(); setMonth(st.month - 1); }
  });
  $('play').addEventListener('click', function(){ if (playT) stopPlay(); else startPlay(); });
}
var playT = 0;
function startPlay(){ $('play').classList.add('on'); $('play').textContent = '❚❚'; playT = setInterval(function(){ setMonth(st.month + 1); }, set.play || 2800); }
function stopPlay(){ if (!playT) return; clearInterval(playT); playT = 0; $('play').classList.remove('on'); $('play').textContent = '▶'; }

/* ---------- 啟動 ---------- */
buildMonths(); fillSelectors(); buildEtiquette(); bind(); render();
BirdScene.onPickBird = openBird;
BirdScene.onPickSpot = selectSpot;
BirdScene.onHoverBird = function(id){ hover(id); };
function firstVisit(){ if (!lsGet(SEEN_KEY, 0)) openModal('about'); }
BirdScene.init({host:$('stage'), labels:$('labels'), reduce:reduceOn()}).then(function(){
  BirdScene.setLabels(set.labels);
  render({fly:true});
  setTimeout(function(){ $('loading').classList.add('hide'); firstVisit(); }, 250);
}).catch(function(err){
  console.error(err);
  $('loadMsg').textContent = '3D 地圖載入失敗（可能是網路無法連到繪圖元件）';
  $('loadSub').textContent = '鳥種清單與圖鑑仍可使用，點畫面任一處繼續。';
  $('loading').addEventListener('click', function(){ $('loading').classList.add('hide'); firstVisit(); }, {once:true});
});

window.__birdAtlas = {state:st, setMonth:setMonth, setHabitat:setHabitat, selectSpot:selectSpot, selectRegion:selectRegion, openBird:openBird,
  closeBird:function(){ closeModal($('bird')); }, listNow:listNow, groups3D:groups3D, BA:BA, scene:BirdScene};
})();
