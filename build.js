// src/sword.html → index.html (GitHub Pages, 서버 주소 넣음) · dist/sword.html (claude.ai 아티팩트, 서버 없음)
// 서버 주소를 빼고 만들려면: SERVER= node build.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'src/sword.html'), 'utf8');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const server = process.env.SERVER !== undefined ? process.env.SERVER : cfg.server || '';
const MARK = "const SERVER='';//@SERVER";
if (!src.includes(MARK)) throw new Error('src/sword.html에 서버 주소 자리가 없어요');

const icon = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='#1a1315'/><path d='M44 8l12 0 0 12-24 24-8-8z' fill='#ffd36b'/><path d='M44 8l12 0-28 28-4-4z' fill='#fff3c0'/><path d='M18 34l12 12-4 4-12-12z' fill='#c9a24a'/><path d='M14 46l4 4-8 8-4-4z' fill='#6b2a1d'/></svg>`;
const desc = '녹슨 철검을 +29 태초의 불꽃검까지 두들기는 검 강화 게임. 빠른 강화, +15부터 망치 타이밍, 잔해 조합, 보관함, 도감, 랭킹.';
const head = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${desc}">
<meta name="theme-color" content="#110d0e">
<meta property="og:type" content="website">
<meta property="og:title" content="한판 검 강화">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="https://2juwon.github.io/sword-master/">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box;height:100%}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
`;
const pages = head + src.replace(MARK, `const SERVER=${JSON.stringify(server)};`) + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, 'index.html'), pages);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/sword.html'), src);
console.log('index.html', (pages.length / 1024).toFixed(0) + 'KB', '서버:', server || '(없음)');
console.log('dist/sword.html (아티팩트)');
