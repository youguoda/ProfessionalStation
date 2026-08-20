import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetStore } from "@/lib/db/store";

export interface TempStore {
  reset: () => void;
  cleanup: () => void;
}

/** 创建隔离的临时持久化目录，并绑定到 store 的 DATA_DIR */
export function createTempStore(): TempStore {
  const dir = mkdtempSync(join(tmpdir(), "ps-test-"));
  process.env.DATA_DIR = dir;
  const dbFile = join(dir, "db.json");
  return {
    reset() {
      __resetStore();
      rmSync(dbFile, { force: true });
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
