// ============================================================
//  小型本機伺服器 —— 零依賴，只用 node 內建功能
//  由 Claude 建立 2026-10-14
//
//  為什麼需要它：
//    瀏覽器直接開 index.html（file:// 開頭）的時候，
//    為了安全不准網頁讀取 .glb 模型檔，畫面會一片空白。
//    起一個本機網址（http://localhost:...）就沒這個限制。
//
//  不要自己跑這支，雙擊「啟動.bat」就會順便把它叫起來。
// ============================================================

import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT_FROM = 8787;
const PORT_TRIES = 12;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin':  'application/octet-stream',
  '.hdr':  'image/vnd.radiance',
  '.ktx2': 'image/ktx2',
  '.exr':  'image/x-exr',
  '.wasm': 'application/wasm',
};

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const target = normalize(join(ROOT, clean === '/' ? '/index.html' : clean));
  // 不准往上跳出專案資料夾
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

const server = createServer(async (req, res) => {
  const file = safePath(req.url || '/');
  if (!file) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('不允許的路徑');
    return;
  }

  try {
    const st = await fs.stat(file);
    const real = st.isDirectory() ? join(file, 'index.html') : file;
    const size = st.isDirectory() ? (await fs.stat(real)).size : st.size;

    res.writeHead(200, {
      'Content-Type': TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': size,
      'Cache-Control': 'no-cache',
    });
    createReadStream(real).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`找不到檔案：${req.url}`);
  }
});

function listen(port, left) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && left > 0) {
      listen(port + 1, left - 1);
    } else {
      console.error('');
      console.error('  伺服器起不來：' + err.message);
      console.error('  請把這個視窗關掉，重新雙擊「啟動.bat」一次。');
      process.exit(1);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log('');
    console.log('  島嶼地圖已經啟動');
    console.log('  網址：' + url);
    console.log('');
    console.log('  改完 src\\ 裡的檔案，回瀏覽器按 F5 就會看到新的。');
    console.log('  要關掉：直接關這個視窗。');
    console.log('');

    // 自動開瀏覽器（使用者不必自己貼網址）
    // 加 --no-open 參數可以不要自動開，方便測試
    if (!process.argv.includes('--no-open')) {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    }
  });
}

listen(PORT_FROM, PORT_TRIES);
