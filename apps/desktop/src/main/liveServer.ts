import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve, sep } from "node:path";

// "Go Live": ish papkasini 127.0.0.1 dagi tasodifiy portda statik server sifatida ochadi.

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

export class LiveServer {
  private server: Server | null = null;
  private root = "";
  private url = "";

  async start(root: string): Promise<string> {
    if (this.server && this.root === root) return this.url;
    await this.stop();
    this.root = root;
    const server = createServer((req, res) => {
      void this.handle(req.url ?? "/", res);
    });
    await new Promise<void>((ok, fail) => {
      server.once("error", fail);
      server.listen(0, "127.0.0.1", () => ok());
    });
    this.server = server;
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    return this.url;
  }

  private async handle(rawUrl: string, res: import("node:http").ServerResponse): Promise<void> {
    const notFound = () => {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404 — fayl topilmadi");
    };
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(rawUrl, "http://x").pathname);
    } catch {
      return notFound();
    }
    let file = resolve(this.root, `.${pathname}`);
    if (file !== this.root && !file.startsWith(this.root + sep)) return notFound();
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, "index.html");
      info = await stat(file).catch(() => null);
    }
    if (!info?.isFile()) return notFound();
    res.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((ok) => server.close(() => ok()));
  }
}
