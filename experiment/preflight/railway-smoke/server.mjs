// Disposable Railway smoke app: answers every request with the deployment
// nonce so preflight can confirm this exact upload is live.
import http from "node:http";
import { readFileSync } from "node:fs";

const nonce = readFileSync(new URL("./nonce.txt", import.meta.url), "utf8").trim();
http
  .createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`capsule-smoke ${nonce}\n`);
  })
  .listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
