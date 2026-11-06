// Процедурное дерево. Ничего не нарисовано заранее: форма вычисляется
// из прогресса игрока при каждом обновлении.
//  • общий уровень  → высота и толщина ствола;
//  • уровень сферы  → длина и толщина её ветви, число листьев;
//  • освоенные навыки → новые веточки с плодами/цветами;
//  • жизненная сила ветви → цвет листьев: вредные привычки и заброшенность
//    заставляют листья желтеть и опадать на землю.

import { SPHERES, SKILL_BY_ID } from './data.js';

const W = 600;
const H = 520;
const GROUND = 458;
const CX = 300;

// Стабильный «случайный» генератор: одно и то же дерево при одинаковом прогрессе.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const r1 = (v) => Math.round(v * 10) / 10;

function mix(c1, c2, t) {
  const p = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1); const b = p(c2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(t, 0, 1))).toString(16).padStart(2, '0')).join('');
}

// Кубическая кривая Безье: точка и направление.
function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
  const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
  const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
  const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
  return { x, y, ang: Math.atan2(dy, dx) };
}

// Сужающаяся «лента» вдоль кривой — так рисуются ствол и ветви.
function ribbon(curve, w0, w1, steps, opt) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = bez(...curve, t);
    let w = lerp(w0, w1, t);
    if (opt.flare) w += opt.flare * Math.pow(1 - t, 6);
    pts.push({ ...p, w });
  }
  if (opt.pixel) {
    const g = 4;
    const cells = new Set();
    const out = [];
    for (let i = 0; i < steps * 3; i++) {
      const t = i / (steps * 3);
      const p = bez(...curve, t);
      const w = Math.max(g, lerp(w0, w1, t) + (opt.flare ? opt.flare * Math.pow(1 - t, 6) : 0));
      const x = Math.round((p.x - w / 2) / g) * g;
      const y = Math.round((p.y - w / 2) / g) * g;
      const s = Math.max(g, Math.round(w / g) * g);
      const key = `${x},${y},${s}`;
      if (cells.has(key)) continue;
      cells.add(key);
      out.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}"/>`);
    }
    return `<g fill="${opt.fill}">${out.join('')}</g>`;
  }
  const left = [];
  const right = [];
  for (const p of pts) {
    const nx = Math.cos(p.ang + Math.PI / 2) * p.w / 2;
    const ny = Math.sin(p.ang + Math.PI / 2) * p.w / 2;
    left.push(`${r1(p.x + nx)},${r1(p.y + ny)}`);
    right.push(`${r1(p.x - nx)},${r1(p.y - ny)}`);
  }
  const end = pts[pts.length - 1];
  const capX = r1(end.x + Math.cos(end.ang) * end.w / 2);
  const capY = r1(end.y + Math.sin(end.ang) * end.w / 2);
  return `<path d="M${left.join(' L')} L${capX},${capY} L${right.reverse().join(' L')} Z" fill="${opt.fill}"${opt.extra || ''}/>`;
}

function leafShape(kind, size, color, x, y, rot, pixel) {
  if (pixel || kind === 'square') {
    const g = 4;
    const s = Math.max(g, Math.round(size * 0.8 / g) * g);
    return `<rect x="${Math.round((x - s / 2) / g) * g}" y="${Math.round((y - s / 2) / g) * g}" width="${s}" height="${s}" fill="${color}"/>`;
  }
  if (kind === 'round') {
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(size * 0.42)}" fill="${color}"/>`;
  }
  const s = size;
  const d = kind === 'petal'
    ? `M0 0 C${r1(s * .75)} ${r1(-s * .2)} ${r1(s * .6)} ${r1(-s * 1.15)} 0 ${r1(-s * .85)} C${r1(-s * .6)} ${r1(-s * 1.15)} ${r1(-s * .75)} ${r1(-s * .2)} 0 0Z`
    : `M0 0 Q${r1(s * .62)} ${r1(-s * .62)} 0 ${r1(-s * 1.45)} Q${r1(-s * .62)} ${r1(-s * .62)} 0 0Z`;
  return `<path d="${d}" fill="${color}" transform="translate(${r1(x)} ${r1(y)}) rotate(${Math.round(rot)})"/>`;
}

