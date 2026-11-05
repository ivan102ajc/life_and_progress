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
