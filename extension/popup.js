const qs = (id) => document.getElementById(id);

const ICONS = {
  moon: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  sun: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 18a6 6 0 1 0 0-12a6 6 0 0 0 0 12Z" stroke="currentColor" stroke-width="2"/>
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"
            stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  ok: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  err: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 9v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M10.3 4.3 2.6 18.1A2 2 0 0 0 4.3 21h15.4a2 2 0 0 0 1.7-2.9L13.7 4.3a2 2 0 0 0-3.4 0Z"
            stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>`,
  info: `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16v-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0Z" stroke="currentColor" stroke-width="2"/>
    </svg>`
};

async function getActiveTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url || "";
}

async function getConfig() {
  const { apiBaseUrl, apiKey, theme } = await chrome.storage.sync.get(["apiBaseUrl", "apiKey", "theme"]);
  return {
    apiBaseUrl: (apiBaseUrl || "").trim(),
    apiKey: (apiKey || "").trim(),
    theme: (theme || "dark").trim()
  };
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
  const app = qs("app");
  const t = (theme === "light") ? "light" : "dark";
  app.setAttribute("data-theme", t);

  const btn = qs("themeToggle");
  btn.innerHTML = (t === "dark") ? ICONS.sun : ICONS.moon;
  btn.title = (t === "dark") ? "Switch to light" : "Switch to dark";
}

async function toggleTheme() {
  const { theme } = await getConfig();
  const next = (theme === "light") ? "dark" : "light";
  await chrome.storage.sync.set({ theme: next });
  applyTheme(next);
  toast(`Theme: ${next}`, "info");
}

/* ---------- Status + Log + Polling ---------- */
let activePoll = null;

function appendLogsToTextarea(lines) {
  if (!lines || lines.length === 0) return;
  const logEl = qs("log");
  const prev = logEl.value || "";
  const add = lines.join("\n") + "\n";

  logEl.value = prev + add;
  logEl.scrollTop = logEl.scrollHeight;
}

async function pollJobUntilDone(jobId, { onProgress } = {}) {
  let since = 0;

  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const data = await apiFetch(`/api/downloads/${jobId}?since=${since}`, { method: "GET" });

        if (data?.logs?.length) {
          appendLogsToTextarea(data.logs);
          since = data.nextSince ?? (since + data.logs.length);
        }

        const job = data?.job;
        if (onProgress) onProgress(job);

        if (!job) throw new Error("Invalid job response");

        if (job.status === "done") return finish(true, job);
        if (job.status === "error") return finish(false, job);

        // continue
        activePoll = setTimeout(tick, 1000);
      } catch (e) {
        return finish(false, { error: e?.message || "Polling error" }, e);
      }
    };

    const finish = (ok, job, err) => {
      if (activePoll) clearTimeout(activePoll);
      activePoll = null;
      ok ? resolve(job) : reject(err || new Error(job?.error || "Job failed"));
    };

    tick();
  });
}

function setDownloadingUI(isDownloading) {
  const btn = qs("downloadBtn");
  const icon = qs("downloadIcon");
  const sp = qs("downloadSpinner");
  const txt = qs("downloadText");

  btn.disabled = !!isDownloading;
  icon.style.display = isDownloading ? "none" : "inline-flex";
  sp.style.display = isDownloading ? "inline-flex" : "none";
  txt.textContent = isDownloading ? "Downloading…" : "Download audio";
}

function setStatus(text, kind = "") {
  const el = qs("status");
  el.className = `status ${kind}`.trim();
  el.textContent = text || "";
}

function setLog(text) {
  qs("log").value = text || "";
}

/* ---------- Toasts ---------- */
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message, type = "info", timeoutMs = 2400) {
  const host = qs("toasts");
  if (!host) return;

  const el = document.createElement("div");
  el.className = `toast ${type}`;

  const icon = (type === "ok") ? ICONS.ok : (type === "err") ? ICONS.err : ICONS.info;

  el.innerHTML = `
    <div class="ico">${icon}</div>
    <div class="txt">${escapeHtml(message)}</div>
    <button class="close" aria-label="Close toast" title="Close">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  `;

  el.querySelector(".close").addEventListener("click", () => el.remove());
  host.appendChild(el);

  if (timeoutMs > 0) setTimeout(() => el.remove(), timeoutMs);
}

/* ---------- API ---------- */
async function apiFetch(path, opts = {}) {
  const { apiBaseUrl, apiKey } = await getConfig();
  if (!apiBaseUrl || !apiKey) throw new Error("Missing config: open Settings and set API Base URL + API Key.");

  const url = apiBaseUrl.replace(/\/+$/, "") + path;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }

  if (!res.ok) {
    const msg = json?.error ? json.error : text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json ?? text;
}

/* ---------- UI actions ---------- */
const FOLDERS_CACHE_KEY = "foldersCache";
const FOLDERS_CACHE_AT_KEY = "foldersCacheAt";
const FOLDERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function getFoldersCache() {
  const obj = await chrome.storage.local.get([FOLDERS_CACHE_KEY, FOLDERS_CACHE_AT_KEY]);
  const folders = obj[FOLDERS_CACHE_KEY];
  const at = obj[FOLDERS_CACHE_AT_KEY];

  if (!Array.isArray(folders) || typeof at !== "number") return null;
  if (Date.now() - at > FOLDERS_CACHE_TTL_MS) return null;

  return folders;
}

async function setFoldersCache(folders) {
  await chrome.storage.local.set({
    [FOLDERS_CACHE_KEY]: folders,
    [FOLDERS_CACHE_AT_KEY]: Date.now()
  });
}

function renderFoldersSelect(folders) {
  const sel = qs("folderSelect");
  const prev = sel.value;

  sel.innerHTML = "";
  (folders || []).forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  });

  // Keep previous selection if still exists
  if (prev && folders.includes(prev)) sel.value = prev;
}

async function refreshFoldersFromApi({ showToast = true } = {}) {
  setStatus("Loading folders...");
  setLog("");
  if (showToast) toast("Refreshing folders…", "info", 1200);

  const folders = await apiFetch("/api/music/folders", { method: "GET" });

  renderFoldersSelect(folders);
  await setFoldersCache(folders);

  setStatus(`Folders found: ${folders.length}`, "ok");
  if (showToast) toast(`Folders loaded (${folders.length})`, "ok");
  return folders;
}

async function loadFolders() {
  // 1) try cache first (no API call)
  const cached = await getFoldersCache();
  if (cached) {
    renderFoldersSelect(cached);
    setStatus(`Folders cached: ${cached.length}`, "ok");
    return cached;
  }

  // 2) first time (or expired) -> call API
  return refreshFoldersFromApi({ showToast: false });
}

async function doDownload() {
  const youtubeUrl = qs("youtubeUrl").value.trim();
  const newFolder = qs("newFolder").value.trim();
  const folderSelect = qs("folderSelect").value;

  const isNewFolder = !!newFolder;
  const folder = newFolder || folderSelect;

  if (!youtubeUrl) throw new Error("Please provide a YouTube URL.");
  if (!folder) throw new Error("Select an existing folder or type a new one.");

  // UI lock
  setDownloadingUI(true);
  setStatus("Job created…");
  setLog("");
  toast("Job started…", "info");

  // Create job
  const start = await apiFetch("/api/youtube/download", {
    method: "POST",
    body: JSON.stringify({ youtubeUrl, folder })
  });

  const jobId = start?.jobId;
  if (!jobId) throw new Error("Missing jobId from server");

  toast(`Job ID: ${jobId}`, "info", 1500);

  // Poll job + live logs
  try {
    const finalJob = await pollJobUntilDone(jobId, {
      onProgress: (job) => {
        if (!job) return;
        if (job.status === "running") setStatus("Downloading…");
      }
    });

    setStatus("Done ✅", "ok");
    toast("Download completed ✅", "ok");

    // Refresh folders ONLY if user created a new one
    if (isNewFolder) {
      qs("newFolder").value = "";
      await refreshFoldersFromApi({ showToast: true });
      qs("folderSelect").value = folder;
    }

    return finalJob;
  } catch (e) {
    setStatus(e?.message || "Download failed", "err");
    toast(e?.message || "Download failed", "err", 3200);
    throw e;
  } finally {
    setDownloadingUI(false);
  }
}

/* ---------- Init ---------- */
(async function init() {
  // Theme init
  const cfg = await getConfig();
  applyTheme(cfg.theme);

  qs("themeToggle").addEventListener("click", () => toggleTheme().catch(() => {}));
  qs("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  qs("refreshFolders").addEventListener("click", () => refreshFoldersFromApi({ showToast: true }).catch(e => {
    setStatus(e.message, "err");
    toast(e.message, "err", 3000);
  }));
  qs("downloadBtn").addEventListener("click", () => doDownload().catch(e => {
    setStatus(e.message, "err");
    toast(e.message, "err", 3200);
  }));

  const url = await getActiveTabUrl();
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    qs("youtubeUrl").value = url;
  }

  try {
    await loadFolders();
  } catch (e) {
    setStatus(e.message, "err");
    toast(e.message, "err", 3200);
  }
})();

window.addEventListener("unload", () => {
  if (activePoll) clearTimeout(activePoll);
});

/*
 * MIT License
 * Copyright (c) 2026 Antonio Viola
 */