function fruitShape(theme, x, y, color, size, pixel) {
  if (pixel) {
    const g = 4;
    return `<rect x="${Math.round((x - 4) / g) * g}" y="${Math.round((y - 4) / g) * g}" width="8" height="8" fill="${color}"/>`;
  }
  if (theme.leafShape === 'petal') {
    // цветок сакуры из пяти лепестков
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += `<ellipse cx="0" cy="${r1(-size * .55)}" rx="${r1(size * .38)}" ry="${r1(size * .55)}" transform="rotate(${i * 72})"/>`;
    }
    return `<g transform="translate(${r1(x)} ${r1(y)})" fill="${color}" stroke="#E98AAA" stroke-width=".6">${out}<circle r="${r1(size * .22)}" fill="#E9A53B" stroke="none"/></g>`;
  }
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(size * .5)}" fill="${color}"/>` +
    `<circle cx="${r1(x - size * .15)}" cy="${r1(y - size * .17)}" r="${r1(size * .14)}" fill="#fff" opacity=".55"/>`;
}

// Порядок ветвей слева направо и их наклон (градусы от вертикали).
const ANGLES = [-74, -54, -33, -12, 12, 33, 54, 74];

export function renderTree(state, theme, { selected = null, reduceMotion = false } = {}) {
  const T = theme.tree;
  const pixel = Boolean(T.pixel);
  const level = state.player.level;
  const g = clamp(level / 30, 0, 1);
  // Молодое дерево показываем крупнее: «камера» приближается, а по мере роста отъезжает.
  const vbW = lerp(330, W, Math.sqrt(clamp(level / 24, 0, 1)));
  const vbH = vbW * H / W;
  const vbX = CX - vbW / 2;
  const vbY = H - vbH;
  const vx = (fx) => vbX + vbW * fx;   // позиция в долях видимой области
  const vy = (fy) => vbY + vbH * fy;

  const defs = [];
  const sky = [];
  const back = [];
  const fallen = [];
  const branches = [];
  const front = [];

  // --- небо ---
  defs.push(`<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.sky[0]}"/><stop offset="1" stop-color="${T.sky[1]}"/></linearGradient>`);
  sky.push(`<rect x="${r1(vbX)}" y="${r1(vbY)}" width="${r1(vbW)}" height="${r1(vbH)}" fill="url(#sky)"/>`);
  if (T.glow) {
    defs.push(`<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
  }
  const skyRand = rng(77);
  if (T.decor === 'sun') {
    if (pixel) {
      const sx = Math.round(vx(.82) / 4) * 4; const sy = Math.round(vy(.15) / 4) * 4;
      sky.push(`<rect x="${sx - 28}" y="${sy - 28}" width="56" height="56" fill="${T.sun}"/><rect x="${sx - 36}" y="${sy - 20}" width="72" height="40" fill="${T.sun}"/><rect x="${sx - 20}" y="${sy - 36}" width="40" height="72" fill="${T.sun}"/>`);
    } else {
      const k = vbW / W;
      sky.push(`<circle cx="${r1(vx(.82))}" cy="${r1(vy(.16))}" r="${r1(58 * k)}" fill="${T.sun}" opacity=".18"/><circle cx="${r1(vx(.82))}" cy="${r1(vy(.16))}" r="${r1(34 * k)}" fill="${T.sun}"/>`);
    }
  } else if (T.decor === 'moon') {
    for (let i = 0; i < 46; i++) {
      const x = vx(skyRand()); const y = vy(skyRand() * .6); const r = (skyRand() * 1.3 + .3) * vbW / W;
      sky.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="#fff" opacity="${r1(.3 + skyRand() * .6)}"/>`);
    }
    const k = vbW / W; const mx = vx(.82); const my = vy(.16);
    sky.push(`<circle cx="${r1(mx)}" cy="${r1(my)}" r="${r1(30 * k)}" fill="${T.sun}" opacity=".9"/><circle cx="${r1(mx + 14 * k)}" cy="${r1(my - 10 * k)}" r="${r1(27 * k)}" fill="${T.sky[0]}"/>`);
  } else if (T.decor === 'petals') {
    sky.push(`<circle cx="${r1(vx(.82))}" cy="${r1(vy(.16))}" r="${r1(40 * vbW / W)}" fill="#fff" opacity=".55"/>`);
    for (let i = 0; i < 14; i++) {
      const x = vx(skyRand()); const y = vy(.08 + skyRand() * .6);
      sky.push(leafShape('petal', 6, T.leaves[i % T.leaves.length], x, y, skyRand() * 360, false).replace('<path', '<path opacity=".75"'));
    }
  }

  // --- земля ---
  if (pixel) {
    back.push(`<rect x="0" y="${GROUND + 4}" width="${W}" height="${H - GROUND}" fill="${T.ground}"/><rect x="0" y="${GROUND + 28}" width="${W}" height="${H}" fill="${T.ground2}"/>`);
  } else {
    back.push(`<path d="M0 ${GROUND + 10} Q${CX} ${GROUND - 18} ${W} ${GROUND + 10} L${W} ${H} L0 ${H} Z" fill="${T.ground}"/>`);
    back.push(`<path d="M0 ${GROUND + 40} Q${CX - 120} ${GROUND + 20} ${W} ${GROUND + 44} L${W} ${H} L0 ${H} Z" fill="${T.ground2}"/>`);
  }

  // --- ствол ---
  const trunkH = 74 + 176 * g;
  const trunkW = 12 + 22 * g;
  const trunkCurve = [[CX, GROUND + 4], [CX - 10, GROUND - trunkH * 0.4], [CX + 12, GROUND - trunkH * 0.72], [CX, GROUND - trunkH]];
  const trunkWidthAt = (t) => lerp(trunkW, trunkW * 0.34, t);

  // корни
  if (!pixel) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const len = (22 + 16 * g) * (1 - k * 0.3);
        back.push(ribbon([[CX + side * 2, GROUND - 2], [CX + side * len * .4, GROUND + 2], [CX + side * len * .8, GROUND + 6 + k * 4], [CX + side * len, GROUND + 10 + k * 6]],
          trunkW * .35, 1, 8, { fill: T.trunkShade }));
      }
    }
  }
  front.push(ribbon(trunkCurve, trunkW, trunkW * 0.34, 18, { fill: T.trunk, flare: trunkW * 0.5, pixel, extra: T.glow ? ' filter="url(#glow)"' : '' }));
  if (!pixel) {
    // тень на стволе для объёма
    front.push(ribbon([[CX + trunkW * .2, GROUND + 4], [CX - 4, GROUND - trunkH * .4], [CX + 14, GROUND - trunkH * .72], [CX + 2, GROUND - trunkH]],
      trunkW * .35, trunkW * .1, 16, { fill: T.trunkShade, extra: ' opacity=".55"' }));
  }

  // --- ветви по сферам ---
  SPHERES.forEach((sphere, i) => {
    const s = state.spheres[sphere.id];
    const a = ANGLES[i] * Math.PI / 180;
    const f = 0.52 + 0.4 * (1 - Math.abs(ANGLES[i]) / 74) + (i % 2 ? 0.03 : -0.02);
    const base = bez(...trunkCurve, f);
    const bx = base.x; const by = base.y;
    const health = s.health / 100;
    const wither = clamp((0.7 - health) / 0.7, 0, 1);
    const isSel = selected === sphere.id;
    const leafPalette = T.leaves || [sphere.color, mix(sphere.color, '#ffffff', .25), mix(sphere.color, '#000000', .15)];
    const br = rng(hash(sphere.id));

    let g1 = '';
    const sway = reduceMotion ? '' : ` style="transform-origin:${r1(bx)}px ${r1(by)}px;animation-delay:${-i * 0.7}s"`;

    if (!s.started) {
      // Ветвь ещё не проросла — на стволе только почка.
      const dx = Math.sin(a) * 9; const dy = -Math.cos(a) * 9;
      g1 += leafShape(pixel ? 'square' : 'leaf', 9, mix(leafPalette[0], T.sky[1], .35), bx + dx, by + dy, ANGLES[i], pixel);
      const lx = bx + Math.sin(a) * 30; const ly = by - Math.cos(a) * 30;
      g1 += label(sphere, lx, ly, isSel, true, pixel);
      g1 += `<circle cx="${r1(lx)}" cy="${r1(ly)}" r="22" fill="transparent"/>`;
      branches.push(`<g class="branch is-bud${isSel ? ' is-selected' : ''}" data-sphere="${sphere.id}" tabindex="0" role="button" aria-label="${sphere.name}: ещё не проросла">${g1}</g>`);
      return;
    }

    const growth = 0.65 + 0.35 * g;
    let len = (36 + 13 * Math.min(s.level, 16) + 10 * s.progress) * growth;
    // ветвь не должна вылезать за край картинки
    len = Math.min(len, (by - 46) / Math.max(.3, Math.cos(a)), (CX - 36) / Math.max(.2, Math.abs(Math.sin(a))));
    const maxW = trunkWidthAt(f) * 0.8;
    const w0 = Math.min(3.2 + s.level * 0.6, 11, maxW);
    const a0 = clamp(a * 1.25, -1.5, 1.5);
    const dir0 = [Math.sin(a0), -Math.cos(a0)];
    const dir = [Math.sin(a), -Math.cos(a)];
    const tip = [bx + dir[0] * len, by + dir[1] * len];
    const curve = [[bx, by], [bx + dir0[0] * len * .45, by + dir0[1] * len * .45], [bx + dir[0] * len * .78, by + dir[1] * len * .78 - len * .06], tip];
    const branchColor = T.glow ? mix(sphere.color, T.dead, wither * .8) : mix(T.trunk, T.dead, wither * .6);
    const glowAttr = T.glow ? ' filter="url(#glow)"' : '';

    g1 += ribbon(curve, w0, 1.4, 14, { fill: branchColor, pixel, extra: glowAttr });

    // Веточки навыков
    const anchors = [{ x: tip[0], y: tip[1], w: 3 }];
    const fruits = [];
    s.unlocked.forEach((skillId, j) => {
      const sk = SKILL_BY_ID[skillId];
      const n = s.unlocked.length;
      const t = 0.32 + 0.6 * ((j + 1) / (n + 1));
      const p = bez(...curve, t);
      let side = j % 2 ? 1 : -1;
      let ang = p.ang + side * 0.75;
      if (Math.sin(ang) > 0.2) ang = p.ang - side * 0.75; // веточки не растут вниз
      const tl = (16 + 3 * sk.index) * growth;
      const end = [p.x + Math.cos(ang) * tl, p.y + Math.sin(ang) * tl];
      const mid = [p.x + Math.cos(ang) * tl * .5, p.y + Math.sin(ang) * tl * .5 - 3];
      g1 += ribbon([[p.x, p.y], mid, mid, end], Math.min(w0 * .5, 3), 0.8, 6, { fill: branchColor, pixel, extra: glowAttr });
      anchors.push({ x: end[0], y: end[1], w: 1.5 });
      fruits.push(end);
    });
    // Развилка на кончике: подветви, в которых уже есть опыт.
    const subs = (s.subList || []).filter(x => x.xp > 0).slice(0, 6);
    if (subs.length) {
      const total = subs.reduce((acc, x) => acc + x.xp, 0) || 1;
      const baseAng = Math.atan2(dir[1], dir[0]);
      subs.forEach((sb, k) => {
        const spread = subs.length === 1 ? 0 : (k / (subs.length - 1) - 0.5) * Math.min(1.5, 0.42 * subs.length);
        let ang = baseAng + spread;
        if (Math.sin(ang) > 0.25) ang = baseAng - Math.abs(spread) * 0.5; // не вниз
        const tl = (9 + 30 * Math.sqrt(sb.xp / total)) * growth;
        const end = [tip[0] + Math.cos(ang) * tl, tip[1] + Math.sin(ang) * tl];
        const mid = [tip[0] + Math.cos(ang) * tl * .5, tip[1] + Math.sin(ang) * tl * .5 - 2];
        g1 += ribbon([[tip[0], tip[1]], mid, mid, end], Math.min(w0 * .45, 2.6), 0.7, 6, { fill: branchColor, pixel, extra: glowAttr });
        anchors.push({ x: end[0], y: end[1], w: 1.2 });
      });
    }
    for (let k = 0; k < 3; k++) {
      const p = bez(...curve, 0.5 + k * 0.17);
      anchors.push({ x: p.x, y: p.y, w: 0.8 });
    }

    // Листья
    const count = clamp(5 + s.level * 3 + s.unlocked.length * 2, 5, 48);
    let leaves = '';
    const sizeK = 0.85 + 0.3 * g;
    for (let k = 0; k < count; k++) {
      const an = anchors[Math.floor(br() * br() * anchors.length)] || anchors[0];
      const rad = 4 + br() * (10 + s.level * 0.7);
      const th = br() * Math.PI * 2;
      const x = an.x + Math.cos(th) * rad;
      const y = an.y + Math.sin(th) * rad * 0.85;
      const size = (7 + br() * 4) * sizeK;
      const rot = br() * 360;
      const roll = br();
      const roll2 = br();
      if (roll < wither) {
        const wc = T.wither[Math.floor(br() * T.wither.length)];
        if (roll2 < 0.55) {
          // лист опал на землю
          const fx = clamp(x + (br() - .5) * 60, 10, W - 10);
          const fy = GROUND + 6 + br() * 22 - Math.abs(fx - CX) * 0.02;
          fallen.push(leafShape(T.leafShape, size * .9, wc, fx, fy, 70 + br() * 40, pixel));
        } else {
          leaves += leafShape(T.leafShape, size, wc, x, y, rot, pixel);
        }
      } else {
        leaves += leafShape(T.leafShape, size, leafPalette[Math.floor(br() * leafPalette.length)], x, y, rot, pixel);
      }
    }
    g1 += `<g${glowAttr}>${leaves}</g>`;
    for (const [fx, fy] of fruits) {
      g1 += fruitShape(T, fx, fy, T.glow ? '#ffffff' : T.fruit, 8, pixel);
    }

    const lx = tip[0] + dir[0] * 20; const ly = tip[1] + dir[1] * 20;
    g1 += label(sphere, lx, ly, isSel, false, pixel, s.level);

    // Невидимая широкая область, чтобы ветку было легко нажать пальцем.
    const hit = curve.map(p => p.map(r1).join(' '));
    g1 += `<path d="M${hit[0]} C${hit[1]} ${hit[2]} ${hit[3]}" stroke="transparent" stroke-width="34" fill="none" stroke-linecap="round"/>`;

    branches.push(`<g class="branch${isSel ? ' is-selected' : ''}" data-sphere="${sphere.id}" tabindex="0" role="button" aria-label="${sphere.name}, уровень ${s.level}, жизненная сила ${s.health}%"><g class="sway"${sway}>${g1}</g></g>`);
  });

  return `<svg viewBox="${r1(vbX)} ${r1(vbY)} ${r1(vbW)} ${r1(vbH)}" xmlns="http://www.w3.org/2000/svg" class="tree-svg${pixel ? ' is-pixel' : ''}"${pixel ? ' shape-rendering="crispEdges"' : ''} role="img" aria-label="Твоё дерево: ${state.stage.name}, уровень ${level}">
    <defs>${defs.join('')}</defs>
    ${sky.join('')}${back.join('')}
    <g class="fallen">${fallen.join('')}</g>
    ${front.join('')}
    ${branches.join('')}
  </svg>`;
}

