#!/usr/bin/env node
// Trivial local page for the browser preflight: a heading, a counter button
// and a live viewport-width readout. Unrelated to any experiment task.

import http from "node:http";

const page = (title) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body>
<h1>${title}</h1>
<button id="inc" onclick="document.getElementById('count').textContent = String(Number(document.getElementById('count').textContent) + 1)">Increment</button>
<p>Counter: <span id="count">0</span></p>
<p>Viewport width: <span id="width"></span></p>
<script>
  const w = () => { document.getElementById('width').textContent = String(window.innerWidth); };
  w(); window.addEventListener('resize', w);
</script>
</body></html>`;

http
  .createServer((req, res) => {
    const title = req.url === "/second" ? "Probe second page" : "Probe main page";
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page(title));
  })
  .listen(8765, "127.0.0.1");
