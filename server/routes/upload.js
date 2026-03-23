/**
 * upload.js — 文件上传路由
 *
 * POST /api/upload
 * Body: { paths: ["/absolute/path/to/file_or_dir", ...] }
 *
 * 纯粹的"搬运"操作：把文件或文件夹复制到统一的 uploads 目录。
 * 不做任何业务判断（PDF 解析、图片识别等由 skill 层处理）。
 *
 * 存储位置：
 *   - 有工作目录时：{cwd}/.hanako-uploads/
 *   - 无工作目录时：{os.tmpdir()}/.hanako-uploads/
 *
 * 返回复制后的新路径列表，供 agent 通过 read_file / list_files 访问。
 */
import fs from "fs";
import path from "path";
import os from "os";
import { t } from "../i18n.js";

const MAX_FILES = 9;
const MAX_WEB_FILE_BYTES = 20 * 1024 * 1024;

/** 递归统计路径中的文件数量（文件夹递归计数内部文件，普通文件计 1） */
function countFiles(p) {
  try {
    const stat = fs.statSync(p);
    if (!stat.isDirectory()) return 1;
    let count = 0;
    for (const entry of fs.readdirSync(p)) {
      count += countFiles(path.join(p, entry));
    }
    return count;
  } catch {
    return 0;
  }
}

/** 清理超过 24 小时的上传临时文件 */
function cleanOldUploads(uploadsDir) {
  try {
    if (!fs.existsSync(uploadsDir)) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
      const fullPath = path.join(uploadsDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      } catch {}
    }
  } catch {}
}

export default async function uploadRoute(app, { engine }) {
  function getUploadsDir() {
    const cwd = engine.cwd;
    const isRealCwd = cwd !== process.cwd();
    const uploadsDir = isRealCwd
      ? path.join(cwd, ".hanako-uploads")
      : path.join(os.tmpdir(), ".hanako-uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });
    cleanOldUploads(uploadsDir);
    return uploadsDir;
  }

  // Web 文件上传（浏览器 File 对象经 base64 发送）
  app.post("/api/upload-web", async (req, reply) => {
    const files = req.body?.files;
    if (!Array.isArray(files) || files.length === 0) {
      return reply.code(400).send({ error: t("error.pathsRequired") });
    }
    if (files.length > MAX_FILES) {
      return reply.code(400).send({ error: t("error.tooManyFiles", { max: MAX_FILES, n: files.length }) });
    }

    const uploadsDir = getUploadsDir();
    const results = [];

    for (const f of files) {
      try {
        const name = String(f?.name || "upload.bin");
        const base64 = String(f?.contentBase64 || "");
        if (!base64) {
          results.push({ src: name, error: "missing contentBase64" });
          continue;
        }
        const buf = Buffer.from(base64, "base64");
        if (buf.byteLength > MAX_WEB_FILE_BYTES) {
          results.push({ src: name, error: `file too large (> ${MAX_WEB_FILE_BYTES} bytes)` });
          continue;
        }
        const ext = path.extname(name);
        const base = path.basename(name, ext);
        const timestamp = Date.now().toString(36);
        const safeName = `${base}_${timestamp}${ext}`;
        const destPath = path.join(uploadsDir, safeName);
        fs.writeFileSync(destPath, buf);
        results.push({ src: name, dest: destPath, name, isDirectory: false });
      } catch (err) {
        results.push({ src: f?.name || "unknown", error: err.message });
      }
    }

    return { uploads: results, uploadsDir };
  });

  app.post("/api/upload", async (req, reply) => {
    const { paths } = req.body || {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return reply.code(400).send({ error: t("error.pathsRequired") });
    }

    // 统计总文件数（文件夹递归计数）
    let totalFiles = 0;
    for (const p of paths) {
      totalFiles += countFiles(p);
    }
    if (totalFiles > MAX_FILES) {
      return reply.code(400).send({
        error: t("error.tooManyFiles", { max: MAX_FILES, n: totalFiles }),
        totalFiles,
        max: MAX_FILES,
      });
    }

    // 确定 uploads 目录
    const uploadsDir = getUploadsDir();

    const results = [];

    for (const srcPath of paths) {
      try {
        if (!path.isAbsolute(srcPath)) {
          results.push({ src: srcPath, error: "Path must be absolute" });
          continue;
        }
        if (!fs.existsSync(srcPath)) {
          results.push({ src: srcPath, error: t("error.pathNotFound") });
          continue;
        }

        const stat = fs.statSync(srcPath);
        const name = path.basename(srcPath);
        const timestamp = Date.now().toString(36);
        const isDir = stat.isDirectory();

        // 统一命名：原名_时间戳（文件保留扩展名）
        const ext = isDir ? "" : path.extname(srcPath);
        const base = isDir ? name : path.basename(srcPath, ext);
        const destName = `${base}_${timestamp}${ext}`;
        const destPath = path.join(uploadsDir, destName);

        if (isDir) {
          // 递归复制整个目录
          fs.cpSync(srcPath, destPath, { recursive: true });
        } else {
          fs.copyFileSync(srcPath, destPath);
        }

        results.push({
          src: srcPath,
          dest: destPath,
          name,
          isDirectory: isDir,
        });
      } catch (err) {
        results.push({ src: srcPath, error: err.message });
      }
    }

    return { uploads: results, uploadsDir };
  });
}