function label(sphere, x, y, selected, bud, pixel, level) {
  const r = 13;
  const shape = pixel
    ? `<rect x="${Math.round(x - r)}" y="${Math.round(y - r)}" width="${r * 2}" height="${r * 2}" class="tag-bg"/>`
    : `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" class="tag-bg"/>`;
  const lvl = !bud && level > 0
    ? `<text x="${r1(x + 12)}" y="${r1(y + 12)}" class="tag-level">${level}</text>`
    : '';
  return `<g class="tag${selected ? ' is-selected' : ''}${bud ? ' is-bud' : ''}">${shape}<text x="${r1(x)}" y="${r1(y + 1)}" class="tag-icon">${sphere.icon}</text>${lvl}</g>`;
}


// ---------------------------------------------------------------------------
// Приближенная ветвь: одна сфера крупным планом, с подветвями.
//  • длина и толщина подветви — сколько опыта в неё вложено за всё время;
//  • листья — тоже по опыту; если подветвь давно не поливали, листья желтеют;
//  • на кончике — подпись с названием и временем.
// ---------------------------------------------------------------------------

export function subColor(sphereColor, i) {
  const steps = [0, .28, -.22, .45, -.38, .14, -.1, .6, -.5, .36, -.3, .52];
  const t = steps[i % steps.length];
  return t >= 0 ? mix(sphereColor, '#ffffff', t) : mix(sphereColor, '#000000', -t);
}

