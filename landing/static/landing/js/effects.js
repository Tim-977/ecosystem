/* Ecosystem — homepage effects. Dependency-free takes on a few ReactBits
   ideas (Halftone Reveal, Ghost Cursor, Drift Wall, Magic Bento),
   rebuilt for this page: theme-aware, paused when off-screen, and quiet under
   prefers-reduced-motion. Each returns early when it can't run, leaving the
   static markup in place. */
(function () {
  'use strict';
  const Eco = (window.Eco = window.Eco || {});
  const fx = (Eco.fx = {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = () => window.matchMedia('(hover: none)').matches;
  // lengths written back into a zoomed page are scaled again (see Eco.pageZoom)
  const zoom = () => (Eco.pageZoom ? Eco.pageZoom() : 1);

  /* CSS color (any syntax, including var-resolved tokens) → [r, g, b] in 0..1 */
  function cssColor(name) {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const m = (getComputedStyle(probe).color.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
    probe.remove();
    return [m[0] / 255, m[1] / 255, m[2] / 255];
  }

  function compile(gl, vs, fs) {
    const make = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(p);
    const cache = {};
    p.u = (n) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n)));
    return p;
  }

  /* Run fn(now) every frame while the element is on screen and fn returns true. */
  function visibleLoop(el, fn) {
    let raf = 0, visible = false;
    const tick = (now) => { raf = 0; if (visible && fn(now)) raf = requestAnimationFrame(tick); };
    const kick = () => { if (!raf && visible) raf = requestAnimationFrame(tick); };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }, { rootMargin: '80px' }).observe(el);
    return kick;
  }

  /* ======================================================================
     Halftone reveal: the image is printed as a dot screen in the page's own
     ink and paper; a lens under the pointer shows it sharp. Scrolling past
     clears the whole print (scroll: true), and setClear(0..1) refines the dot
     screen until the image is fully sharp.
     ====================================================================== */
  const HT_VS = `#version 300 es
in vec2 position; out vec2 vUv;
void main(){ vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;

  const HT_FS = `#version 300 es
precision highp float;
uniform sampler2D tMap;
uniform vec2 uRes, uImg, uMouse;
uniform float uAct, uRadius, uIdle, uDensity, uDot, uAngle, uTint, uContrast, uStrength;
uniform vec3 uInk, uPaper;
in vec2 vUv; out vec4 fragColor;

