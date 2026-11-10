// Стили игры. Каждый стиль задаёт цвета интерфейса (ui) и то,
// как рисуется дерево (tree). Чтобы добавить свой стиль — скопируйте
// любой блок, поменяйте id, название и цвета.

export const THEMES = [
  {
    id: 'spring',
    name: 'Весенний сад', en: 'Spring garden',
    ui: {
      bg: '#E9F0E6', surface: '#F7FAF4', surface2: '#DDE7D8', ink: '#1C2B22', muted: '#5D6F62',
      line: '#C9D7C3', accent: '#2F7A47', accentInk: '#FFFFFF', good: '#2F7A47', bad: '#B4532F',
      headFont: "'Unbounded', system-ui, sans-serif", bodyFont: "'Manrope', system-ui, sans-serif",
      radius: '18px',
    },
    tree: {
      sky: ['#BFDCCB', '#EEF5EA'], decor: 'sun', sun: '#F6C85F',
      ground: '#7DAE6A', ground2: '#5E9150',
      trunk: '#6B4A33', trunkShade: '#4F3524',
      leaves: ['#4E9F55', '#68B865', '#3E8A4A', '#86C870'],
      wither: ['#B88A3C', '#9C6B34', '#C9A15A'], dead: '#8C7A68',
      fruit: '#E2533C', leafShape: 'leaf',
    },
  },
  {
    id: 'sakura',
    name: 'Сакура', en: 'Sakura',
    ui: {
      bg: '#F6E9EC', surface: '#FFF8F8', surface2: '#F1DADF', ink: '#2E1F25', muted: '#7A5C66',
      line: '#E6C6CF', accent: '#B8456F', accentInk: '#FFFFFF', good: '#3E8A62', bad: '#B8456F',
      headFont: "'Unbounded', system-ui, sans-serif", bodyFont: "'Manrope', system-ui, sans-serif",
      radius: '22px',
    },
    tree: {
      sky: ['#F4D3DC', '#FDF4F1'], decor: 'petals', sun: '#F7B9C9',
      ground: '#C7D9B5', ground2: '#A8C496',
      trunk: '#4B3336', trunkShade: '#33222A',
      leaves: ['#F5A9C2', '#F9C8D7', '#EE89AC', '#FBDDE6'],
      wither: ['#C9A28E', '#B48A7A', '#D8BBAA'], dead: '#9B8A86',
      fruit: '#FFFFFF', leafShape: 'petal',
    },
  },
  {
    id: 'autumn',
    name: 'Золотая осень', en: 'Golden autumn',
    ui: {
      bg: '#F2E6D5', surface: '#FBF5EC', surface2: '#EAD9C2', ink: '#2F2116', muted: '#7A6450',
      line: '#DFC9AC', accent: '#A8481F', accentInk: '#FFFFFF', good: '#5E7F2F', bad: '#A8481F',
      headFont: "'Unbounded', system-ui, sans-serif", bodyFont: "'Manrope', system-ui, sans-serif",
      radius: '14px',
    },
    tree: {
      sky: ['#F2C99A', '#FBEEDD'], decor: 'sun', sun: '#F09A4A',
      ground: '#B8954F', ground2: '#9A7A3C',
      trunk: '#4E3423', trunkShade: '#352217',
      leaves: ['#D9822B', '#C2492F', '#E9B44C', '#B5651D'],
      wither: ['#8C7A5B', '#7A6A50', '#A08F70'], dead: '#6E6252',
      fruit: '#8E2C1E', leafShape: 'leaf',
    },
  },
  {
    id: 'neon',
    name: 'Ночной неон', en: 'Night neon',
    ui: {
      bg: '#0D1322', surface: '#151D31', surface2: '#1E2942', ink: '#E8EEFF', muted: '#8E9BBE',
      line: '#2A3756', accent: '#5CF2C4', accentInk: '#06261D', good: '#5CF2C4', bad: '#FF6B8B',
      headFont: "'Unbounded', system-ui, sans-serif", bodyFont: "'Manrope', system-ui, sans-serif",
      radius: '16px',
    },
    tree: {
      sky: ['#0B1020', '#18203A'], decor: 'moon', sun: '#E8EEFF',
      ground: '#1B2440', ground2: '#121A30',
      trunk: '#7A86B8', trunkShade: '#525C88',
      leaves: null, // в неоне листья окрашены в цвет сферы
      wither: ['#4A5070', '#3E4460', '#5A6080'], dead: '#3A4058',
      fruit: '#FFFFFF', leafShape: 'round', glow: true,
    },
  },
  {
    id: 'pixel',
    name: 'Пиксель', en: 'Pixel',
    ui: {
      bg: '#CFE8EF', surface: '#F4FBFC', surface2: '#B9DCE6', ink: '#1A1C2C', muted: '#4B5876',
      line: '#1A1C2C', accent: '#E43B44', accentInk: '#FFFFFF', good: '#3E8948', bad: '#E43B44',
      headFont: "'Press Start 2P', monospace", bodyFont: "'Manrope', system-ui, sans-serif",
      radius: '0px', pixel: true,
    },
    tree: {
      sky: ['#73C3E0', '#B8E3EE'], decor: 'sun', sun: '#FFCD75',
      ground: '#38B764', ground2: '#257179',
      trunk: '#733E39', trunkShade: '#3E2731',
      leaves: ['#38B764', '#A7F070', '#257179', '#3E8948'],
      wither: ['#C28569', '#8F563B', '#E8B796'], dead: '#566C86',
      fruit: '#E43B44', leafShape: 'square', pixel: true,
    },
  },
  {
    id: 'starlit', minLevel: 9,
    name: 'Звёздное древо', en: 'Starlit tree',
    ui: {
      bg: '#0E1026', surface: '#171A38', surface2: '#232651', ink: '#ECECFF', muted: '#9A9CCC',
      line: '#2E3160', accent: '#A98BFF', accentInk: '#120A2A', good: '#8BE0C0', bad: '#FF7AA8',
      headFont: "'Unbounded', system-ui, sans-serif", bodyFont: "'Manrope', system-ui, sans-serif",
      radius: '16px',
    },
    tree: {
      sky: ['#0A0C22', '#1A1D44'], decor: 'moon', sun: '#F2E9C0',
      ground: '#20224A', ground2: '#15173A',
      trunk: '#6E6AA8', trunkShade: '#4A4780',
      leaves: ['#B49BFF', '#8FA9FF', '#D7C4FF', '#9BE3FF'],
      wither: ['#555280', '#45426E', '#635F90'], dead: '#3C3A60',
      fruit: '#FFE9A8', leafShape: 'round', glow: true,
    },
  },
  {
    id: 'aurora', minLevel: 20,
    name: 'Северное сияние', en: 'Aurora',
    ui: {
      bg: '#071A1A', surface: '#0E2626', surface2: '#143636', ink: '#E6FFF7', muted: '#86B8AE',
      line: '#1E4444', accent: '#49E6A0', accentInk: '#05231A', good: '#49E6A0', bad: '#FF7A9A',
      headFont: "'Unbounded', system-ui, sans-serif", bodyFont: "'Manrope', system-ui, sans-serif",
      radius: '16px',
    },
    tree: {
      sky: ['#05131A', '#0C2A2E'], decor: 'moon', sun: '#D8FFF0',
      ground: '#103030', ground2: '#0A2222',
      trunk: '#5E7A72', trunkShade: '#3E554F',
      leaves: ['#49E6A0', '#54C8E6', '#9B7BFF', '#7BFFC0'],
      wither: ['#3E5E56', '#345048', '#4A6A60'], dead: '#2E4842',
      fruit: '#CFA8FF', leafShape: 'round', glow: true,
    },
  },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map(t => [t.id, t]));

export function applyTheme(theme) {
  const r = document.documentElement.style;
  const u = theme.ui;
  r.setProperty('--bg', u.bg);
  r.setProperty('--surface', u.surface);
  r.setProperty('--surface-2', u.surface2);
  r.setProperty('--ink', u.ink);
  r.setProperty('--muted', u.muted);
  r.setProperty('--line', u.line);
  r.setProperty('--accent', u.accent);
  r.setProperty('--accent-ink', u.accentInk);
  r.setProperty('--good', u.good);
  r.setProperty('--bad', u.bad);
  r.setProperty('--font-head', u.headFont);
  r.setProperty('--font-body', u.bodyFont);
  r.setProperty('--radius', u.radius);
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.classList.toggle('is-dark', ['neon', 'starlit', 'aurora'].includes(theme.id));
  document.documentElement.classList.toggle('is-pixel', Boolean(u.pixel));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', u.bg);
}
