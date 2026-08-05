import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(target)));
    if (entry.isFile() && target.endsWith(".mjs")) files.push(target);
  }
  return files;
}

function check(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${file} 语法检查失败`));
    });
  });
}

const files = [...(await filesUnder("src")), ...(await filesUnder("scripts"))];
for (const file of files) await check(file);
console.log(`语法检查通过：${files.length} 个模块`);
