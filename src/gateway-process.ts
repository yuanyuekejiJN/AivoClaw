import { ChildProcess, spawn } from "child_process";
import * as crypto from "crypto";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { app } from "electron";
import {
  DEFAULT_PORT,
  HEALTH_TIMEOUT_MS,
  HEALTH_POLL_INTERVAL_MS,
  CRASH_COOLDOWN_MS,
  IS_WIN,
  resolveGatewayLogPath,
  resolveNodeBin,
  resolveNodeExtraEnv,
  resolveNpmBin,
  resolveGatewayEntry,
  resolveGatewayCwd,
  resolveResourcesPath,
  resolveClawhubEntry,
  resolveUserBinDir,
  resolveUserStateDir,
  resolveUserConfigPath,
} from "./constants";

// 诊断日志（固定写入 ~/.openclaw/gateway.log，便于用户定位）
const LOG_PATH = resolveGatewayLogPath();

function diagLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stderr.write(Buffer.from(line, "utf-8"));
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
  } catch {}
}

export type GatewayState = "stopped" | "starting" | "running" | "stopping";

interface GatewayOptions {
  port?: number;
  token: string;
  onStateChange?: (state: GatewayState) => void;
}

export class GatewayProcess {
  private proc: ChildProcess | null = null;
  private state: GatewayState = "stopped";
  private port: number;
  private token: string;
  private extraEnv: Record<string, string> = {};
  private lastCrashTime = 0;
  private onStateChange?: (state: GatewayState) => void;

  // 世代计数器：每次 spawn 递增，exit handler 只处理同代进程的退出
  private generation = 0;

  constructor(opts: GatewayOptions) {
    this.port = opts.port ?? DEFAULT_PORT;
    this.token = opts.token;
    this.onStateChange = opts.onStateChange;
  }

  getState(): GatewayState {
    return this.state;
  }

  getPort(): number {
    return this.port;
  }

  // 更新端口（在 start 前调用，用于冲突解决场景）
  setPort(port: number): void {
    if (port > 0 && port <= 65535) {
      this.port = port;
    }
  }

  getToken(): string {
    return this.token;
  }

  // 更新 Gateway 鉴权 token（在 start 前调用）
  setToken(token: string): void {
    const trimmed = token.trim();
    if (!trimmed) return;
    this.token = trimmed;
  }

  // 设置额外环境变量（在 start 前调用，spawn 时展开到子进程）
  setExtraEnv(env: Record<string, string>): void {
    this.extraEnv = { ...this.extraEnv, ...env };
  }

