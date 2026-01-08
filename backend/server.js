import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const app = express();

const PORT = parseInt(process.env.PORT || "8787", 10);
const API_KEY = process.env.API_KEY || "";
const MUSIC_ROOT = process.env.MUSIC_ROOT || "/mnt/media/music";
const YTDLP_CONTAINER = process.env.YTDLP_CONTAINER || "yt-dlp-music";
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

// Check required api key
if (!API_KEY) {
  console.error("Missing API_KEY in env");
  process.exit(1);
}

app.use(helmet());
app.use(express.json({ limit: "256kb" }));

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CORS_ORIGINS.length === 0) return cb(null, true);
    const ok = CORS_ORIGINS.some(rule => {
      if (rule.endsWith("*")) return origin.startsWith(rule.slice(0, -1));
      return origin === rule;
    });
    cb(ok ? null : new Error("CORS blocked"), ok);
  }
}));

// Rate limit (anti spam)
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.RATE_LIMIT_REQUESTS, 10) || 15,
  standardHeaders: true,
  legacyHeaders: false
}));

// Auth middleware
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token || token !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// --- Utils
function isValidYouTubeUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const okHost = ["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host);
    if (!okHost) return false;

    if (host === "youtu.be") return u.pathname.length > 1;
    if (u.pathname === "/watch") return !!u.searchParams.get("v");
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/").filter(Boolean).length >= 2;
    return false;
  } catch {
    return false;
  }
}

// Folder name sanitizer
function sanitizeFolderName(name) {
  const raw = (name || "").trim();
  if (!raw) return "";

  if (raw.includes("..") || raw.includes("/") || raw.includes("\\"))
    return "";

  // Remove bad chars for filesystem and shell
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Length limit
  return cleaned.slice(0, 40);
}

function ensureInsideRoot(targetPath) {
  const resolvedRoot = path.resolve(MUSIC_ROOT);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedRoot + path.sep) || resolvedTarget === resolvedRoot;
}

function listDirs(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, "it"));
}

function runDockerExecYtDlp({ youtubeUrl, folder }) {
  return new Promise((resolve, reject) => {
    const outputTpl = `/music/${folder}/%(artist,uploader)s - %(title)s.%(ext)s`;

    const args = [
      "exec",
      "-i",
      YTDLP_CONTAINER,
      "yt-dlp",
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "0",
      "--embed-metadata",
      "--embed-thumbnail",
      "--no-playlist",
      "--restrict-filenames",
      "-o", outputTpl,
      youtubeUrl
    ];

    const p = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    p.stdout.on("data", (d) => { stdout += d.toString(); });
    p.stderr.on("data", (d) => { stderr += d.toString(); });

    p.on("error", reject);

    p.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`yt-dlp failed (code ${code})\n${stderr || stdout}`));
    });
  });
}

// Health check api
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Get music folders
app.get("/api/music/folders", auth, (req, res) => {
  try {
    if (!fs.existsSync(MUSIC_ROOT)) return res.status(500).json({ error: "MUSIC_ROOT missing" });
    const dirs = listDirs(MUSIC_ROOT);
    res.json(dirs);
  } catch (e) {
    res.status(500).json({ error: "Failed to list folders" });
  }
});

// Download youtube audio api
app.post("/api/youtube/download", auth, async (req, res) => {
  const youtubeUrl = (req.body?.youtubeUrl || "").trim();
  const folderIn = (req.body?.folder || "").trim();
  const folder = sanitizeFolderName(folderIn);

  if (!youtubeUrl || !isValidYouTubeUrl(youtubeUrl)) {
    return res.status(400).json({ error: "Invalid youtubeUrl" });
  }
  if (!folder) {
    return res.status(400).json({ error: "Invalid folder" });
  }

  const targetDir = path.join(MUSIC_ROOT, folder);
  if (!ensureInsideRoot(targetDir)) {
    return res.status(400).json({ error: "Folder outside root" });
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });

    // timeout “soft” per evitare richieste infinite
    const TIMEOUT_MS = 15 * 60 * 1000;

    const result = await Promise.race([
      runDockerExecYtDlp({ youtubeUrl, folder }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), TIMEOUT_MS))
    ]);

    return res.json({
      ok: true,
      folder,
      targetDir,
      // Log
      logTail: (result.stdout + "\n" + result.stderr).split("\n").slice(-25).join("\n")
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "Download failed"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on :${PORT}`);
  console.log(`MUSIC_ROOT=${MUSIC_ROOT}`);
  console.log(`YTDLP_CONTAINER=${YTDLP_CONTAINER}`);
});