vec2 aspect(){ return vec2(uRes.x / max(uRes.y, 1.0), 1.0); }
vec2 cover(vec2 uv){
  float ia = uImg.x / max(uImg.y, 1.0), pa = uRes.x / max(uRes.y, 1.0);
  vec2 s = pa > ia ? vec2(1.0, ia / pa) : vec2(pa / ia, 1.0);
  return clamp((uv - 0.5) * s + 0.5, 0.0, 1.0);
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 grade(vec3 c){ return clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0); }
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(){
  vec2 asp = aspect();
  vec2 st = vUv * asp;
  float ang = radians(uAngle);

  // one cell of the rotated dot screen
  vec2 rp = rot(ang) * st * uDensity;
  vec2 center = floor(rp) + 0.5;
  vec2 uvC = (rot(-ang) * (center / uDensity)) / asp;
  vec3 cell = grade(texture(tMap, cover(uvC)).rgb);

  // how much ink reproduces this tone on this paper (works for light and dark)
  float pl = lum(uPaper), il = lum(uInk);
  float cov = clamp((lum(cell) - pl) / (il - pl + (il > pl ? 1e-3 : -1e-3)), 0.0, 1.0);
  // dots swell toward the upper right and thin out under the headline
  float focusField = 1.0 - smoothstep(0.1, 1.15, length((vUv - vec2(0.72, 0.7)) * vec2(1.0, 1.5)));
  cov *= mix(0.12, 1.0, focusField);
  vec2 f = fract(rp) - 0.5;
  float d = length(f);
  float w = length(fwidth(rp)) * 0.6 + 1e-4;
  float r = sqrt(cov) * 0.43 * uDot;
  float dotMask = smoothstep(r + w, r - w, d);
  float floorMask = smoothstep(0.07 + w, 0.07 - w, d) * (1.0 - dotMask);
  vec3 ink = mix(uPaper, mix(uInk, cell, uTint), uStrength);
  vec3 print = mix(uPaper, ink, dotMask);
  print = mix(print, mix(uPaper, uInk, 0.14), floorMask);

  // lens
  vec2 duv = (vUv - uMouse) * asp;
  float dist = length(duv);
  float radius = max(uRadius, 1e-4) * mix(0.35, 1.0, uAct);
  float band = radius * 0.12;
  float lens = (1.0 - smoothstep(radius - band, radius + band, dist)) * uAct;
  float focus = clamp(max(lens, uIdle), 0.0, 1.0);

  float t = clamp(dist / radius, 0.0, 1.0);
  float bend = t * t * t * t * uAct * (1.0 - uIdle);
  vec2 dir = dist > 1e-5 ? duv / dist : vec2(0.0);
  vec2 off = dir * bend * radius * 0.2 / asp;
  vec2 ca = dir * bend * 0.004 / asp;
  vec3 sharp = vec3(
    texture(tMap, cover(vUv - off - ca)).r,
    texture(tMap, cover(vUv - off)).g,
    texture(tMap, cover(vUv - off + ca)).b);

  fragColor = vec4(mix(print, sharp, focus), 1.0);
}`;

  fx.halftone = function (host, { img, imgLight, hero, scroll = true, radius = 0.3, density = 92, dot = 1.0, angle = 30, tint = 0.55, contrast = 1.12 } = {}) {
    if (!host || !img) return null;
    const imgDark = img;
    const pickImg = () => (document.documentElement.dataset.theme === 'light' && imgLight ? imgLight : imgDark);
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    let prog;
    try { prog = compile(gl, HT_VS, HT_FS); } catch (e) { return null; }
    host.appendChild(canvas);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.uniform1i(prog.u('tMap'), 0);
    gl.uniform1f(prog.u('uDot'), dot);
    gl.uniform1f(prog.u('uAngle'), angle);
    gl.uniform1f(prog.u('uTint'), tint);
    gl.uniform1f(prog.u('uContrast'), contrast);
    gl.uniform1f(prog.u('uRadius'), radius);

    let loaded = false;
    let currentImg = null;
    const upload = (image) => {
      const im = image || pickImg();
      if (!im.complete || !im.naturalWidth) { im.addEventListener('load', () => upload(im), { once: true }); return; }
      currentImg = im;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.uniform2f(prog.u('uImg'), im.naturalWidth, im.naturalHeight);
      loaded = true;
      host.classList.add('is-ready');
      kick();
    };

    const theme = () => {
      // a muted print on dark paper, so the lens is where the color lives
      gl.uniform1f(prog.u('uStrength'), document.documentElement.dataset.theme === 'light' ? 0.9 : 0.5);
      gl.uniform3fv(prog.u('uInk'), cssColor('--fg-1'));
      gl.uniform3fv(prog.u('uPaper'), cssColor('--bg'));
      const next = pickImg();
      if (next !== currentImg) upload(next);
      kick();
    };

    const resize = () => {
      const dpr = Math.min((window.devicePixelRatio || 1) * zoom(), 2);
      const w = Math.max(1, Math.round(host.clientWidth * dpr));
      const h = Math.max(1, Math.round(host.clientHeight * dpr));
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(prog.u('uRes'), w, h);
      // keep the dot pitch similar in CSS pixels across screen sizes
      baseDensity = clamp(host.clientHeight / 12, 48, density);
      kick();
    };

    /* pointer + intro sweep + scroll-clearing, all eased per frame */
    const m = { x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, act: 0, target: 0, idle: 0, idleTarget: 0, clear: 0, clearTarget: 0 };
    let baseDensity = density;
    let intro = reduced() ? null : { t0: 0, dur: 2300 };
    let pointerInside = false;
    let lastInput = 0;
    const area = hero || host;

    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      m.x = (e.clientX - r.left) / r.width;
      m.y = 1 - (e.clientY - r.top) / r.height;
      m.target = reduced() ? 0 : 1;
      pointerInside = true;
      lastInput = performance.now();
      if (intro) { intro = null; m.sx = m.x; m.sy = m.y; }
      area.classList.add('is-touched');
      kick();
    };
    const onLeave = () => { pointerInside = false; m.target = 0; kick(); };
    area.addEventListener('pointermove', onMove, { passive: true });
    area.addEventListener('pointerdown', onMove, { passive: true });
    area.addEventListener('pointerleave', onLeave, { passive: true });
    area.addEventListener('pointercancel', onLeave, { passive: true });

    const onScroll = () => {
      const h = area.offsetHeight || 1;
      m.idleTarget = clamp((window.scrollY - h * 0.12) / (h * 0.5), 0, 1);
      kick();
    };
    if (scroll) window.addEventListener('scroll', onScroll, { passive: true });

    let prev = 0;
    const frame = (now) => {
      if (!loaded) return false;
      const dt = Math.min(0.05, Math.max(0.001, (now - (prev || now)) / 1000));
      prev = now;

      if (intro) {
        // one slow wiper pass across the print, like clearing a windshield
        if (!intro.t0) intro.t0 = now;
        const p = (now - intro.t0) / intro.dur;
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        m.x = m.sx = -0.15 + e * 1.3;
        m.y = m.sy = 0.66 + Math.sin(e * Math.PI) * 0.1;
        m.target = p < 0.85 ? 1 : 0;
        if (p >= 1) intro = null;
      } else if (coarse() && !reduced() && now - lastInput > 2600) {
        // no hover on touch screens: let the lens wander on its own
        const t = now / 1000;
        m.x = 0.5 + Math.sin(t * 0.37) * 0.32;
        m.y = 0.62 + Math.sin(t * 0.53 + 1.3) * 0.16;
        m.target = 0.85;
      }
      const follow = 1 - Math.exp(-dt / (intro ? 0.02 : 0.2));
      m.sx += (m.x - m.sx) * follow;
      m.sy += (m.y - m.sy) * follow;
      m.act += (m.target - m.act) * (1 - Math.exp(-dt / 0.2));
      m.idle += (m.idleTarget - m.idle) * (1 - Math.exp(-dt / 0.12));
      m.clear += (m.clearTarget - m.clear) * (1 - Math.exp(-dt / 0.45));

      gl.uniform2f(prog.u('uMouse'), m.sx, m.sy);
      gl.uniform1f(prog.u('uAct'), m.act);
      // refining: the screen gets finer first, the sharp image fades in last
      gl.uniform1f(prog.u('uIdle'), Math.max(m.idle, Math.pow(m.clear, 3)));
      gl.uniform1f(prog.u('uDensity'), baseDensity * (1 + m.clear * 1.6));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const moving = Math.abs(m.x - m.sx) + Math.abs(m.y - m.sy) > 0.0005;
      const settling = Math.abs(m.target - m.act) > 0.002 || Math.abs(m.idleTarget - m.idle) > 0.002 || Math.abs(m.clearTarget - m.clear) > 0.002;
      const wandering = coarse() && !reduced() && !pointerInside;
      if (!(intro || moving || settling || wandering)) prev = 0;
      return !!(intro || moving || settling || wandering);
    };
    const kick = visibleLoop(host, frame);

    new ResizeObserver(resize).observe(host);
    document.addEventListener('eco:theme', theme);
    theme();
    resize();
    if (scroll) onScroll();
    return {
      redraw: kick,
      setClear(v) { m.clearTarget = clamp(v, 0, 1); kick(); },
    };
  };

  /* ======================================================================
     Ghost cursor: a soft smoke trail inside its host.
     ====================================================================== */
  const TRAIL = 24;
  const GH_FS = `precision mediump float;
