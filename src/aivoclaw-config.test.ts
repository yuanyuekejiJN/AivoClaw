import { test, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

vi.mock("electron", () => ({
  app: { getVersion: () => "2026.3.10" },
}));

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aivoclaw-config-test-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

test("readAivoclawConfig 无文件时返回 null", async () => {
  const { readAivoclawConfig } = await import("./aivoclaw-config");
  expect(readAivoclawConfig()).toBeNull();
});

test("writeAivoclawConfig + readAivoclawConfig 往返一致", async () => {
  const { readAivoclawConfig, writeAivoclawConfig } = await import("./aivoclaw-config");
  const config = {
    deviceId: "test-uuid",
    setupCompletedAt: "2026-03-10T00:00:00.000Z",
  };
  writeAivoclawConfig(config);
  expect(readAivoclawConfig()).toEqual(config);
});

test("detectOwnership 无任何文件时返回 fresh", async () => {
  const { detectOwnership } = await import("./aivoclaw-config");
  expect(detectOwnership()).toBe("fresh");
});

test("detectOwnership 有 aivoclaw.config.json + setupCompletedAt 时返回 aivoclaw", async () => {
  const { writeAivoclawConfig, detectOwnership } = await import("./aivoclaw-config");
  writeAivoclawConfig({
    deviceId: "id",
    setupCompletedAt: "2026-03-10T00:00:00.000Z",
  });
  expect(detectOwnership()).toBe("aivoclaw");
});

test("detectOwnership 有 setup-baseline 文件时返回 legacy-aivoclaw", async () => {
  const { detectOwnership } = await import("./aivoclaw-config");
  fs.writeFileSync(path.join(tmpDir, "openclaw-setup-baseline.json"), "{}", "utf-8");
  expect(detectOwnership()).toBe("legacy-aivoclaw");
});

test("detectOwnership 有 .device-id 但无 AivoClaw 独有文件时返回 external-openclaw", async () => {
  const { detectOwnership } = await import("./aivoclaw-config");
  fs.writeFileSync(path.join(tmpDir, ".device-id"), "some-uuid", "utf-8");
  fs.writeFileSync(path.join(tmpDir, "openclaw.json"), "{}", "utf-8");
  expect(detectOwnership()).toBe("external-openclaw");
});

test("detectOwnership 有 openclaw.json 无 .device-id 无 aivoclaw.config.json 时返回 external-openclaw", async () => {
  const { detectOwnership } = await import("./aivoclaw-config");
  fs.writeFileSync(path.join(tmpDir, "openclaw.json"), "{}", "utf-8");
  expect(detectOwnership()).toBe("external-openclaw");
});

test("migrateFromLegacy 从 .device-id 和 wizard.lastRunAt 迁移", async () => {
  const { migrateFromLegacy, readAivoclawConfig } = await import("./aivoclaw-config");
  fs.writeFileSync(path.join(tmpDir, ".device-id"), "legacy-uuid", "utf-8");
  fs.writeFileSync(
    path.join(tmpDir, "openclaw.json"),
    JSON.stringify({ wizard: { lastRunAt: "2026-01-01T00:00:00.000Z" } }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(tmpDir, "skill-store.json"),
    JSON.stringify({ registryUrl: "https://custom.registry" }),
    "utf-8",
  );

  const result = migrateFromLegacy();
  expect(result.deviceId).toBe("legacy-uuid");
  expect(result.setupCompletedAt).toBe("2026-01-01T00:00:00.000Z");
  expect(result.skillStore?.registryUrl).toBe("https://custom.registry");

  const saved = readAivoclawConfig();
  expect(saved?.deviceId).toBe("legacy-uuid");
});

test("markSetupComplete 写入 setupCompletedAt", async () => {
  const { markSetupComplete, readAivoclawConfig } = await import("./aivoclaw-config");
  markSetupComplete();
  const config = readAivoclawConfig();
  expect(config?.setupCompletedAt).toBeTruthy();
  expect(typeof config?.setupCompletedAt).toBe("string");
});
