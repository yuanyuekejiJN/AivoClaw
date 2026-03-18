import * as fs from "fs";
import * as path from "path";
import { resolveUserStateDir } from "./constants";

// 应用日志（固定写入 ~/.openclaw/app.log）
const LOG_PATH = path.join(resolveUserStateDir(), "app.log");

// 日志上限 5MB，启动时截断
const MAX_LOG_SIZE = 5 * 1024 * 1024;

try {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX_LOG_SIZE) {
    fs.writeFileSync(LOG_PATH, "[truncated]\n");
  }
} catch {}

// 使用 WriteStream 异步缓冲写入，避免高频 appendFileSync 阻塞主进程
let logStream: fs.WriteStream | null = null;

function getLogStream(): fs.WriteStream {
  if (!logStream) {
    logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
    logStream.on("error", () => {});
  }
  return logStream;
}

// 写一行日志到文件 + console 镜像
// Windows 控制台默认 cp936，process.stdout.write(string) 会把 JS 字符串从 UTF-16
// 转成系统 ANSI 编码再输出，中文就会乱码。传入 Buffer (原始 UTF-8 字节) 可绕过此转换。
function write(level: string, msg: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try {
    getLogStream().write(line);
  } catch {}

  const buf = Buffer.from(line, "utf-8");
  if (level === "ERROR") {
    process.stderr.write(buf);
  } else {
    process.stdout.write(buf);
  }
}

export function info(msg: string): void { write("INFO", msg); }
export function warn(msg: string): void { write("WARN", msg); }
export function error(msg: string): void { write("ERROR", msg); }