uniform vec2 uRes, uTrail[${TRAIL}];
uniform float uTime, uOpacity, uScale;
uniform vec3 uColor;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f *= f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5; mat2 m = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p * 2.0; a *= 0.5; }
  return v;
}
void main(){
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 uv = (gl_FragCoord.xy / uRes * 2.0 - 1.0) * asp;
  vec2 q = vec2(fbm(uv * uScale + uTime * 0.1), fbm(uv * uScale + vec2(5.2, 1.3) + uTime * 0.1));
  vec2 r = vec2(fbm(uv * uScale + q * 1.5 + uTime * 0.15), fbm(uv * uScale + q * 1.5 + vec2(8.3, 2.8) + uTime * 0.15));
  float smoke = pow(fbm(uv * uScale + r * 0.8), 2.5);
  float radius = (0.5 + 0.3 / uScale) * uOpacity;
  float field = 0.0;
  for (int i = 0; i < ${TRAIL}; i++) {
    float t = 1.0 - float(i) / float(${TRAIL});
    t = t * t * (i == 0 ? 1.0 : 0.8);
    vec2 pm = (uTrail[i] * 2.0 - 1.0) * asp;
    field += t * (1.0 - smoothstep(0.0, radius, length(uv - pm)));
  }
  float a = clamp(smoke * field * uOpacity, 0.0, 1.0);
  gl_FragColor = vec4(uColor, a);
}`;

  fx.ghost = function (host, { strength = 0.6 } = {}) {
    if (!host || reduced()) return null;
    const canvas = document.createElement('canvas');
    canvas.className = 'ghost';
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false, depth: false, stencil: false });
    if (!gl) return null;
    let prog;
    try { prog = compile(gl, 'attribute vec2 position; void main(){ gl_Position = vec4(position, 0.0, 1.0); }', GH_FS); } catch (e) { return null; }
    host.prepend(canvas);

    const trail = Array.from({ length: TRAIL }, () => [0.5, 0.5]);
    const flat = new Float32Array(TRAIL * 2);
    const head = [0.5, 0.5], target = [0.5, 0.5], vel = [0, 0];
    let active = false, opacity = 0, lastMove = 0;
    const t0 = performance.now();

    const theme = () => {
      const light = document.documentElement.dataset.theme === 'light';
      canvas.style.mixBlendMode = light ? 'multiply' : 'screen';
      const c = cssColor('--indigo');
      gl.uniform3fv(prog.u('uColor'), light ? c : c.map((v) => Math.min(1, v * 0.8 + 0.25)));
    };
    const resize = () => {
      const s = Math.min(window.devicePixelRatio || 1, 1) * 0.55;
      canvas.width = Math.max(1, Math.round(host.clientWidth * s));
      canvas.height = Math.max(1, Math.round(host.clientHeight * s));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(prog.u('uRes'), canvas.width, canvas.height);
      gl.uniform1f(prog.u('uScale'), clamp(Math.min(host.clientWidth, host.clientHeight) / 600, 0.5, 2));
    };

    const frame = (now) => {
      if (active) {
        vel[0] = target[0] - head[0]; vel[1] = target[1] - head[1];
        head[0] = target[0]; head[1] = target[1];
        opacity = Math.min(1, opacity + 0.08);
      } else {
        vel[0] *= 0.5; vel[1] *= 0.5;
        head[0] += vel[0]; head[1] += vel[1];
        const idle = now - lastMove;
        if (idle > 700) opacity = Math.max(0, 1 - (idle - 700) / 1300);
      }
      trail.pop();
      trail.unshift([head[0], head[1]]);
      trail.forEach((p, i) => { flat[i * 2] = p[0]; flat[i * 2 + 1] = p[1]; });
      gl.uniform2fv(prog.u('uTrail[0]'), flat);
      gl.uniform1f(prog.u('uTime'), (now - t0) / 1000);
      gl.uniform1f(prog.u('uOpacity'), opacity * strength);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return active || opacity > 0.002;
    };
    const kick = visibleLoop(host, frame);

    host.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      target[0] = clamp((e.clientX - r.left) / r.width, 0, 1);
      target[1] = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
      if (!active && opacity === 0) { head[0] = target[0]; head[1] = target[1]; trail.forEach((p) => { p[0] = target[0]; p[1] = target[1]; }); }
      active = true;
      lastMove = performance.now();
      kick();
    }, { passive: true });
    host.addEventListener('pointerleave', () => { active = false; lastMove = performance.now(); kick(); }, { passive: true });

    new ResizeObserver(() => { resize(); kick(); }).observe(host);
    document.addEventListener('eco:theme', () => { theme(); kick(); });
    theme();
    resize();
    return { redraw: kick };
  };

  /* ======================================================================
     Drift wall: columns of tiles drifting on a tilted plane. Hovering a tile
     lifts it and brings its column to rest; the plane leans toward the pointer.
     ====================================================================== */
  fx.drift = function (root, { speed = 26, variance = 0.45, parallax = 0.6, tilt = 18, turn = -16, roll = 6, depth = 120 } = {}) {
    if (!root) return null;
    const plane = root.querySelector('[data-drift-plane]');
    const tracks = Array.from(root.querySelectorAll('.drift__track'));
    if (!plane || !tracks.length) return null;
    const still = reduced();

    // enough copies of each column to keep the loop seamless
    const originals = tracks.map((t) => Array.from(t.children));
    const cols = tracks.map((track, c) => {
      const tiles = originals[c];
      const unit = tiles[0].offsetHeight + parseFloat(getComputedStyle(tiles[0]).marginBottom || 0);
      const copyHeight = unit * tiles.length;
      const copies = Math.max(2, Math.ceil((root.offsetHeight * 1.8) / copyHeight) + 1);
      for (let k = 1; k < copies; k++) {
        tiles.forEach((tile) => {
          const clone = tile.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          clone.tabIndex = -1;
          clone.querySelectorAll('img').forEach((im) => { im.loading = 'lazy'; });
          track.appendChild(clone);
        });
      }
      const pseudo = ((c * 0.6180339887 + 0.35) % 1) * 2 - 1;
      return {
        track, copyHeight,
        base: speed * (1 + variance * pseudo) * (c % 2 === 0 ? 1 : -1),
        v: 0, offset: copyHeight * ((c * 0.37) % 1),
      };
    });
    const place = (c) => { c.track.style.transform = `translate3d(0, ${-c.offset}px, 0)`; };
    cols.forEach(place);

    let hoveredCol = -1, activeTile = null;
    const pointer = { x: 0, y: 0, dx: 0, dy: 0 };
    const setActive = (tile) => {
      if (tile === activeTile) return;
      if (activeTile) activeTile.classList.remove('is-active');
      activeTile = tile;
      if (tile) tile.classList.add('is-active');
      hoveredCol = tile ? tracks.indexOf(tile.parentElement) : -1;
    };
    root.addEventListener('pointermove', (e) => {
      const r = root.getBoundingClientRect();
      if (!still) { pointer.x = (e.clientX - r.left) / r.width - 0.5; pointer.y = (e.clientY - r.top) / r.height - 0.5; }
      setActive(e.target.closest('.tile'));
      kick();
    }, { passive: true });
    root.addEventListener('pointerleave', () => { pointer.x = pointer.y = 0; setActive(null); kick(); });
    root.addEventListener('focusin', (e) => setActive(e.target.closest('.tile')));
    root.addEventListener('focusout', () => setActive(null));

    let prev = 0;
    const frame = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - (prev || now)) / 1000));
      prev = now;
      const damp = 1 - Math.exp(-dt / 0.14);
      pointer.dx += (pointer.x * parallax * 8 - pointer.dx) * damp;
      pointer.dy += (-pointer.y * parallax * 8 - pointer.dy) * damp;
      plane.style.transform = `translate(-50%, -50%) scale(1.14) rotateX(${tilt + pointer.dy}deg) rotateY(${turn + pointer.dx}deg) rotateZ(${roll}deg) translateZ(${-depth}px)`;
      if (still) { prev = 0; return Math.abs(pointer.dx - pointer.x * parallax * 8) > 0.01; }
      cols.forEach((c, i) => {
        const goal = hoveredCol === i ? 0 : c.base;
        c.v += (goal - c.v) * (1 - Math.exp(-dt / (goal === 0 ? 0.16 : 0.5)));
        c.offset = (((c.offset + c.v * dt) % c.copyHeight) + c.copyHeight) % c.copyHeight;
        place(c);
      });
      return true;
    };
    const kick = visibleLoop(root, frame);
    return { redraw: kick };
  };

  /* ======================================================================
     Magic glow: cards near the pointer pick up a border light that tracks it.
     ====================================================================== */
  fx.glow = function (cards, { radius = 300 } = {}) {
    const list = Array.from(cards);
    if (!list.length || coarse()) return null;
    const near = new Set();
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) near.add(e.target);
      else { near.delete(e.target); e.target.style.setProperty('--gi', 0); }
    }));
    list.forEach((c) => io.observe(c));
    const proximity = radius * 0.5, fade = radius * 0.75;
    let px = -1e4, py = -1e4, raf = 0;
    const update = () => {
      raf = 0;
      near.forEach((card) => {
        const r = card.getBoundingClientRect();
        const dx = Math.max(r.left - px, 0, px - r.right);
        const dy = Math.max(r.top - py, 0, py - r.bottom);
        const dist = Math.hypot(dx, dy);
        const gi = dist <= 0 ? 1 : dist >= fade ? 0 : clamp((fade - dist) / (fade - proximity), 0, 1);
        card.style.setProperty('--gi', gi.toFixed(3));
        if (gi > 0) {
          const z = zoom();
          card.style.setProperty('--gx', `${(px - r.left) / z}px`);
          card.style.setProperty('--gy', `${(py - r.top) / z}px`);
        }
      });
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
    document.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; queue(); }, { passive: true });
    document.addEventListener('scroll', queue, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { px = py = -1e4; queue(); });

    if (!reduced()) {
      list.filter((c) => c.matches('.bento__card')).forEach((card) => {
        card.addEventListener('pointerdown', (e) => {
          const r = card.getBoundingClientRect();
          const dot = document.createElement('span');
          dot.className = 'glow-ripple';
          dot.style.left = `${(e.clientX - r.left) / zoom()}px`;
          dot.style.top = `${(e.clientY - r.top) / zoom()}px`;
          card.appendChild(dot);
          dot.addEventListener('animationend', () => dot.remove(), { once: true });
        });
      });
    }
    return {};
  };
})();
