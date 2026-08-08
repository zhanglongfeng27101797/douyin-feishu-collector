import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { securityHeaders } from "./response.mjs";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

export function createStaticFileHandler(publicDirectory) {
  const root = resolve(publicDirectory);
  return async function serveStatic(pathname, response) {
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = resolve(root, relativePath);
    const contentType = CONTENT_TYPES[extname(filePath)];
    if (!contentType || (!filePath.startsWith(`${root}${sep}`) && filePath !== root)) {
      return false;
    }
    try {
      const contents = await readFile(filePath);
      response.writeHead(200, {
        ...securityHeaders(contentType),
        "cache-control": "no-store",
      });
      response.end(contents);
      return true;
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") return false;
      throw error;
    }
  };
}