export function formatMinutes(m) {
  if (!m) return '0 мин';
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (!h) return `${mm} мин`;
  return mm ? `${h} ч ${mm} мин` : `${h} ч`;
}

const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderBranch(state, theme, sphereId, { reduceMotion = false, neglectDays = 7, labelScale = 1 } = {}) {
  const k = labelScale; // на телефоне подписи крупнее, чтобы их можно было прочитать
  const T = theme.tree;
  const pixel = Boolean(T.pixel);
  const sphere = SPHERES.find(x => x.id === sphereId);
  const s = state.spheres[sphereId];
  const subs = s.subList || [];
  const br = rng(hash('zoom:' + sphereId));
  const leafPalette = T.leaves || [sphere.color, mix(sphere.color, '#ffffff', .25), mix(sphere.color, '#000000', .15)];
  const sphereWither = clamp((0.7 - s.health / 100) / 0.7, 0, 1);
  const limbColor = T.glow ? sphere.color : T.trunk;
  const glowAttr = T.glow ? ' filter="url(#glow2)"' : '';

  const parts = [];
  const defs = [`<linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.sky[0]}"/><stop offset="1" stop-color="${T.sky[1]}"/></linearGradient>`];
  if (T.glow) defs.push(`<filter id="glow2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#sky2)"/>`);

  // Размытая листва на заднем плане — ощущение, что мы внутри кроны.
  const bgRand = rng(hash('bg:' + sphereId));
  let bg = '';
  for (let i = 0; i < 16; i++) {
    const c = T.leaves ? T.leaves[i % T.leaves.length] : leafPalette[i % leafPalette.length];
    bg += pixel
      ? `<rect x="${Math.round(bgRand() * W / 8) * 8}" y="${Math.round(bgRand() * H / 8) * 8}" width="${24 + Math.round(bgRand() * 4) * 8}" height="${24 + Math.round(bgRand() * 4) * 8}" fill="${c}"/>`
      : `<circle cx="${r1(bgRand() * W)}" cy="${r1(bgRand() * H * 0.9)}" r="${r1(30 + bgRand() * 60)}" fill="${c}"/>`;
  }
  parts.push(`<g opacity="${T.glow ? .12 : .16}">${bg}</g>`);

  // Основная ветвь: выходит слева (от ствола) и пологой дугой уходит вправо.
  const limb = [[-30, 482], [190, 452], [400, 420], [640, 352]];
  const limbW = clamp(18 + s.level * 1.2, 18, 36);
  parts.push(ribbon(limb, limbW, 8, 24, { fill: limbColor, pixel, extra: glowAttr }));
  if (!pixel && !T.glow) {
    parts.push(ribbon([[-30, 490], [190, 460], [400, 426], [640, 357]], limbW * .35, 2.5, 20, { fill: T.trunkShade, extra: ' opacity=".5"' }));
  }

  const leavesBack = [];
  const subsSvg = [];
  const labels = [];

  const drawLeaves = (anchorsList, count, wither, spread) => {
    let out = '';
    for (let k = 0; k < count; k++) {
      const an = anchorsList[Math.floor(br() * br() * anchorsList.length)] || anchorsList[0];
      const rad = 6 + br() * spread;
      const th = br() * Math.PI * 2;
      const x = an.x + Math.cos(th) * rad;
      const y = an.y + Math.sin(th) * rad * 0.85;
      const size = 13 + br() * 7;
      const roll = br();
      const color = roll < wither
        ? T.wither[Math.floor(br() * T.wither.length)]
        : leafPalette[Math.floor(br() * leafPalette.length)];
      out += leafShape(T.leafShape, size, color, x, y, br() * 360, pixel);
    }
    return out;
  };

  // Листья на конце самой ветви — «общий» опыт, не разложенный по подветвям.
  const limbTipAnchors = [{ x: 600, y: 360 }, { x: 570, y: 372 }, { x: 625, y: 345 }];
  const generalCount = clamp(Math.round(4 + Math.sqrt(s.generalXp || 0) * 1.4), subs.length ? 3 : 8, 34);
  leavesBack.push(drawLeaves(limbTipAnchors, generalCount, sphereWither, 26));

  const n = subs.length;
  const labelBoxes = [];
  const total = subs.reduce((a, x) => a + x.xp, 0);
  const maxXp = Math.max(1, ...subs.map(x => x.xp));
  subs.forEach((sb, i) => {
    const t = n === 1 ? 0.45 : 0.14 + 0.7 * (i / (n - 1));
    const p = bez(...limb, t);
    // Подветви растут вверх веером: левые клонятся влево, правые — вправо.
    const lean = (t - 0.5) * 0.95 + (br() - 0.5) * 0.12;
    const share = total ? sb.xp / total : 0;
    const rel = sb.xp / maxXp;
    const len = Math.min(sb.xp > 0 ? 80 + 210 * Math.sqrt(rel) : 40, p.y - 120);
    const w = sb.xp > 0 ? 5 + 10 * Math.sqrt(rel) : 3.5;
    // Кончик не должен уходить за край картинки.
    const dx = clamp(Math.sin(lean) * len, 46 - p.x, W - 46 - p.x);
    const end = [p.x + dx, p.y - Math.sqrt(Math.max(1, len * len - dx * dx))];
    const ang = Math.atan2(end[1] - p.y, end[0] - p.x);
    const up = lean < 0;
    const bend = (up ? -1 : 1) * 16;
    const c1 = [p.x + Math.cos(ang) * len * .35 - Math.sin(ang) * bend, p.y + Math.sin(ang) * len * .35 + Math.cos(ang) * bend];
    const c2 = [p.x + Math.cos(ang) * len * .7, p.y + Math.sin(ang) * len * .7 - 6];
    const curve = [[p.x, p.y], c1, c2, end];
    const neglect = sb.idleDays == null ? 0 : clamp((sb.idleDays - neglectDays) / 21, 0, 0.75);
    const wither = Math.max(sphereWither, neglect);
    const color = T.glow ? subColor(sphere.color, i) : mix(limbColor, T.dead, wither * .5);

    let g = ribbon(curve, w, 1.4, 12, { fill: color, pixel, extra: glowAttr });
    const anchorsList = [{ x: end[0], y: end[1] }];
    // мелкие веточки для живости
    const twigs = sb.xp > 0 ? clamp(Math.round(1 + rel * 3), 1, 4) : 0;
    for (let k = 0; k < twigs; k++) {
      const q = bez(...curve, 0.45 + 0.4 * (k / Math.max(1, twigs)));
      const side = k % 2 ? 1 : -1;
      let ta = q.ang + side * 0.8;
      if (Math.sin(ta) > 0.2) ta = q.ang - side * 0.8;
      const tl = 16 + 14 * rel;
      const te = [q.x + Math.cos(ta) * tl, q.y + Math.sin(ta) * tl];
      g += ribbon([[q.x, q.y], [q.x + Math.cos(ta) * tl * .5, q.y + Math.sin(ta) * tl * .5 - 2], te, te], Math.max(1.2, w * .4), .6, 5, { fill: color, pixel, extra: glowAttr });
      anchorsList.push({ x: te[0], y: te[1] });
    }
    const count = sb.xp > 0 ? clamp(Math.round(4 + Math.sqrt(sb.xp) * 1.5), 4, 46) : 1;
    g += `<g${glowAttr}>${sb.xp > 0 ? drawLeaves(anchorsList, count, wither, 10 + rel * 18) : leafShape(T.leafShape, 11, mix(leafPalette[0], T.sky[1], .4), end[0], end[1], 0, pixel)}</g>`;

    // Подпись
    const name = sb.name.length > 16 ? sb.name.slice(0, 15) + '…' : sb.name;
    const meta = (sb.minutes ? formatMinutes(sb.minutes) : sb.xp ? `${sb.xp} опыта` : 'ещё почка') +
      (share ? ` · ${Math.round(share * 100)}%` : '');
    const lw = Math.round(Math.max(name.length * 10.4 + 38, meta.length * 7.9 + 26) * k);
    const lh = Math.round(46 * k);
    labelBoxes.push({
      i, name, meta, w: lw, h: lh, tip: end,
      x: clamp(end[0] - lw / 2, 6, W - lw - 6), y: end[1] - lh - 22,
      dot: subColor(sphere.color, i), neglected: wither > .4,
    });

    const hit = curve.map(pt => pt.map(r1).join(' '));
    subsSvg.push(`<g class="subbranch" data-sub="${esc(sb.id)}" tabindex="0" role="button" aria-label="${esc(sb.name)}: ${esc(meta)}">
      ${g}<path d="M${hit[0]} C${hit[1]} ${hit[2]} ${hit[3]}" stroke="transparent" stroke-width="36" fill="none" stroke-linecap="round"/>
    </g>`);
  });

  // Раздвигаем подписи, чтобы они не налезали друг на друга.
  const placed = [];
  const hits = (a, b) => a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4;
  for (const box of [...labelBoxes].sort((a, b) => a.y - b.y)) {
    box.y = clamp(box.y, 6, H - box.h - 70);
    let guard = 0;
    while (placed.some(o => hits(o, box)) && guard++ < 40) {
      const o = placed.find(q => hits(q, box));
      box.y = o.y + o.h + 6;
      if (box.y > H - box.h - 70) { box.y = 6; box.x = clamp(box.x + (box.i % 2 ? 40 : -40), 6, W - box.w - 6); }
    }
    placed.push(box);
  }
  for (const box of labelBoxes) {
    // Если подпись пришлось сдвинуть — тонкая линия ведёт к кончику подветви.
    const cx = clamp(box.tip[0], box.x + 12, box.x + box.w - 12);
    const by = box.y + box.h;
    const leader = Math.hypot(cx - box.tip[0], by - box.tip[1]) > 34
      ? `<path d="M${r1(cx)} ${r1(box.tip[1] < box.y ? box.y : by)} L${r1(box.tip[0])} ${r1(box.tip[1])}" class="sub-tag-line"/>`
      : '';
    labels.push(`<g class="sub-tag${box.neglected ? ' is-neglected' : ''}" data-sub="${esc(subs[box.i].id)}">${leader}
      <rect x="${r1(box.x)}" y="${r1(box.y)}" width="${box.w}" height="${box.h}" rx="${pixel ? 0 : r1(13 * k)}" class="sub-tag-bg"/>
      <circle cx="${r1(box.x + 15 * k)}" cy="${r1(box.y + 16 * k)}" r="${r1(6 * k)}" fill="${box.dot}"/>
      <text x="${r1(box.x + 27 * k)}" y="${r1(box.y + 17 * k)}" class="sub-tag-name" style="font-size:${r1(17 * k)}px">${esc(box.name)}</text>
      <text x="${r1(box.x + 12 * k)}" y="${r1(box.y + 36 * k)}" class="sub-tag-meta" style="font-size:${r1(13 * k)}px">${esc(box.meta)}</text>
    </g>`);
  }

  // Почка «добавить подветвь» — только пока подветвей нет
  // (потом для этого есть кнопка в панели, чтобы не мешать подписям).
  let addBud = '';
  if (n === 0) {
    const p = bez(...limb, n ? 0.93 : 0.45);
    const bx = r1(p.x); const by = r1(p.y - (n ? 52 : 120));
    addBud = `<g class="add-sub" data-action="add-sub" tabindex="0" role="button" aria-label="Добавить подветвь">
      <circle cx="${bx}" cy="${by}" r="24" class="add-sub-bg"/>
      <path d="M${bx - 9} ${by}h18M${bx} ${by - 9}v18" class="add-sub-plus"/>
      ${n ? '' : `<text x="${bx}" y="${by - 38}" class="add-sub-text">Добавь подветвь</text>`}
    </g>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="tree-svg branch-svg${pixel ? ' is-pixel' : ''}${reduceMotion ? '' : ' is-zoomed-in'}"${pixel ? ' shape-rendering="crispEdges"' : ''} role="img" aria-label="Ветвь «${sphere.name}» крупным планом">
    <defs>${defs.join('')}</defs>
    ${parts.join('')}
    <g>${leavesBack.join('')}</g>
    ${subsSvg.join('')}
    ${addBud}
    <g class="sub-tags">${labels.join('')}</g>
  </svg>`;
}
