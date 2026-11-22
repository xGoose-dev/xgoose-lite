import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function serve(root, port = 0) {
  const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".mjs":"text/javascript", ".svg":"image/svg+xml" };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const file = resolve(root, "." + path + (path.endsWith("/") ? "index.html" : ""));
      if (!file.startsWith(root + sep)) throw new Error("Unknown path");
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type":mime[extname(file)] || "application/octet-stream", "Cache-Control":"no-store" });
      res.end(data);
    } catch { res.writeHead(404); res.end("File not found"); }
  });
  return new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => done(server));
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const server = await serve(resolve("dist"), Number(process.env.PORT ?? 4173));
  console.log("xgoose lite studio is running at http://127.0.0.1:" + server.address().port);
}
