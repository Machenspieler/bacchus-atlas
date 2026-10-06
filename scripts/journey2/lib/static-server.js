'use strict';
/* Throw-away static file server for the dev-only browser verification scripts. Serves a directory (the source
   tree or a built dist/) on an ephemeral 127.0.0.1 port, optionally under a sub-path prefix to prove the
   GitHub Pages base-path behaviour. Records every requested URL and can be told to fail a path (to prove the
   asset-failure state). Never used by the site itself. */
const fs = require('fs');
const path = require('path');
const http = require('http');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };

function serve(rootDir, opts) {
  const root = path.resolve(rootDir);
  const prefix = (opts && opts.prefix) || '';
  const requests = [];
  const failing = new Set();
  const server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    requests.push(url);
    if (prefix) { if (!url.startsWith(prefix)) { res.writeHead(404); res.end('outside base path'); return; } url = url.slice(prefix.length) || '/'; }
    for (const f of failing) if (url.includes(f)) { res.writeHead(500); res.end('forced failure'); return; }
    let file = path.join(root, url);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    server, port: server.address().port, requests, failing,
    base: 'http://127.0.0.1:' + server.address().port + prefix + '/',
    close: () => new Promise(r => server.close(r)),
  })));
}

module.exports = { serve, MIME };