  // 启动 Gateway 子进程
  async start(): Promise<void> {
    if (this.state === "running" || this.state === "starting") return;

    // 前一次 stop 还未完成，等待其结束再启动
    if (this.state === "stopping") {
      diagLog("start() waiting for previous stop to complete");
      await this.waitForStopped(6000);
    }

    // 崩溃冷却期
    const elapsed = Date.now() - this.lastCrashTime;
    if (this.lastCrashTime > 0 && elapsed < CRASH_COOLDOWN_MS) {
      await sleep(CRASH_COOLDOWN_MS - elapsed);
    }

    this.setState("starting");

    const nodeBin = resolveNodeBin();
    const entry = resolveGatewayEntry();
    const cwd = resolveGatewayCwd();

    // 诊断：打印所有关键路径
    diagLog(`--- gateway start ---`);
    diagLog(`platform=${process.platform} arch=${process.arch} packaged=${app.isPackaged}`);
    diagLog(`resourcesPath=${resolveResourcesPath()}`);
    diagLog(`nodeBin=${nodeBin} exists=${fs.existsSync(nodeBin)}`);
    diagLog(`entry=${entry} exists=${fs.existsSync(entry)}`);
    diagLog(`cwd=${cwd} exists=${fs.existsSync(cwd)}`);
    diagLog(`token=${maskToken(this.token)} port=${this.port}`);

    // 检查关键文件
    if (!fs.existsSync(nodeBin)) {
      diagLog(`FATAL: node binary not found`);
      this.setState("stopped");
      return;
    }
    if (!fs.existsSync(entry)) {
      diagLog(`FATAL: gateway entry not found`);
      this.setState("stopped");
      return;
    }

    // 启动前探测端口，若有旧 gateway 则自动停止
    const portBusy = await this.probeHealth();
    if (portBusy) {
      diagLog(`WARN: port ${this.port} already in use, attempting to stop existing gateway`);
      await this.stopExistingGateway(nodeBin, entry, cwd);
    }

    // 清理可能残留的锁文件（SIGKILL 终止旧进程后锁文件不会自动删除）
    cleanGatewayLockFiles();

    // 确保 clawhub CLI wrapper 就绪
    ensureClawhubWrapper(nodeBin);

    // 组装 PATH：用户 bin 目录 + 内嵌 runtime 优先
    const userBinDir = resolveUserBinDir();
    const runtimeDir = path.join(resolveResourcesPath(), "runtime");
    const envPath = userBinDir + path.delimiter + runtimeDir + path.delimiter + (process.env.PATH ?? "");

    // 递增世代，标记本次 spawn 的身份
    const gen = ++this.generation;

    // 不传 --port 和 --bind，让 gateway 自行从配置文件/环境变量解析
    const args = [entry, "gateway", "run"];
    diagLog(`spawn: ${nodeBin} ${args.join(" ")} (gen=${gen})`);

    this.proc = spawn(nodeBin, args, {
      cwd,
      env: {
        ...process.env,
        ...resolveNodeExtraEnv(),
        NODE_ENV: "production",
        // 禁止 openclaw 入口在子进程内二次 respawn，避免 Windows 闪烁控制台窗口
        OPENCLAW_NO_RESPAWN: "1",
        OPENCLAW_LENIENT_CONFIG: "1",
        OPENCLAW_GATEWAY_TOKEN: this.token,
        OPENCLAW_NPM_BIN: resolveNpmBin(),
        PATH: envPath,
        // Windows 强制 UTF-8：让 gateway 子进程（工具调用）输出 UTF-8，避免 GBK 乱码
        ...(IS_WIN ? { PYTHONUTF8: "1", LANG: "C.UTF-8" } : {}),
        ...this.extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const childPid = this.proc.pid ?? -1;

    // 捕获 spawn 错误（如二进制不可执行）
    this.proc.on("error", (err) => {
      diagLog(`spawn error: ${err.message}`);
    });

    // 转发日志（同时写入诊断文件）
    // 用 Buffer 写入避免 Windows cp936 乱码（详见 logger.ts 注释）
    this.proc.stdout?.on("data", (d: Buffer) => {
      const s = d.toString("utf-8");
      process.stdout.write(Buffer.from(`[gateway] ${s}`, "utf-8"));
      diagLog(`stdout: ${s.trimEnd()}`);
    });
    this.proc.stderr?.on("data", (d: Buffer) => {
      const s = d.toString("utf-8");
      process.stderr.write(Buffer.from(`[gateway] ${s}`, "utf-8"));
      diagLog(`stderr: ${s.trimEnd()}`);
    });

    // 退出处理：通过世代号隔离，只有同代进程的退出才影响状态机
    this.proc.on("exit", (code, signal) => {
      diagLog(`child exit: code=${code} signal=${signal} gen=${gen} currentGen=${this.generation} prevState=${this.state}`);
      if (gen !== this.generation) {
        diagLog(`SKIP: stale generation exit event (gen=${gen}, current=${this.generation})`);
        return;
      }
      if (this.state === "stopping") {
        this.setState("stopped");
      } else if (this.state === "running") {
        // 运行中非预期退出 = 崩溃
        diagLog("WARN: gateway exited unexpectedly while running");
        this.lastCrashTime = Date.now();
        this.setState("stopped");
      } else {
        // starting 阶段退出（如端口冲突）
        this.lastCrashTime = Date.now();
        this.setState("stopped");
      }
      this.proc = null;
    });

    // 轮询健康检查
    const healthy = await this.waitForHealth(HEALTH_TIMEOUT_MS, childPid);
    if (healthy) {
      // 健康探测通过后，等一小段时间确认子进程没有立刻退出（排除旧进程误判）
      await sleep(300);
      if (this.isChildAlive(childPid)) {
        diagLog("health check passed, child alive");
        this.setState("running");
      } else {
        diagLog("WARN: health check passed but child process already exited (port may be occupied by old gateway)");
        this.setState("stopped");
      }
    } else {
      diagLog("FATAL: health check timeout");
      this.stop();
    }
  }

  // 停止 Gateway
  stop(): void {
    if (!this.proc || this.state === "stopped" || this.state === "stopping") return;

    this.setState("stopping");
    this.proc.kill("SIGTERM");

    // 5s 强制终止兜底（用 exitCode 判断进程是否真正退出，而非 killed 标志）
    const p = this.proc;
    setTimeout(() => {
      if (p && p.exitCode == null) {
        diagLog("WARN: SIGTERM timeout, sending SIGKILL");
        p.kill("SIGKILL");
      }
    }, 5000);
  }

  // 停止已存在的旧 gateway（端口冲突时自动调用）
  private async stopExistingGateway(nodeBin: string, entry: string, cwd: string): Promise<void> {
    try {
      const { execFileSync } = require("child_process") as typeof import("child_process");
      diagLog("exec: gateway stop");
      execFileSync(nodeBin, [entry, "gateway", "stop"], {
        cwd,
        timeout: 10_000,
        stdio: "pipe",
        windowsHide: true,
        env: {
          ...process.env,
          ...resolveNodeExtraEnv(),
          OPENCLAW_NO_RESPAWN: "1",
          OPENCLAW_LENIENT_CONFIG: "1",
        },
      });
      diagLog("existing gateway stopped");
    } catch (err: any) {
      diagLog(`existing gateway stop failed: ${err.message ?? err}`);
    }

    // 等端口释放
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      if (!(await this.probeHealth())) {
        diagLog("port released");
        return;
      }
    }
    diagLog("WARN: port release timeout, cleaning lock files and attempting to start anyway");
    cleanGatewayLockFiles();
  }

  // 重启：等旧进程真正退出后再启动
  async restart(): Promise<void> {
    this.stop();
    await this.waitForStopped(6000);
    // Windows 上进程退出后端口/锁文件释放需要额外时间
    // 轮询等待端口释放，避免新进程因 "gateway already running" 秒退
    for (let i = 0; i < 10; i++) {
      if (!(await this.probeHealth())) break;
      diagLog(`restart: waiting for port ${this.port} to release (${i + 1}/10)`);
      await sleep(500);
    }
    // SIGKILL 不触发 gateway 清理钩子，手动删除残留锁文件
    cleanGatewayLockFiles();
    await this.start();
  }

  // HTTP 探测根路径（Control UI）
  private probeHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/`, (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  // 轮询等待健康
  private async waitForHealth(timeoutMs: number, childPid: number): Promise<boolean> {
    if (childPid <= 0) return false;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.isChildAlive(childPid)) {
        diagLog(`health check aborted: child exited pid=${childPid}`);
        return false;
      }
      if (await this.probeHealth()) return true;
      await sleep(HEALTH_POLL_INTERVAL_MS);
    }
    return false;
  }

  // 轮询等待状态变为 stopped（用于 restart 和 start 前等待旧进程结束）
  private async waitForStopped(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.state === "stopping" && Date.now() < deadline) {
      await sleep(100);
    }
    if (this.state === "stopping") {
      diagLog("WARN: waitForStopped timeout, forcing stopped state");
      this.setState("stopped");
    }
  }

  // 仅当同一子进程仍存活时才认为启动检查有效，避免旧端口进程误判
  private isChildAlive(childPid: number): boolean {
    return !!this.proc && this.proc.pid === childPid && this.proc.exitCode == null;
  }

  private setState(s: GatewayState): void {
    const prev = this.state;
    this.state = s;
    diagLog(`state: ${prev} → ${s}`);
    this.onStateChange?.(s);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 脱敏显示 token，避免明文泄露到日志
function maskToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

/**
 * 清理 Gateway 锁文件（位于临时目录）
 * Gateway 使用 gateway.<hash>.lock 作为进程互斥锁，
 * SIGKILL 终止时锁文件不会被自动清理，导致后续启动报 "already running"。
 */
function cleanGatewayLockFiles(): void {
  try {
    const configPath = resolveUserConfigPath();
    const hash = crypto.createHash("sha256").update(configPath).digest("hex").slice(0, 8);
    const lockDir = path.join(os.tmpdir(), "openclaw");
    const lockFile = path.join(lockDir, `gateway.${hash}.lock`);

    if (fs.existsSync(lockFile)) {
      fs.rmSync(lockFile, { force: true });
      diagLog(`cleaned lock file: ${lockFile}`);
    }
  } catch (err: any) {
    diagLog(`WARN: failed to clean lock file: ${err.message ?? err}`);
  }
}

// 生成 clawhub CLI wrapper 脚本（每次 gateway 启动时确保最新）
function ensureClawhubWrapper(nodeBin: string): void {
  const clawhubEntry = resolveClawhubEntry();
  if (!fs.existsSync(clawhubEntry)) {
    diagLog(`clawhub entry not found, skipping wrapper generation: ${clawhubEntry}`);
    return;
  }

  const binDir = resolveUserBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  // 默认 workdir 指向 ~/.openclaw/workspace
  const workdir = path.join(resolveUserStateDir(), "workspace");

  if (IS_WIN) {
    const wrapper = [
      "@echo off",
      "REM AivoClaw clawhub CLI - auto-generated, do not edit",
      "setlocal",
      `set "APP_NODE=${nodeBin.replace(/"/g, '""')}"`,
      `set "APP_ENTRY=${clawhubEntry.replace(/"/g, '""')}"`,
      `set "APP_WORKDIR=${workdir.replace(/"/g, '""')}"`,
      'set "ELECTRON_RUN_AS_NODE=1"',
      '"%APP_NODE%" "%APP_ENTRY%" --workdir "%APP_WORKDIR%" %*',
      "exit /b %errorlevel%",
      "",
    ].join("\r\n");
    fs.writeFileSync(path.join(binDir, "clawhub.cmd"), wrapper, "utf-8");
  } else {
    const safeNode = nodeBin.replace(/(["\\$`])/g, "\\$1");
    const safeEntry = clawhubEntry.replace(/(["\\$`])/g, "\\$1");
    const safeWorkdir = workdir.replace(/(["\\$`])/g, "\\$1");
    const wrapper = [
      "#!/usr/bin/env bash",
      "# AivoClaw clawhub CLI - auto-generated, do not edit",
      `APP_NODE="${safeNode}"`,
      `APP_ENTRY="${safeEntry}"`,
      `APP_WORKDIR="${safeWorkdir}"`,
      "export ELECTRON_RUN_AS_NODE=1",
      'exec "$APP_NODE" "$APP_ENTRY" --workdir "$APP_WORKDIR" "$@"',
      "",
    ].join("\n");
    const wrapperPath = path.join(binDir, "clawhub");
    fs.writeFileSync(wrapperPath, wrapper, "utf-8");
    fs.chmodSync(wrapperPath, 0o755);
  }

  diagLog(`clawhub wrapper generated: ${binDir}`);
}
