import {
  freshSave,
  repairSave,
  STORAGE_KEY,
  type Save,
} from "./simulation/game";

export const BACKUP_KEY = `${STORAGE_KEY}-backup`;

/**
 * Read the browser save. A save that cannot be repaired is copied to
 * BACKUP_KEY before a fresh one replaces it, so the next autosave never
 * destroys the only copy of the player's progress.
 */
export function loadSave(): { save: Save; warning: string } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    return {
      save: raw ? repairSave(JSON.parse(raw)) : freshSave(),
      warning: "",
    };
  } catch {
    let kept = false;
    try {
      if (raw) {
        localStorage.setItem(BACKUP_KEY, raw);
        kept = true;
      }
    } catch {}
    return {
      save: freshSave(),
      warning: kept
        ? "存档未能读取，原始数据已备份。可在设置中下载备份文件。"
        : "存档未能读取。你可以在设置中导入之前导出的存档。",
    };
  }
}

export function storeSave(save: Save) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function readBackup() {
  try {
    return localStorage.getItem(BACKUP_KEY);
  } catch {
    return null;
  }
}

/** Follow saves written by another tab instead of overwriting them. */
export function onExternalSave(listener: (save: Save) => void) {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      listener(repairSave(JSON.parse(e.newValue)));
    } catch {}
  });
}
