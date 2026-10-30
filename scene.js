/* ================= 台灣賞鳥地圖：3D 場景 =================
 * Three.js（importmap 指到 jsdelivr）。台灣本島與離島輪廓、山脈脊線地形、離岸距離場沿用魚汛圖鑑的做法；
 * 切換棲地時用 shader 把對應的海拔帶（濕地＝海岸、平地＝1,000 公尺以下、山林＝以上）打亮。
 * 鳥全部程式自繪：依 BA.SHAPES 的參數組出身體、頭、嘴、腳、尾與翅膀，在熱點附近依習性走動、浮游、盤旋或跳動。
 * 座標：x = 東西、z = 南北（北為 -z）、y = 高度；1 單位約 10 公里，山高與鳥的大小都有誇大。
 */
(function(){
'use strict';
var S = window.BirdScene = {ready:false};
var T, Orbit;
var INK = '#2f2638';
var EXT = {x0:-36, z0:-36, x1:18, z1:28}, RES = .25, FW = 0, FH = 0, FIELD = null;
var U = {time:{value:0}, hab:{value:0}};
var renderer, scene, camera, controls, raycaster, ndc, toonGrad, clock;
var seaMat, landMat, birdMat, lineMat;
var ISL = [], SPOT3 = {}, labels = [], flocks = [], hawk = null, clouds = [];
var pickables = [], hoverId = null, hlId = null, selSpot = null, fly = null, showLabels = true, curHab = 'wet';
var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var host, labelRoot, partCache = {}, candCache = {}, tmpV;
var HAB_COL = {wet:'#3fb6d8', low:'#7fcf5a', mtn:'#2f8a57'};

function P(lon, lat){ return [(lon - 120.9) * 10.17, -(lat - 23.7) * 11.1]; }
S.proj = P;
function hash(n){ var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function smooth(a, b, x){ var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function col(h){ return new T.Color(h); }
function mixC(a, b, t){ return a.clone().lerp(b, t); }
function norm(v){ var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b){ return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function ease(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

/* ---------- 幾何：多邊形與距離場 ---------- */
function segD2(x, z, a, b){
  var dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz, t = l ? ((x - a[0]) * dx + (z - a[1]) * dz) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  var px = a[0] + t * dx - x, pz = a[1] + t * dz - z; return px * px + pz * pz;
}
function inPoly(x, z, poly){
  var c = false;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){
    var a = poly[i], b = poly[j];
    if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
  }
  return c;
}
function edgeDist(x, z, poly){
  var m = 1e9;
  for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){ var d = segD2(x, z, poly[j], poly[i]); if (d < m) m = d; }
  return Math.sqrt(m);
}
function sdIsland(x, z, I){ var d = edgeDist(x, z, I.poly); return inPoly(x, z, I.poly) ? -d : d; }
function sdAll(x, z){
  var best = 1e9;
  for (var k = 0; k < ISL.length; k++){
    var bb = ISL[k].bb, bx = Math.max(bb[0] - x, 0, x - bb[2]), bz = Math.max(bb[1] - z, 0, z - bb[3]);
    if (bx * bx + bz * bz > best * best) continue;
    var d = sdIsland(x, z, ISL[k]);
    if (d < best) best = d;
    if (best < 0) return best;
  }
  return best;
}
/* 離岸距離（海上為正、陸上為負），雙線性取樣預先算好的格點 */
function field(x, z){
  var fx = (x - EXT.x0) / RES, fz = (z - EXT.z0) / RES;
  if (fx < 0 || fz < 0 || fx >= FW - 1 || fz >= FH - 1) return 12;
  var i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * FW + i;
  return (FIELD[k] * (1 - u) + FIELD[k + 1] * u) * (1 - v) + (FIELD[k + FW] * (1 - u) + FIELD[k + FW + 1] * u) * v;
}
S.field = function(x, z){ return field(x, z); };

var HGT = {penghu:.12, baisha:.1, xiyu:.12, kinmen:.26, lieyu:.2, nangan:.38, beigan:.4, dongyin:.3, juguang:.25,
  qimei:.14, wangan:.12, ludao:.34, lanyu:.62, liuqiu:.16, guishan:.55, keelungi:.22};
function buildPolys(){
  BA.ISLANDS.forEach(function(I, k){
    var poly;
    if (I.poly) poly = I.poly.map(function(p){ return P(p[0], p[1]); });
    else {
      var c = P(I.c[0], I.c[1]), r = I.km / 10 * 1.5, sx = I.sx || 1, sy = I.sy || 1;
      poly = [];
      for (var i = 0; i < 24; i++){
        var a = i / 24 * Math.PI * 2, rr = r * (1 + .1 * Math.sin(3 * a + k) + .06 * Math.sin(5 * a + k * 2));
        poly.push([c[0] + Math.cos(a) * rr * sx, c[1] + Math.sin(a) * rr * sy]);
      }
    }
    var bb = [1e9, 1e9, -1e9, -1e9];
    poly.forEach(function(p){ bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
    var cx = 0, cz = 0; poly.forEach(function(p){ cx += p[0]; cz += p[1]; });
    ISL.push({id:I.id, name:I.name, main:!!I.main, poly:poly, bb:bb, hgt:HGT[I.id] || .2, c:[cx / poly.length, cz / poly.length]});
  });
}
function buildField(){
  FW = Math.ceil((EXT.x1 - EXT.x0) / RES) + 1; FH = Math.ceil((EXT.z1 - EXT.z0) / RES) + 1;
  FIELD = new Float32Array(FW * FH);
  for (var j = 0; j < FH; j++) for (var i = 0; i < FW; i++) FIELD[j * FW + i] = sdAll(EXT.x0 + i * RES, EXT.z0 + j * RES);
  var data = new Uint8Array(FW * FH * 4);
  for (var k = 0; k < FW * FH; k++){ var d = Math.max(0, Math.min(12, FIELD[k])); data[k * 4] = Math.round(d / 12 * 255); data[k * 4 + 3] = 255; }
  var tex = new T.DataTexture(data, FW, FH, T.RGBAFormat);
  tex.magFilter = tex.minFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true;
  return tex;
}

/* ---------- 地形 ---------- */
var RIDGES = [
  [[121.70,24.80,.6,1.2],[121.45,24.55,2.4,1.8],[121.30,24.30,3.5,2.0],[121.28,24.12,3.4,2.0],[121.22,23.85,3.3,2.1],[121.08,23.50,3.4,2.2],[121.00,23.20,3.0,2.0],[120.88,22.85,2.8,1.8],[120.78,22.55,2.7,1.6],[120.80,22.25,1.4,1.3],[120.83,22.00,.4,.8]],
  [[120.82,23.80,2.0,1.3],[120.957,23.47,3.95,1.3],[120.86,23.15,2.4,1.2]],
  [[121.55,24.72,1.6,1.3],[121.231,24.383,3.9,1.4],[121.02,24.20,2.6,1.3],[120.86,24.00,1.4,1.1]],
  [[121.53,23.78,.9,.6],[121.45,23.45,1.6,.6],[121.35,23.15,1.4,.6],[121.22,22.93,.9,.5]],
  [[121.50,25.20,.6,.6],[121.548,25.171,1.12,.7],[121.62,25.14,.7,.6]],
  [[120.62,23.30,.7,1.0],[120.72,23.65,.9,1.0],[120.80,24.35,.8,1.2]]
];
var KM = .42, RID = [];
function prepRidges(){
  RID = RIDGES.map(function(r){ return r.map(function(p){ var q = P(p[0], p[1]); return [q[0], q[1], p[2] * KM, p[3]]; }); });
}
function ridgeH(x, z){
  var best = 0;
  RID.forEach(function(r){
    for (var i = 0; i < r.length - 1; i++){
      var a = r[i], b = r[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
      var t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
      var px = a[0] + t * dx - x, pz = a[1] + t * dz - z, d = Math.sqrt(px * px + pz * pz);
      var h = a[2] + (b[2] - a[2]) * t, w = a[3] + (b[3] - a[3]) * t;
      var v = h * Math.exp(-(d / w) * (d / w));
      if (v > best) best = v;
    }
  });
  return best;
}
function noise(x, z){ return .5 * Math.sin(x * 1.9 + z * .7) * Math.sin(z * 1.4 - x * .5) + .3 * Math.sin(x * 4.1 + 1.3) * Math.sin(z * 3.7 + .4) + .2 * Math.sin(x * 8.3 + z * 6.1); }
var LANDC;
function landColor(h, d){
  if (h < -.01) return LANDC.under;
  if (d < .09 || h < .085) return LANDC.sand;
  if (h < .3) return LANDC.plain;
  if (h < .65) return LANDC.grass;
  if (h < 1.05) return LANDC.forest;
  if (h < 1.45) return LANDC.deep;
  if (h < 1.72) return LANDC.rock;
  return LANDC.snow;
}
function buildLand(I){
  var m = I.main ? 1.1 : .8, w = I.bb[2] - I.bb[0], res = I.main ? .15 : (w < 1 ? .05 : .08);
  var x0 = I.bb[0] - m, z0 = I.bb[1] - m, nx = Math.ceil((w + 2 * m) / res) + 1, nz = Math.ceil((I.bb[3] - I.bb[1] + 2 * m) / res) + 1;
  var pos = new Float32Array(nx * nz * 3), cols = new Float32Array(nx * nz * 3), hs = new Float32Array(nx * nz);
  var inner = Math.min(w, I.bb[3] - I.bb[1]) * .4;
  for (var j = 0; j < nz; j++) for (var i = 0; i < nx; i++){
    var x = x0 + i * res, z = z0 + j * res, d = -sdIsland(x, z, I), h, k = j * nx + i;
    if (d > 0){
      var n = noise(x, z);
      if (I.main) h = .05 + ridgeH(x, z) * smooth(0, 1.1, d) * (1 + .28 * n) + .03 * smooth(0, .5, d) * (n + 1);
      else h = .04 + I.hgt * smooth(0, inner, d) * (1 + .2 * n);
    } else h = Math.max(-.62, d * .9);
    hs[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    var c = landColor(h, d); cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
  }
  var idx = [];
  for (j = 0; j < nz - 1; j++) for (i = 0; i < nx - 1; i++){
    var a = j * nx + i, b = a + 1, c2 = a + nx, d2 = c2 + 1;
    if (hs[a] > -.6 || hs[b] > -.6 || hs[c2] > -.6 || hs[d2] > -.6){ idx.push(a, c2, b, b, c2, d2); }
  }
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  var mesh = new T.Mesh(g, landMat);
  scene.add(mesh);
  return mesh;
}
function landY(x, z){
  // 用於擺放熱點與鳥：取最接近的島重算一次高度
  var best = null, bd = 1e9;
  ISL.forEach(function(I){ var d = sdIsland(x, z, I); if (d < bd){ bd = d; best = I; } });
  if (!best || bd > 0) return .05;
  var d = -bd;
  if (best.main) return .05 + ridgeH(x, z) * smooth(0, 1.1, d) * (1 + .28 * noise(x, z)) + .03 * smooth(0, .5, d) * (noise(x, z) + 1);
  return .04 + best.hgt * smooth(0, Math.min(best.bb[2] - best.bb[0], best.bb[3] - best.bb[1]) * .4, d);
}

/* ---------- 棲地高亮（陸地） ---------- */
function habPatch(mat){
  mat.onBeforeCompile = function(sh){
    sh.uniforms.uHab = U.hab;
    sh.vertexShader = 'varying float vH;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
    sh.fragmentShader = 'uniform float uHab; varying float vH;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' +
      'float inW = 1. - smoothstep(.1, .18, vH);\n' +
      'float inL = smoothstep(.02, .06, vH) * (1. - smoothstep(.40, .46, vH));\n' +
      'float inM = smoothstep(.40, .46, vH);\n' +
      'float on = uHab < .5 ? inW : uHab < 1.5 ? inL : inM;\n' +
      'diffuseColor.rgb *= mix(.78, 1.07, on);');
  };
  mat.customProgramCacheKey = function(){ return 'hab'; };
  return mat;
}

/* ---------- 海 ---------- */
var SEA_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
var SEA_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform float uTime, uWet, uCalm; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw;',
  '  float d = texture2D(uDist, uv).r * 12.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 12.;',
  '  vec3 col = mix(vec3(.56,.93,.90), vec3(.31,.80,.90), smoothstep(.1, 1.2, d));',
  '  col = mix(col, vec3(.15,.55,.84), smoothstep(1., 3., d));',
  '  col = mix(col, vec3(.10,.39,.72), smoothstep(3., 7., d));',
  '  col = mix(col, vec3(.07,.27,.58), smoothstep(7., 11., d));',
  '  col += uWet * (1. - smoothstep(.2, 1.4, d)) * (.07 + .04 * sin(uTime * 2.2));',
  '  col *= 1. - (1. - uWet) * .06;',
  '  float t = uTime * uCalm;',
  '  float w = sin(vW.x*2.1 + sin(vW.z*1.3 + t*.5)*1.6 + t*.8) * sin(vW.z*2.6 - t*.6 + sin(vW.x*1.1)*1.3);',
  '  col = mix(col, vec3(1.), smoothstep(.86, .96, w) * .42);',
  '  float f = 1. - smoothstep(.04, .15 + .05 * sin(t*2. + vW.x*5. + vW.z*3.), d);',
  '  col = mix(col, vec3(1.), f * .92);',
  '  float alpha = mix(.5, .8, smoothstep(0., 4., d));',
  '  float hz = smoothstep(60., 200., length(vW.xz - cameraPosition.xz));',
  '  col = mix(col, uHorizon, hz); alpha = mix(alpha, 1., hz);',
  '  gl_FragColor = vec4(col, alpha);',
  '}'].join('\n');
var BED_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw; float d = texture2D(uDist, uv).r * 12.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 12.;',
  '  vec3 col = mix(vec3(.62,.84,.74), vec3(.22,.55,.62), smoothstep(.2, 1.6, d));',
  '  col = mix(col, vec3(.06,.2,.4), smoothstep(2., 6., d));',
  '  float hz = smoothstep(60., 200., length(vW.xz - cameraPosition.xz)); col = mix(col, uHorizon, hz);',
  '  gl_FragColor = vec4(col, 1.);',
  '}'].join('\n');
function buildSea(tex){
  var uni = {uDist:{value:tex}, uExt:{value:new T.Vector4(EXT.x0, EXT.z0, (FW - 1) * RES, (FH - 1) * RES)},
    uTime:U.time, uWet:{value:1}, uCalm:{value:reduce ? .15 : 1}, uHorizon:{value:new T.Vector3(.74, .9, .97)}};
  seaMat = new T.ShaderMaterial({uniforms:uni, vertexShader:SEA_VS, fragmentShader:SEA_FS, transparent:true});
  var sea = new T.Mesh(new T.PlaneGeometry(520, 520), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(-8, 0, -4); sea.renderOrder = 2;
  scene.add(sea);
  var bed = new T.Mesh(new T.PlaneGeometry(520, 520), new T.ShaderMaterial({uniforms:{uDist:uni.uDist, uExt:uni.uExt, uHorizon:uni.uHorizon}, vertexShader:SEA_VS, fragmentShader:BED_FS}));
  bed.rotation.x = -Math.PI / 2; bed.position.set(-8, -.62, -4);
  scene.add(bed);
}

/* ---------- 自繪幾何工具 ---------- */
function Geo(){ this.p = []; this.c = []; this.i = []; }
Geo.prototype.v = function(x, y, z, c){ this.p.push(x, y, z); this.c.push(c.r, c.g, c.b); return this.p.length / 3 - 1; };
Geo.prototype.tri2 = function(A, B, C, c){
  var a = this.v(A[0], A[1], A[2], c), b = this.v(B[0], B[1], B[2], c), d = this.v(C[0], C[1], C[2], c); this.i.push(a, b, d);
  a = this.v(A[0], A[1], A[2], c); b = this.v(B[0], B[1], B[2], c); d = this.v(C[0], C[1], C[2], c); this.i.push(a, d, b);
};
Geo.prototype.fan2 = function(pts, c){ for (var k = 1; k < pts.length - 1; k++) this.tri2(pts[0], pts[k], pts[k + 1], c); };
Geo.prototype.sweep = function(path, colFn, seg){
  seg = seg || 12;
  var n = path.length, base = this.p.length / 3, self = this, k, j;
  for (k = 0; k < n; k++){
    var a = path[Math.max(0, k - 1)].p, b = path[Math.min(n - 1, k + 1)].p;
    var t = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    var up = Math.abs(t[1]) > .95 ? [1, 0, 0] : [0, 1, 0], dt = up[0] * t[0] + up[1] * t[1] + up[2] * t[2];
    var N = norm([up[0] - t[0] * dt, up[1] - t[1] * dt, up[2] - t[2] * dt]), B = cross(t, N), q = path[k];
    for (j = 0; j <= seg; j++){
      var an = j / seg * Math.PI * 2, ca = Math.cos(an), sa = Math.sin(an);
      var x = q.p[0] + N[0] * ca * q.h + B[0] * sa * q.w, y = q.p[1] + N[1] * ca * q.h + B[1] * sa * q.w, z = q.p[2] + N[2] * ca * q.h + B[2] * sa * q.w;
      this.v(x, y, z, colFn(k / (n - 1), ca, sa, x, y, z));
    }
  }
  for (k = 0; k < n - 1; k++) for (j = 0; j < seg; j++){
    var i0 = base + k * (seg + 1) + j, i1 = i0 + seg + 1;
    this.i.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
  }
  function cap(k, start){
    var q = path[k]; if (q.h < 1e-4) return;
    var c = self.v(q.p[0], q.p[1], q.p[2], colFn(k / (n - 1), 0, 0, q.p[0], q.p[1], q.p[2])), r0 = base + k * (seg + 1);
    for (var j = 0; j < seg; j++){ if (start) self.i.push(c, r0 + j + 1, r0 + j); else self.i.push(c, r0 + j, r0 + j + 1); }
  }
  cap(0, true); cap(n - 1, false);
};
var SPH;
Geo.prototype.ell = function(cx, cy, cz, rx, ry, rz, c){
  if (!SPH) SPH = new T.SphereGeometry(1, 12, 9);
  var p = SPH.attributes.position, base = this.p.length / 3, ix = SPH.index.array;
  for (var k = 0; k < p.count; k++){
    var x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    this.v(cx + x * rx, cy + y * ry, cz + z * rz, typeof c === 'function' ? c(x, y, z) : c);
  }
  for (k = 0; k < ix.length; k++) this.i.push(base + ix[k]);
};
Geo.prototype.stick = function(pts, r0, r1, c, seg){
  var n = pts.length;
  this.sweep(pts.map(function(p, k){ var r = r0 + (r1 - r0) * k / (n - 1); return {p:p, h:r, w:r}; }), function(){ return c; }, seg || 6);
};
Geo.prototype.build = function(){
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
  g.setIndex(this.i); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
};

/* ---------- 鳥的造型 ---------- */
Geo.prototype.xform = function(from, ang, off){
  var c = Math.cos(ang), s = Math.sin(ang);
  for (var k = from * 3; k < this.p.length; k += 3){
    var x = this.p[k], y = this.p[k + 1];
    this.p[k] = x * c - y * s + off[0]; this.p[k + 1] = x * s + y * c + off[1]; this.p[k + 2] += off[2];
  }
};
function add(a, b){ return [a[0] + b[0], a[1] + b[1], a[2] + (b[2] || 0)]; }
function rot(v, ang){ var c = Math.cos(ang), s = Math.sin(ang); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2] || 0]; }
function eye2(g, x, y, z, r, iris, BK, WH){
  [1, -1].forEach(function(s){
    g.ell(x, y, s * z, r, r, r * .6, iris);
    g.ell(x + r * .2, y, s * (z + r * .45), r * .55, r * .6, r * .35, BK);
    g.ell(x + r * .35, y + r * .28, s * (z + r * .72), r * .2, r * .2, r * .12, WH);
  });
}
function birdParts(b){
  if (partCache[b.id]) return partCache[b.id];
  var s = b.shape, c = b.c;
  function C(k, d){ return col(c[k] || d); }
  var BACK = C('back', '#777777'), BELLY = C('belly', '#dddddd'), HEAD = c.head ? C('head') : BACK, BILL = C('bill', INK), LEG = C('leg', '#6b5d4f');
  var TAIL = c.tail ? C('tail') : BACK, WING = mixC(BACK, col('#1a1420'), .14), WH = col('#ffffff'), BK = col('#1a1420');
  var g = new Geo(), lg = new Geo(), wg = new Geo();
  var float = s.leg === 0, owl = b.body === 'owl', t = s.tilt;
  var bc = [0, float ? s.bH * .35 : s.leg + s.bH * .78, 0];
  // 身體（含收合的翅膀與尾巴），先在身體座標系建好再整組旋轉到仰角
  var i0 = g.p.length / 3;
  g.ell(0, 0, 0, s.bL, s.bH, s.bH * (owl ? 1.05 : .92), function(x, y){
    if (c.breast && x > .25 && y < .45) return C('breast');
    return y > .08 ? BACK : BELLY;
  });
  [1, -1].forEach(function(sd){ g.ell(-s.bL * .12, s.bH * .2, sd * s.bH * .5, s.bL * .78, s.bH * .55, s.bH * .32, WING); });
  if (s.tail > .01 && s.tt !== 'none'){
    var rx = -s.bL * .88, ry = s.bH * .12, L = s.tail, dy = s.tt === 'up' ? .55 : -.18, w = s.bH * (s.tt === 'long' ? .32 : .5);
    var tip = [rx - L, ry + dy * L, 0];
    if (s.tt === 'fork'){
      g.fan2([[rx, ry, w], [rx - L, tip[1], w * 1.5], [rx - L * .45, ry + dy * L * .45, 0], [rx - L, tip[1], -w * 1.5], [rx, ry, -w]], TAIL);
    } else if (s.tt === 'long' || s.tt === 'pin'){
      if (s.tt === 'pin') g.fan2([[rx, ry, w], [rx - L * .35, ry + dy * L * .35, w * .9], [rx - L * .35, ry + dy * L * .35, -w * .9], [rx, ry, -w]], TAIL);
      g.fan2([[rx, ry, w * .7], [rx - L * .8, ry + dy * L * .8, w * .55], tip, [rx - L * .8, ry + dy * L * .8, -w * .55], [rx, ry, -w * .7]], TAIL);
    } else {
      g.fan2([[rx, ry, w * .7], [rx - L, tip[1], w * 1.1], [rx - L, tip[1], -w * 1.1], [rx, ry, -w * .7]], TAIL);
    }
  }
  g.xform(i0, t, bc);
  // 頭與脖子
  var hR = s.hR, hc = [bc[0] + s.nk[0], bc[1] + s.nk[1], 0];
  if (!owl){
    var n0 = add(bc, rot([s.bL * .55, s.bH * .35], t)), mid = [(n0[0] + hc[0]) / 2 + (s.neck > .5 ? .04 : 0), (n0[1] + hc[1]) / 2, 0];
    var nr = hR * (s.neck || .75);
    g.stick([n0, mid, hc], nr * 1.15, nr, c.neck ? C('neck') : HEAD, 8);
  }
  g.ell(hc[0], hc[1], 0, hR * (owl ? .95 : 1), hR * .95, hR * (owl ? 1.08 : .88), function(x, y, z){
    if (c.cap && y > .45) return C('cap');
    if (c.face && (owl ? x > .5 : x > .25 && y > -.35 && y < .5)) return C('face');
    if (c.bib && y < -.35 && x > -.3) return C('bib');
    return HEAD;
  });
  // 嘴
  var L2 = s.bill, base = [hc[0] + hR * .82, hc[1] - hR * .12, 0], bt = s.bt;
  function bp(dx, dy){ return [base[0] + dx, base[1] + dy, 0]; }
  if (bt === 'duck' || bt === 'spatula') g.ell(base[0] + L2 * .42, base[1] - .006, 0, L2 * .55, hR * .16, hR * (bt === 'spatula' ? .5 : .32), BILL);
  else if (bt === 'spoon'){ g.stick([base, bp(L2 * .8, -L2 * .14)], hR * .24, hR * .16, BILL, 6); g.ell(base[0] + L2 * .86, base[1] - L2 * .16, 0, L2 * .2, .012, L2 * .12, BILL); }
  else if (bt === 'hook') g.stick([base, bp(L2 * .7, 0), bp(L2, -L2 * .45)], hR * .38, .006, BILL, 6);
  else if (bt === 'curve') g.stick([base, bp(L2 * .35, -L2 * .05), bp(L2 * .7, -L2 * .2), bp(L2 * .95, -L2 * .45)], hR * .26, .005, BILL, 6);
  else if (bt === 'up') g.stick([base, bp(L2 * .4, 0), bp(L2 * .75, L2 * .06), bp(L2, L2 * .2)], hR * .22, .004, BILL, 6);
  else if (bt === 'cone') g.stick([base, bp(L2, -L2 * .2)], hR * .42, .008, BILL, 6);
  else if (bt === 'shield'){ g.stick([base, bp(L2, -L2 * .25)], hR * .36, .01, BILL, 6); g.ell(hc[0] + hR * .72, hc[1] + hR * .3, 0, hR * .26, hR * .38, hR * .22, BILL); }
  else g.stick([base, bp(L2, -L2 * .08)], hR * (bt === 'dagger' ? .36 : .28), .005, BILL, 6);
  // 眼睛
  var iris = c.eye ? C('eye') : (owl ? col('#f2c230') : WH);
  if (owl){
    [1, -1].forEach(function(sd){
      g.ell(hc[0] + hR * .8, hc[1] + hR * .12, sd * hR * .42, hR * .12, hR * .3, hR * .3, iris);
      g.ell(hc[0] + hR * .9, hc[1] + hR * .12, sd * hR * .42, hR * .08, hR * .15, hR * .15, BK);
      g.tri2([hc[0] - hR * .1, hc[1] + hR * .7, sd * hR * .35], [hc[0] - hR * .25, hc[1] + hR * 1.25, sd * hR * .55], [hc[0] + hR * .25, hc[1] + hR * .8, sd * hR * .45], HEAD);
    });
  } else eye2(g, hc[0] + hR * .42, hc[1] + hR * .22, hR * .72, hR * .24, c.eye ? iris : WH, BK, WH);
  // 冠羽
  var CR = c.cap ? C('cap') : HEAD;
  if (s.crest) g.tri2([hc[0] - hR * .1, hc[1] + hR * .85, 0], [hc[0] - hR * 1.4, hc[1] + hR * 1.15, 0], [hc[0] - hR * .7, hc[1] + hR * .35, 0], CR);
  if (s.fan) for (var q = 0; q < 5; q++){
    var an = 1.9 - q * .32;
    g.tri2([hc[0] + hR * .3 - q * hR * .2, hc[1] + hR * .7, 0], [hc[0] + Math.cos(an) * hR * 1.9 - q * hR * .25, hc[1] + Math.sin(an) * hR * 1.9, 0], [hc[0] - q * hR * .25, hc[1] + hR * .6, 0], q % 2 ? HEAD : mixC(HEAD, BK, .5));
  }
  // 腳
  if (!float && s.leg > .01){
    [1, -1].forEach(function(sd){
      var hip = [bc[0] - .01, bc[1] - s.bH * .55, sd * s.bH * .32], ft = [hip[0] + .02, 0, hip[2]];
      lg.stick([hip, ft], .02, .014, LEG, 5);
      lg.stick([ft, [ft[0] + .08, 0, ft[2]]], .011, .007, LEG, 4);
      lg.stick([ft, [ft[0] - .04, 0, ft[2] + sd * .035]], .01, .007, LEG, 4);
    });
  }
  // 翅膀（展開用，樞紐在肩膀）
  var hs = s.span / 2;
  wg.fan2([[0, 0, 0], [.07, 0, hs * .3], [.02, 0, hs * .7], [-.22, 0, hs * .55], [-.32, 0, .04]], BACK);
  wg.fan2([[.02, 0, hs * .7], [-.06, 0, hs], [-.22, 0, hs * .55]], WING);
  var sh = add(bc, rot([s.bL * .12, s.bH * .55], t));
  var top = Math.max(hc[1] + hR * (s.crest || owl ? 1.3 : 1), bc[1] + s.bH);
  return (partCache[b.id] = {body:g.build(), legs:lg.p.length ? lg.build() : null, wing:wg.build(), sh:[sh[0], sh[1], s.bH * .42], top:top, tilt:t});
}
function lineMatFor(th){
  var m = new T.MeshBasicMaterial({color:INK, side:T.BackSide});
  m.onBeforeCompile = function(sh){
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * ' + th.toFixed(3) + ';');
  };
  m.customProgramCacheKey = function(){ return 'line' + th; };
  return m;
}
function makeBird(b){
  var P2 = birdParts(b), grp = new T.Group();
  var body = new T.Mesh(P2.body, birdMat); body.userData.birdId = b.id;
  grp.add(body); grp.add(new T.Mesh(P2.body, lineMat));
  var legs = new T.Group();
  if (P2.legs){ var lm = new T.Mesh(P2.legs, birdMat); lm.userData.birdId = b.id; legs.add(lm); legs.add(new T.Mesh(P2.legs, lineMat)); }
  grp.add(legs);
  var wings = [1, -1].map(function(sd){
    var pv = new T.Group(), m = new T.Mesh(P2.wing, birdMat); m.userData.birdId = b.id;
    pv.add(m); pv.position.set(P2.sh[0], P2.sh[1], sd * P2.sh[2]); pv.scale.z = sd; pv.visible = false;
    grp.add(pv); return pv;
  });
  grp.rotation.order = 'YZX';
  return {grp:grp, body:body, legs:legs, wr:wings[0], wl:wings[1], P:P2};
}
S.makeBirdMesh = makeBird;
/* 翅膀：open＝展開程度，flap＝拍動角度 */
function setWings(M, open, flap){
  var on = open > .02;
  M.wr.visible = M.wl.visible = on;
  if (!on) return;
  var fold = (1 - open) * 1.35;
  M.wr.rotation.set(flap, -fold, 0); M.wl.rotation.set(-flap, fold, 0);
}

/* ---------- 雲 ---------- */
function cloud(seed){
  var g = new T.Group(), m = new T.MeshToonMaterial({color:'#ffffff', gradientMap:toonGrad, transparent:true, opacity:.96});
  var n = 4 + (seed % 3);
  for (var i = 0; i < n; i++){
    var r = .9 + hash(seed * 7 + i) * .9, s = new T.Mesh(new T.SphereGeometry(r, 12, 9), m);
    s.position.set((i - n / 2) * 1.1 + hash(seed + i) * .6, hash(seed * 3 + i) * .5, (hash(seed * 5 + i) - .5) * 1.4);
    s.scale.y = .62; g.add(s);
  }
  return g;
}

/* ---------- 標籤 ---------- */
function addLabel(el, pos, pri, kind, extra){
  el.classList.add('lab3d', 'off');
  labelRoot.appendChild(el);
  var L = Object.assign({el:el, pos:pos, pri:pri, kind:kind, w:0, h:0, active:true, off:true}, extra || {});
  labels.push(L);
  labels.sort(function(a, b){ return b.pri - a.pri; });
  return L;
}
function removeLabel(L){ var i = labels.indexOf(L); if (i >= 0) labels.splice(i, 1); if (L.el.parentNode) L.el.parentNode.removeChild(L.el); }
function layoutLabels(){
  var W = host.clientWidth, H = host.clientHeight, placed = [];
  var sorted = labels.slice().sort(function(a, b){ return (b.pri + (b.boost || 0)) - (a.pri + (a.boost || 0)); });
  for (var i = 0; i < sorted.length; i++){
    var L = sorted[i];
    if (!L.active){ hide(L); continue; }
    if (L.follow) tmpV.copy(L.follow()); else tmpV.copy(L.pos);
    tmpV.project(camera);
    if (tmpV.z > 1 || tmpV.z < -1){ hide(L); continue; }
    var x = (tmpV.x * .5 + .5) * W, y = (-tmpV.y * .5 + .5) * H;
    if (!L.w){ L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    var r = [x - L.w / 2, y - L.h, x + L.w / 2, y];
    if (r[2] < 0 || r[0] > W || r[3] < 0 || r[1] > H){ hide(L); continue; }
    var hit = false;
    if (!L.force) for (var k = 0; k < placed.length; k++){ var q = placed[k]; if (r[0] < q[2] + 2 && r[2] > q[0] - 2 && r[1] < q[3] + 1 && r[3] > q[1] - 1){ hit = true; break; } }
    if (hit && L.kind !== 'sea'){ hide(L); continue; }
    if (L.kind !== 'sea') placed.push(r);
    L.el.style.transform = 'translate(' + Math.round(r[0]) + 'px,' + Math.round(r[1]) + 'px)';
    if (L.off){ L.el.classList.remove('off'); L.off = false; }
  }
  function hide(L){ if (!L.off){ L.el.classList.add('off'); L.off = true; } }
}

/* ---------- 熱點（賞鳥小屋） ---------- */
var HUT = {};
function hut(hab){
  if (!HUT.base){
    HUT.base = new T.BoxGeometry(.34, .2, .24); HUT.slot = new T.BoxGeometry(.02, .05, .2);
    HUT.roof = new T.ConeGeometry(.3, .16, 4); HUT.roof.rotateY(Math.PI / 4);
    HUT.pole = new T.CylinderGeometry(.01, .01, .42, 5); HUT.flag = new T.PlaneGeometry(.13, .08);
    HUT.mW = new T.MeshToonMaterial({color:'#c99566', gradientMap:toonGrad}); HUT.mR = new T.MeshToonMaterial({color:'#8a5232', gradientMap:toonGrad});
    HUT.mK = new T.MeshBasicMaterial({color:INK}); HUT.mP = new T.MeshToonMaterial({color:'#f6f1e6', gradientMap:toonGrad});
    HUT.line = lineMatFor(.012); HUT.flags = {};
  }
  if (!HUT.flags[hab]) HUT.flags[hab] = new T.MeshBasicMaterial({color:HAB_COL[hab], side:T.DoubleSide});
  var g = new T.Group();
  var b = new T.Mesh(HUT.base, HUT.mW); b.position.y = .1; b.add(new T.Mesh(HUT.base, HUT.line)); g.add(b);
  var sl = new T.Mesh(HUT.slot, HUT.mK); sl.position.set(.171, .14, 0); g.add(sl);
  var r = new T.Mesh(HUT.roof, HUT.mR); r.position.y = .28; r.add(new T.Mesh(HUT.roof, HUT.line)); g.add(r);
  var pl = new T.Mesh(HUT.pole, HUT.mP); pl.position.set(-.12, .45, .08); g.add(pl);
  var fl = new T.Mesh(HUT.flag, HUT.flags[hab]); fl.position.set(-.05, .6, .08); g.add(fl);
  g.userData.flag = fl;
  return g;
}
function nearestCoast(x, z){
  var best = null;
  ISL.forEach(function(I){
    var poly = I.poly;
    for (var i = 0, n = poly.length, j = n - 1; i < n; j = i++){
      var a = poly[j], b = poly[i], dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
      var t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
      var px = a[0] + t * dx, pz = a[1] + t * dz, d = Math.hypot(px - x, pz - z);
      if (!best || d < best.d) best = {d:d, x:px, z:pz, I:I, nx:-dz / Math.sqrt(l), nz:dx / Math.sqrt(l)};
    }
  });
  if (inPoly(best.x + best.nx * .05, best.z + best.nz * .05, best.I.poly)){ best.nx = -best.nx; best.nz = -best.nz; }
  return best;
}
var POND = {};
function buildSpots(){
  POND.g = new T.CircleGeometry(1, 28); POND.m = new T.MeshToonMaterial({color:'#5ec8e0', gradientMap:toonGrad});
  POND.rim = new T.RingGeometry(.94, 1.08, 28); POND.rm = new T.MeshToonMaterial({color:'#e9dca6', gradientMap:toonGrad});
  POND.reed = new T.ConeGeometry(.025, .22, 4); POND.rd = new T.MeshToonMaterial({color:'#4f9a3f', gradientMap:toonGrad});
  BA.SPOTS.forEach(function(p, i){
    var q = P(p.at[0], p.at[1]), x = q[0], z = q[1];
    if (field(x, z) > -.06){ var c = nearestCoast(x, z); x = c.x - c.nx * .12; z = c.z - c.nz * .12; }
    var y = landY(x, z), S3 = {id:p.id, x:x, y:y, z:z, hab:p.h[0]};
    // 內陸濕地畫一個埤塘，水鳥才有地方游
    if (p.h.indexOf('wet') >= 0 && field(x, z) < -.25){
      var px = x + .55, pz = z + .25, py = landY(px, pz) + .015;
      var pond = new T.Mesh(POND.g, POND.m); pond.rotation.x = -Math.PI / 2; pond.position.set(px, py, pz); pond.scale.setScalar(.5);
      var rim = new T.Mesh(POND.rim, POND.rm); rim.rotation.x = -Math.PI / 2; rim.position.set(px, py - .003, pz); rim.scale.setScalar(.5);
      scene.add(pond); scene.add(rim);
      for (var k = 0; k < 7; k++){
        var a = hash(i * 13 + k) * 6.28, rd = new T.Mesh(POND.reed, POND.rd);
        rd.position.set(px + Math.cos(a) * .5, py + .09, pz + Math.sin(a) * .5); scene.add(rd);
      }
      S3.pond = {x:px, y:py, z:pz, r:.42};
    }
    var h = hut(p.h[0]); h.position.set(x, y, z); h.scale.setScalar(.7); h.rotation.y = hash(i * 3.3) * 6.28;
    h.traverse(function(o){ if (o.isMesh) o.userData.spotId = p.id; });
    scene.add(h);
    h.children.forEach(function(o){ if (o.isMesh) pickables.push(o); });
    var el = document.createElement('button'); el.type = 'button'; el.className = 'plab'; el.textContent = p.name; el.dataset.spot = p.id;
    el.addEventListener('click', function(e){ e.stopPropagation(); if (S.onPickSpot) S.onPickSpot(p.id); });
    S3.hut = h;
    S3.label = addLabel(el, new T.Vector3(x, y + .75, z), 3, 'spot');
    SPOT3[p.id] = S3;
  });
}
S.spot3 = function(id){ return SPOT3[id]; };

/* ---------- 鳥群落點 ---------- */
function groundAt(S3, x, z){
  if (S3 && S3.pond && Math.hypot(x - S3.pond.x, z - S3.pond.z) < S3.pond.r) return S3.pond.y;
  return field(x, z) > 0 ? 0 : landY(x, z);
}
function candidates(S3, hab, scale){
  var key = S3.id + hab + scale;
  if (candCache[key]) return candCache[key];
  var R = 2.4 * scale, step = .2 * scale, out = [];
  for (var dz = -R; dz <= R; dz += step) for (var dx = -R; dx <= R; dx += step){
    var r = Math.hypot(dx, dz); if (r > R) continue;
    var x = S3.x + dx, z = S3.z + dz, d = field(x, z), kind = null, y = 0, sc = r;
    if (S3.pond && Math.hypot(x - S3.pond.x, z - S3.pond.z) < S3.pond.r * 1.5){
      kind = Math.hypot(x - S3.pond.x, z - S3.pond.z) < S3.pond.r * .85 ? 'water' : 'shore'; y = kind === 'water' ? S3.pond.y : landY(x, z); sc = r - 3;
    } else if (hab === 'wet'){
      if (d > .05 && d < 1.2){ kind = 'water'; y = 0; }
      else if (d <= .05 && d > -.5){ kind = 'shore'; y = d > 0 ? 0 : landY(x, z); }
    } else if (d < -.15){
      y = landY(x, z);
      if (hab === 'low' && y < .5) kind = 'land';
      if (hab === 'mtn' && y > .36){ kind = 'land'; sc = r - y * 1.2; }
    }
    if (kind) out.push({x:x, z:z, y:y, kind:kind, s:sc});
  }
  out.sort(function(a, b){ return a.s - b.s; });
  return (candCache[key] = out);
}
function pickAnchor(cands, want, taken, sep){
  for (var pass = 0; pass < 4; pass++){
    var sp = sep * [1, .7, .45, 0][pass];
    for (var i = 0; i < cands.length; i++){
      var c = cands[i];
      if (want.indexOf(c.kind) < 0 && pass < 3) continue;
      var ok = true;
      for (var k = 0; k < taken.length && ok; k++) if (Math.hypot(taken[k].x - c.x, taken[k].z - c.z) < sp) ok = false;
      if (ok) return c;
    }
  }
  return null;
}
var FLOCK_N = {shore:5, stilt:4, duck:4, grebe:2, cormorant:3, tern:3, wader:2, stocky:2, spoon:4, jacana:2, rail:2, raptor:1, owl:1, small:3, magpie:3, kingfisher:1, pheasant:1, partridge:2, pitta:1, beeeater:2, hoopoe:2};
function clearFlocks(){
  flocks.forEach(function(f){
    f.birds.forEach(function(F){ scene.remove(F.M.grp); F.M.grp.traverse(function(o){ var i = pickables.indexOf(o); if (i >= 0) pickables.splice(i, 1); }); });
    scene.remove(f.ring); removeLabel(f.label);
  });
  flocks = [];
}
var RING_G, RING_M;
S.showBirds = function(groups, opts){
  if (!S.ready) return;
  opts = opts || {};
  clearFlocks();
  var scale = opts.overview ? 1.9 : 1, taken = [];
  groups.forEach(function(G){
    var S3 = SPOT3[G.spotId]; if (!S3 || !G.list.length) return;
    var cands = candidates(S3, G.hab, scale);
    G.list.forEach(function(item, idx){
      var b = item.b, pose = b.shape.pose, want = pose === 'float' ? ['water'] : pose === 'flyLow' ? ['water', 'shore'] : G.hab === 'wet' ? ['shore', 'water'] : ['land'];
      if (pose === 'walk' && G.hab === 'wet' && b.shape.leg > .3) want = ['shore', 'water'];
      var a = pickAnchor(cands, want, taken, .75 * scale) || {x:S3.x + idx * .3, z:S3.z + .4, y:S3.y, kind:'land'};
      taken.push(a);
      var n = opts.overview ? Math.min(2, FLOCK_N[b.body] || 2) : (FLOCK_N[b.body] || 2);
      if (b.id === 'greyfacedbuzzard' || b.id === 'sparrowhawk') n = opts.overview ? 3 : 5;
      var f = {b:b, x:a.x, z:a.z, y:a.y, S3:S3, birds:[], born:clock.elapsedTime, hot:item.hot, scale:scale};
      for (var i = 0; i < n; i++){
        var M = makeBird(b), sd = idx * 7.3 + i * 1.7 + a.x;
        var F = {M:M, pose:pose, sc:.36 * b.size * scale * (.88 + hash(sd) * .24), ph:hash(sd * 2.1) * 6.28,
          x:a.x + (hash(sd * 3.7) - .5) * .4 * scale, z:a.z + (hash(sd * 5.3) - .5) * .4 * scale, y:a.y, yaw:hash(sd * 9.1) * 6.28, state:'idle', until:clock.elapsedTime + hash(sd * 4.4) * 3,
          rr:(.35 + hash(sd * 6.6) * .5) * scale, w:(hash(sd * 8.8) > .5 ? 1 : -1) * (.25 + hash(sd * 2.9) * .2)};
        if (pose !== 'soar' && pose !== 'flyLow') F.y = groundAt(S3, F.x, F.z);
        if (pose === 'float' && a.kind === 'water') F.y = a.y;
        M.grp.scale.setScalar(.001); scene.add(M.grp);
        M.grp.traverse(function(o){ if (o.isMesh && o.userData.birdId) pickables.push(o); });
        f.birds.push(F);
      }
      if (!RING_G){ RING_G = new T.RingGeometry(.86, 1, 48); RING_M = new T.MeshBasicMaterial({color:'#ffffff', transparent:true, opacity:.8, depthWrite:false}); }
      f.ring = new T.Mesh(RING_G, RING_M); f.ring.rotation.x = -Math.PI / 2; f.ring.position.set(a.x, a.y + .03, a.z); f.ring.scale.setScalar(.55 * scale); f.ring.visible = false; f.ring.renderOrder = 3;
      scene.add(f.ring);
      var el = document.createElement('button'); el.type = 'button'; el.className = 'slab';
      el.innerHTML = '<i style="background:' + (b.c.back === '#ffffff' ? '#f2f2f2' : b.c.back) + '"></i>' + b.name + (item.hot ? '<b>★</b>' : '');
      el.dataset.bird = b.id;
      el.addEventListener('click', function(e){ e.stopPropagation(); if (S.onPickBird) S.onPickBird(b.id); });
      el.addEventListener('mouseenter', function(){ if (S.onHoverBird) S.onHoverBird(b.id); });
      el.addEventListener('mouseleave', function(){ if (S.onHoverBird) S.onHoverBird(null); });
      var lead = f.birds[0], up = new T.Vector3();
      f.label = addLabel(el, new T.Vector3(a.x, a.y + .6 * scale, a.z), 6 + (item.hot ? 1 : 0), 'bird',
        {follow:function(){ return up.copy(lead.M.grp.position).setY(lead.M.grp.position.y + Math.max(.25, lead.M.P.top * lead.sc) + .12 * scale); }});
      f.label.active = showLabels;
      flocks.push(f);
    });
  });
  S.highlight(hlId);
};

/* ---------- 鳥的動作 ---------- */
function turnTo(F, yaw, dt, k){
  var d = Math.atan2(Math.sin(yaw - F.yaw), Math.cos(yaw - F.yaw));
  F.yaw += d * Math.min(1, dt * (k || 6));
}
function updateBird(f, F, t, dt){
  var M = F.M, g = M.grp, sp = reduce ? .35 : 1, pitch = 0, roll = 0, open = 0, flap = 0, bob = 0;
  if (F.pose === 'soar'){
    F.th = (F.th === undefined ? F.ph : F.th) + F.w * dt * .45 * sp;
    var R = F.rr * 1.6, h = f.y + (1.1 + hash(F.ph) * .5) * f.scale;
    F.x = f.x + Math.cos(F.th) * R; F.z = f.z + Math.sin(F.th) * R; F.y = h + Math.sin(t * .7 + F.ph) * .08;
    F.yaw = Math.atan2(-Math.cos(F.th) * F.w, -Math.sin(F.th) * F.w);
    pitch = -M.P.tilt; roll = -F.w * .35; open = 1; flap = reduce ? 0 : Math.max(0, Math.sin(t * 1.3 + F.ph) - .7) * Math.sin(t * 14) * 1.2;
    M.legs.visible = false;
  } else if (F.pose === 'flyLow'){
    F.th = (F.th === undefined ? F.ph : F.th) + F.w * dt * 1.1 * sp;
    var R2 = F.rr * 1.2;
    F.x = f.x + Math.cos(F.th) * R2; F.z = f.z + Math.sin(F.th) * R2; F.y = f.y + (.35 + .12 * Math.sin(t * .9 + F.ph)) * f.scale;
    F.yaw = Math.atan2(-Math.cos(F.th) * F.w, -Math.sin(F.th) * F.w);
    pitch = -M.P.tilt; roll = -F.w * .25; open = 1; flap = reduce ? .1 : Math.sin(t * 9 + F.ph) * .55;
    M.legs.visible = false;
  } else if (F.pose === 'float'){
    F.th = (F.th === undefined ? F.ph : F.th) + F.w * dt * .18 * sp;
    var R3 = F.rr * .45;
    F.x = f.x + Math.cos(F.th) * R3; F.z = f.z + Math.sin(F.th) * R3;
    F.yaw = Math.atan2(-Math.cos(F.th) * F.w, -Math.sin(F.th) * F.w);
    bob = Math.sin(t * 1.6 + F.ph) * .006;
  } else if (F.pose === 'hop'){
    if (F.state === 'hop'){
      var k = (t - F.t0) / .45;
      if (k >= 1){ F.state = 'idle'; F.x = F.tx; F.z = F.tz; F.y = F.ty; F.until = t + 1 + Math.random() * 3 / sp; }
      else {
        F.x = F.fx + (F.tx - F.fx) * k; F.z = F.fz + (F.tz - F.fz) * k; bob = Math.sin(Math.PI * k) * .14 * f.scale + (F.ty - F.fy) * k + F.fy - F.y;
        open = .8; flap = Math.sin(t * 30) * .7;
      }
    } else {
      if (t > F.until){
        var a = Math.random() * 6.28, r = Math.random() * .3 * f.scale;
        F.fx = F.x; F.fz = F.z; F.fy = F.y; F.tx = f.x + Math.cos(a) * r; F.tz = f.z + Math.sin(a) * r; F.ty = groundAt(f.S3, F.tx, F.tz);
        F.t0 = t; F.state = 'hop'; F.yaw = Math.atan2(-(F.tz - F.fz), F.tx - F.fx);
      }
      pitch = Math.sin(t * 3 + F.ph) > .8 ? -.25 : 0;
    }
  } else if (F.pose === 'perch'){
    if (t > F.until){ F.goal = F.yaw + (Math.random() - .5) * 2; F.until = t + 2 + Math.random() * 4; }
    if (F.goal !== undefined) turnTo(F, F.goal, dt, 2);
    bob = Math.sin(t * 2 + F.ph) * .004;
  } else { // walk
    if (F.state === 'move'){
      var dx = F.tx - F.x, dz = F.tz - F.z, dist = Math.hypot(dx, dz), v = .09 * f.scale * sp * Math.max(.6, F.sc * 2);
      if (dist < .01){ F.state = 'idle'; F.until = t + 1 + Math.random() * 4 / sp; }
      else {
        var st = Math.min(dist, v * dt); F.x += dx / dist * st; F.z += dz / dist * st;
        F.y += (F.ty - F.y) * Math.min(1, dt * 3);
        turnTo(F, Math.atan2(-dz, dx), dt);
        bob = Math.abs(Math.sin(t * 9 + F.ph)) * .012;
      }
    } else {
      if (t > F.until){
        var a2 = Math.random() * 6.28, r2 = Math.random() * .35 * f.scale;
        F.tx = f.x + Math.cos(a2) * r2; F.tz = f.z + Math.sin(a2) * r2; F.ty = groundAt(f.S3, F.tx, F.tz); F.state = 'move';
      }
      pitch = Math.max(0, Math.sin(t * 1.7 + F.ph) - .55) * -1.1;
    }
  }
  setWings(M, open, flap);
  g.position.set(F.x, F.y + bob, F.z);
  g.rotation.set(roll, F.yaw, pitch);
}
function updateFlocks(t, dt){
  flocks.forEach(function(f){
    var grow = Math.min(1, (t - f.born) / .7), on = hlId === f.b.id, pulse = on ? 1.2 + Math.sin(t * 6) * .06 : 1;
    f.birds.forEach(function(F){
      updateBird(f, F, t, dt);
      F.M.grp.scale.setScalar(F.sc * ease(grow) * pulse);
    });
    f.ring.visible = on;
    if (on) f.ring.scale.setScalar((.55 + Math.sin(t * 4) * .04) * f.scale);
    f.label.boost = on ? 3 : 0;
    f.label.el.classList.toggle('on', on);
  });
}

/* ---------- 鷹河（灰面鵟鷹／赤腹鷹過境） ---------- */
var HAWK_PATH = [[120.58,24.35],[120.6,23.75],[120.66,23.15],[120.74,22.6],[120.8,22.2],[120.84,21.97],[120.92,21.6],[121.05,21.1]];
S.setHawks = function(opt){
  if (!S.ready) return;
  if (hawk){ hawk.birds.forEach(function(F){ scene.remove(F.M.grp); F.M.grp.traverse(function(o){ var i = pickables.indexOf(o); if (i >= 0) pickables.splice(i, 1); }); }); removeLabel(hawk.label); hawk = null; }
  if (!opt) return;
  var b = BA.birdById[opt.birdId], pts = HAWK_PATH.slice();
  if (opt.north){ pts = pts.slice(0, 6).reverse(); pts.push([120.45, 24.9], [120.3, 25.5]); }
  var curve = new T.CatmullRomCurve3(pts.map(function(q){ var p = P(q[0], q[1]); return new T.Vector3(p[0], 2.3, p[1]); }));
  hawk = {b:b, curve:curve, birds:[], scale:opt.scale || 1};
  for (var i = 0; i < 22; i++){
    var M = makeBird(b); scene.add(M.grp); M.legs.visible = false;
    M.grp.traverse(function(o){ if (o.isMesh && o.userData.birdId) pickables.push(o); });
    hawk.birds.push({M:M, u:i / 22 + hash(i) * .03, off:(hash(i * 3.1) - .5) * 1.1, dy:(hash(i * 5.7) - .5) * .7, ph:hash(i * 7.7) * 6.28, sc:.42 * b.size * 1.5 * hawk.scale});
  }
  var el = document.createElement('button'); el.type = 'button'; el.className = 'slab hawk'; el.dataset.bird = b.id;
  el.innerHTML = '<i style="background:' + b.c.back + '"></i>' + opt.label;
  el.addEventListener('click', function(e){ e.stopPropagation(); if (S.onPickBird) S.onPickBird(b.id); });
  var lead = hawk.birds[0], v = new T.Vector3();
  hawk.label = addLabel(el, new T.Vector3(), 8, 'bird', {follow:function(){ return v.copy(lead.M.grp.position).setY(lead.M.grp.position.y + .5); }});
};
var hv = null, ht = null;
function updateHawks(t, dt){
  if (!hawk) return;
  if (!hv){ hv = new T.Vector3(); ht = new T.Vector3(); }
  hawk.birds.forEach(function(F){
    F.u = (F.u + dt * (reduce ? .006 : .018)) % 1;
    hawk.curve.getPointAt(F.u, hv); hawk.curve.getTangentAt(F.u, ht);
    var g = F.M.grp, sx = -ht.z, sz = ht.x;
    g.position.set(hv.x + sx * F.off, hv.y + F.dy + Math.sin(t + F.ph) * .1, hv.z + sz * F.off);
    g.rotation.set(Math.sin(t * .8 + F.ph) * .2, Math.atan2(-ht.z, ht.x), -F.M.P.tilt);
    setWings(F.M, 1, reduce ? 0 : Math.max(0, Math.sin(t * 1.5 + F.ph) - .6) * Math.sin(t * 13) * 1.3);
    var fade = Math.min(1, F.u * 12, (1 - F.u) * 12);
    g.scale.setScalar(F.sc * Math.max(.001, fade));
  });
}

S.highlight = function(id){
  hlId = id || null;
  document.querySelectorAll('.slab').forEach(function(el){ el.classList.toggle('on', el.dataset.bird === hlId); });
};
S.setHabitat = function(h){
  curHab = h; U.hab.value = BA.HAB_ORDER.indexOf(h);
  if (seaMat) seaMat.uniforms.uWet.value = h === 'wet' ? 1 : 0;
};
S.setLabels = function(on){ showLabels = !!on; flocks.forEach(function(f){ f.label.active = showLabels; }); };
S.setReduce = function(on){ reduce = !!on; if (seaMat) seaMat.uniforms.uCalm.value = reduce ? .15 : 1; };
S.selectSpot = function(id){
  selSpot = id || null;
  Object.keys(SPOT3).forEach(function(k){
    var S3 = SPOT3[k], on = k === selSpot;
    S3.hut.scale.setScalar(on ? 1.05 : .7);
    S3.label.force = on; S3.label.pri = on ? 9 : 3;
    S3.label.el.classList.toggle('on', on);
  });
};

/* ---------- 鏡頭 ---------- */
S.flyTo = function(x, z, dist, polar, dur, y){
  var off = camera.position.clone().sub(controls.target), sph = new T.Spherical().setFromVector3(off);
  var to = new T.Spherical(dist, polar === undefined ? .9 : polar, sph.theta);
  var endT = new T.Vector3(x, y || 0, z), endP = new T.Vector3().setFromSpherical(to).add(endT);
  fly = {t0:clock.elapsedTime, dur:reduce ? .01 : (dur || 1.3), fromT:controls.target.clone(), toT:endT, fromP:camera.position.clone(), toP:endP};
};
S.overview = function(){
  var a = host.clientWidth / Math.max(1, host.clientHeight);
  S.flyTo(-8, 1, a < .8 ? 100 : a < 1.2 ? 84 : 72, .6);
};
S.focusSpot = function(id){
  var S3 = SPOT3[id]; if (!S3) return;
  var a = host.clientWidth / Math.max(1, host.clientHeight), k = a < .8 ? 1.45 : 1;
  S.flyTo(S3.x, S3.z, (S3.y > .4 ? 6.5 : 8.5) * k, .92, 1.3, S3.y * .8);
};
S.focusRegion = function(ids){
  var xs = [], zs = [];
  ids.forEach(function(id){ var S3 = SPOT3[id]; if (S3){ xs.push(S3.x); zs.push(S3.z); } });
  if (!xs.length) return;
  var mx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, mz = (Math.min.apply(null, zs) + Math.max.apply(null, zs)) / 2;
  var span = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, zs) - Math.min.apply(null, zs));
  var a = host.clientWidth / Math.max(1, host.clientHeight);
  S.flyTo(mx, mz, Math.min(95, Math.max(14, span * 2.2 + 10)) * (a < .8 ? 1.4 : 1), .85);
};

/* ---------- 互動 ---------- */
function pick(ev){
  var r = renderer.domElement.getBoundingClientRect();
  ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var hit = raycaster.intersectObjects(pickables, false).filter(function(h){ return h.object.visible && (!h.object.parent || h.object.parent.visible); })[0];
  return hit ? hit.object.userData : null;
}
function bindPointer(){
  var el = renderer.domElement, down = null, hoverQ = null, pending = false;
  el.addEventListener('pointerdown', function(e){ down = {x:e.clientX, y:e.clientY}; });
  el.addEventListener('pointerup', function(e){
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    var u = pick(e);
    if (u && u.birdId && S.onPickBird) S.onPickBird(u.birdId);
    else if (u && u.spotId && S.onPickSpot) S.onPickSpot(u.spotId);
  });
  el.addEventListener('pointermove', function(e){
    if (e.pointerType !== 'mouse') return;
    hoverQ = e;
    if (pending) return;
    pending = true;
    requestAnimationFrame(function(){
      pending = false;
      var u = pick(hoverQ);
      el.style.cursor = u ? 'pointer' : '';
      var id = u && u.birdId || null;
      if (id !== hoverId){ hoverId = id; if (S.onHoverBird) S.onHoverBird(id); }
    });
  });
}

/* ---------- 迴圈 ---------- */
function resize(){
  var w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h);
  // 右側清單（手機為底部抽屜）會蓋住畫面，把投影中心往空白處挪
  if (w > 760) camera.setViewOffset(w, h, Math.min(190, w * .13), 0, w, h);
  else camera.setViewOffset(w, h, 0, h * .2, w, h);
  camera.updateProjectionMatrix();
  labels.forEach(function(L){ L.w = 0; });
}
function loop(){
  requestAnimationFrame(loop);
  var dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  U.time.value = t;
  if (fly){
    var k = Math.min(1, (t - fly.t0) / fly.dur), e = ease(k);
    controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  updateFlocks(t, dt); updateHawks(t, dt);
  clouds.forEach(function(C){ C.g.position.x += dt * C.v; if (C.g.position.x > EXT.x1 + 14) C.g.position.x = EXT.x0 - 14; });
  Object.keys(SPOT3).forEach(function(id){ var fl = SPOT3[id].hut.userData.flag; fl.rotation.y = Math.sin(t * 3 + SPOT3[id].x) * .35; });
  renderer.render(scene, camera);
  layoutLabels();
}

/* ---------- 單隻預覽（照片載入失敗時的備援） ---------- */
var PV = null;
S.preview = function(canvas, birdId){
  if (!S.ready) return {stop:function(){}};
  var b = BA.birdById[birdId]; if (!b) return {stop:function(){}};
  if (!PV){
    PV = {r:new T.WebGLRenderer({canvas:canvas, antialias:true, alpha:true}), s:new T.Scene(), c:new T.PerspectiveCamera(32, 1, .01, 50), canvas:canvas};
    PV.s.add(new T.HemisphereLight('#ffffff', '#9ad7a8', 2.2));
    var d = new T.DirectionalLight('#ffffff', 2); d.position.set(2, 3, 2); PV.s.add(d);
    PV.r.setPixelRatio(Math.min(devicePixelRatio, 2));
  } else if (PV.canvas !== canvas){ PV.r.dispose(); PV = null; return S.preview(canvas, birdId); }
  if (PV.obj) PV.s.remove(PV.obj);
  var M = makeBird(b), g = M.P.body; g.computeBoundingSphere();
  var r = g.boundingSphere.radius, cx = g.boundingSphere.center;
  M.grp.position.set(-cx.x, -cx.y, -cx.z);
  var holder = new T.Group(); holder.add(M.grp); PV.s.add(holder); PV.obj = holder;
  var w = canvas.clientWidth || 280, h = canvas.clientHeight || 200;
  PV.r.setSize(w, h, false); PV.c.aspect = w / h; PV.c.updateProjectionMatrix();
  var dist = r / Math.sin(16 * Math.PI / 180) * (w / h < 1.3 ? 1.1 : .9);
  PV.c.position.set(0, r * .3, dist); PV.c.lookAt(0, 0, 0);
  var run = true, t0 = performance.now();
  (function tick(){
    if (!run) return;
    requestAnimationFrame(tick);
    var t = (performance.now() - t0) / 1000;
    holder.rotation.y = reduce ? -.5 : Math.sin(t * .6) * .6 - .5;
    PV.r.render(PV.s, PV.c);
  })();
  return {stop:function(){ run = false; }};
};

/* ---------- 啟動 ---------- */
S.init = function(opts){
  host = opts.host; labelRoot = opts.labels;
  if (opts.reduce !== undefined) reduce = opts.reduce;
  return Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(function(mods){
    T = mods[0]; Orbit = mods[1].OrbitControls; tmpV = new T.Vector3();
    clock = new T.Clock();
    LANDC = {under:col('#9fd8c4'), sand:col('#f4e3a8'), plain:col('#a9e07a'), grass:col('#78c95c'), forest:col('#4aa557'), deep:col('#3a8a53'), rock:col('#8f9c88'), snow:col('#f6f8fb')};
    renderer = new T.WebGLRenderer({antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(42, 1, .1, 600);
    camera.position.set(-5.5, 44, 34);
    controls = new Orbit(camera, renderer.domElement);
    controls.target.set(-5.5, 0, -3);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.maxPolarAngle = 1.28; controls.minDistance = 2; controls.maxDistance = 110;
    controls.screenSpacePanning = false; controls.zoomSpeed = .9;
    controls.addEventListener('start', function(){ fly = null; });
    raycaster = new T.Raycaster(); ndc = new T.Vector2();
    toonGrad = new T.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, T.RedFormat);
    toonGrad.minFilter = toonGrad.magFilter = T.NearestFilter; toonGrad.needsUpdate = true;
    landMat = habPatch(new T.MeshToonMaterial({vertexColors:true, gradientMap:toonGrad}));
    birdMat = new T.MeshToonMaterial({vertexColors:true, gradientMap:toonGrad, side:T.DoubleSide});
    lineMat = lineMatFor(.022);
    scene.add(new T.HemisphereLight('#e8f8ff', '#8fcf8a', 1.5));
    var sun = new T.DirectionalLight('#fff6e0', 2.4); sun.position.set(-20, 40, 18); scene.add(sun);
    scene.add(new T.AmbientLight('#ffffff', .35));

    buildPolys(); prepRidges();
    var tex = buildField();
    buildSea(tex);
    ISL.forEach(buildLand);
    S.setHabitat(curHab);
    buildSpots();

    ISL.forEach(function(I){
      if (!I.name) return;
      var el = document.createElement('div'); el.className = I.main ? 'ilab main' : 'ilab'; el.textContent = I.name;
      var at = I.main ? new T.Vector3(1.5, 2.6, -2) : new T.Vector3(I.c[0], .5, I.c[1] - .2);
      addLabel(el, at, I.main ? 5 : 4, 'isle');
    });
    BA.PEAKS.forEach(function(pk){
      var q = P(pk.at[0], pk.at[1]), el = document.createElement('div'); el.className = 'pk';
      el.textContent = '▲ ' + pk.name + ' ' + pk.m.toLocaleString() + 'm';
      addLabel(el, new T.Vector3(q[0], landY(q[0], q[1]) + .25, q[1]), 1, 'peak');
    });
    [['台灣海峽', 119.6, 24.25], ['太平洋', 122.6, 23.3], ['巴士海峽', 120.6, 21.3]].forEach(function(s){
      var q = P(s[1], s[2]), el = document.createElement('div'); el.className = 'sealab'; el.textContent = s[0];
      addLabel(el, new T.Vector3(q[0], .1, q[1]), 0, 'sea');
    });
    for (var i = 0; i < 7; i++){
      var c = cloud(i + 1); c.position.set(EXT.x0 + hash(i * 3.3) * (EXT.x1 - EXT.x0 + 20), 13 + hash(i * 1.9) * 3, EXT.z0 + hash(i * 4.7) * (EXT.z1 - EXT.z0));
      c.scale.setScalar(.6 + hash(i * 2.2) * .5); scene.add(c); clouds.push({g:c, v:.25 + hash(i) * .3});
    }

    bindPointer();
    window.addEventListener('resize', resize); resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    S.ready = true;
    S.overview(); fly.dur = .01;
    loop();
  });
};
S.stats = function(){
  return {flocks:flocks.length, birds:flocks.reduce(function(a, f){ return a + f.birds.length; }, 0), hawks:hawk ? hawk.birds.length : 0, labels:labels.length,
    visibleLabels:labels.filter(function(L){ return !L.off; }).length, spots:Object.keys(SPOT3).length, islands:ISL.length};
};
})();
