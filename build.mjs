import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const TARGETS = {
  crab: { entry: 'src/crab/main.js', template: 'template-crab.html', output: 'dist/index.html' },
  classic: { entry: 'src/main.js', template: 'template.html', output: 'dist/classic.html' },
  soundlab: { entry: 'src/soundlab/main.js', template: 'template-soundlab.html', output: 'dist/soundlab.html' },
};
const target = TARGETS[process.argv[2] || 'crab'];

const gitOutput = (command) => {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const commit = gitOutput('git rev-parse --short HEAD') || 'unknown';
const uncommitted = gitOutput('git status --porcelain --untracked-files=no src') ? '+' : '';
const helsinkiParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
const builtAt = `${helsinkiParts.day}.${helsinkiParts.month}.${helsinkiParts.year} ${helsinkiParts.hour}:${helsinkiParts.minute}`;
const buildInfo = `Build ${builtAt} · ${commit}${uncommitted}`;

const result = await build({
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
  entryPoints: [target.entry],
  bundle: true,
  format: 'esm',
  minify: process.env.NO_MINIFY ? false : true,
  target: 'es2022',
  loader: { '.glb': 'binary' },
  write: false,
});

const bundle = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = readFileSync(target.template, 'utf8').replace('/*BUNDLE*/', () => bundle);
mkdirSync('dist', { recursive: true });
writeFileSync(target.output, html);
console.log(`${target.output} ${(html.length / 1024).toFixed(0)} KB (${buildInfo})`);
