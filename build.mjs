// Сборка совместимой версии игры для старых браузеров.
// Современные браузеры загружают js/app.js как есть, а старые
// (без поддержки ?. и ??) — js/app.legacy.js, пересобранный в старый синтаксис.
//
// Запуск: npm run build (на Vercel выполняется автоматически при каждой публикации).

import { build } from 'esbuild';

await build({
  entryPoints: ['public/js/legacy-entry.js'],
  outfile: 'public/js/app.legacy.js',
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
});
