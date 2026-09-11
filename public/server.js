const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-key";

// Storage modes:
// - R2/S3 mode when R2_* variables are configured (recommended for Render).
// - Local mode otherwise (useful for local development only).
const R2_ENABLED = Boolean(
  process.env.R2_ENDPOINT &&
  process.env.R2_BUCKET &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_PUBLIC_URL
);

const publicDir = path.join(__dirname, "public");
const videoDir = path.join(publicDir, "videos");
const posterDir = path.join(publicDir, "posters");
const tmpDir = path.join(__dirname, "tmp");

fs.mkdirSync(videoDir, { recursive: true });
fs.mkdirSync(posterDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tmpDir),
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${crypto.randomUUID()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "video" && !file.mimetype.startsWith("video/"))
      return cb(new Error("Please upload a video file."));
    if (file.fieldname === "poster" && !file.mimetype.startsWith("image/"))
      return cb(new Error("Please upload an image file."));
    cb(null, true);
  }
});

const s3 = R2_ENABLED
  ? new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    })
  : null;

function publicObjectUrl(key) {
  return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function cleanName(name) {
  return path.basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim() || "Untitled video";
}

function keySafeName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function listR2Videos() {
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET,
    Prefix: "videos/"
  }));

  const objects = (result.Contents || [])
    .filter(o => /\.(mp4|webm|ogg|mov|m4v)$/i.test(o.Key || ""))
    .sort((a, b) => String(b.LastModified).localeCompare(String(a.LastModified)));

  return objects.map((obj, i) => {
    const filename = obj.Key.split("/").pop();
    const id = filename.split("-")[0];
    const titlePart = filename.replace(/^\d+-[0-9a-f-]+-/, "");
    const poster = (result.Contents || []).find(x => false); // kept out of this listing on purpose
    return {
      id: id || String(i + 1),
      title: cleanName(titlePart),
      url: publicObjectUrl(obj.Key),
      poster: publicObjectUrl(`posters/${filename.replace(/\.[^.]+$/, "")}.jpg`),
      storage: "r2"
    };
  });
}

async function listR2Posters() {
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET,
    Prefix: "posters/"
  }));
  return new Set((result.Contents || []).map(o => o.Key));
}

async function listVideos() {
  if (R2_ENABLED) {
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: "videos/"
    }));
    const posterKeys = await listR2Posters();
    return (result.Contents || [])
      .filter(o => /\.(mp4|webm|ogg|mov|m4v)$/i.test(o.Key || ""))
      .sort((a, b) => new Date(b.LastModified || 0) - new Date(a.LastModified || 0))
      .map((obj, i) => {
        const filename = obj.Key.split("/").pop();
        const base = filename.replace(/\.[^.]+$/, "");
        const titlePart = filename.replace(/^\d+-[0-9a-f-]+-/, "");
        const posterCandidates = [
          `posters/${base}.jpg`,
          `posters/${base}.jpeg`,
          `posters/${base}.png`,
          `posters/${base}.webp`
        ];
        const posterKey = posterCandidates.find(k => posterKeys.has(k));
        return {
          id: filename.split("-")[0] || String(i + 1),
          title: cleanName(titlePart),
          url: publicObjectUrl(obj.Key),
          poster: posterKey ? publicObjectUrl(posterKey) : null,
          storage: "r2"
        };
      });
  }

  return fs.readdirSync(videoDir)
    .filter(f => /\.(mp4|webm|ogg|mov|m4v)$/i.test(f))
    .map((filename, i) => ({
      id: String(i + 1),
      title: cleanName(filename.replace(/^\d+-/, "")),
      url: "/videos/" + encodeURIComponent(filename),
      poster: null,
      storage: "local"
    }));
}

async function uploadToR2(file, key) {
  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: fs.createReadStream(file.path),
      ContentType: file.mimetype
    },
    partSize: 16 * 1024 * 1024,
    queueSize: 3,
    leavePartsOnError: false
  });
  await uploader.done();
}

async function deleteUploadedTemp(files) {
  for (const file of files || []) {
    try { await fs.promises.unlink(file.path); } catch (_) {}
  }
}

app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/status", (req, res) => {
  res.json({
    storage: R2_ENABLED ? "r2" : "local",
    persistent: R2_ENABLED,
    message: R2_ENABLED
      ? "Cloud storage is enabled."
      : "Local storage is enabled. On Render Free, uploaded files are temporary."
  });
});

app.get("/api/videos", async (req, res, next) => {
  try {
    res.json(await listVideos());
  } catch (err) {
    next(err);
  }
});

app.post("/api/upload", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "poster", maxCount: 1 }
]), async (req, res, next) => {
  const files = [
    ...(req.files?.video || []),
    ...(req.files?.poster || [])
  ];

  try {
    if (req.headers["x-admin-key"] !== ADMIN_KEY) {
      await deleteUploadedTemp(files);
      return res.status(401).json({ error: "Invalid admin key." });
    }

    const video = req.files?.video?.[0];
    const poster = req.files?.poster?.[0];
    if (!video) {
      await deleteUploadedTemp(files);
      return res.status(400).json({ error: "No video uploaded." });
    }

    const id = Date.now();
    const videoName = `${id}-${crypto.randomUUID()}-${keySafeName(video.originalname)}`;

    if (R2_ENABLED) {
      await uploadToR2(video, `videos/${videoName}`);
      if (poster) {
        const ext = path.extname(keySafeName(poster.originalname)).toLowerCase() || ".jpg";
        await uploadToR2(poster, `posters/${videoName.replace(/\.[^.]+$/, "")}${ext}`);
      }
    } else {
      fs.copyFileSync(video.path, path.join(videoDir, videoName));
      if (poster) {
        const posterExt = path.extname(keySafeName(poster.originalname)).toLowerCase() || ".jpg";
        fs.copyFileSync(poster.path, path.join(posterDir, `${videoName.replace(/\.[^.]+$/, "")}${posterExt}`));
      }
    }

    await deleteUploadedTemp(files);

    res.json({
      ok: true,
      storage: R2_ENABLED ? "r2" : "local",
      title: cleanName(video.originalname),
      warning: R2_ENABLED ? null : "Local storage is temporary on Render Free."
    });
  } catch (err) {
    await deleteUploadedTemp(files);
    next(err);
  }
});

app.delete("/api/videos/:id", async (req, res, next) => {
  try {
    if (req.headers["x-admin-key"] !== ADMIN_KEY)
      return res.status(401).json({ error: "Invalid admin key." });

    const id = path.basename(req.params.id);
    if (R2_ENABLED) {
      const videos = await listVideos();
      const video = videos.find(v => v.id === id);
      if (!video) return res.status(404).json({ error: "Video not found." });

      const videoKey = decodeURIComponent(new URL(video.url).pathname).replace(/^\//, "");
      await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: videoKey }));

      if (video.poster) {
        const posterKey = decodeURIComponent(new URL(video.poster).pathname).replace(/^\//, "");
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: posterKey }));
      }
    } else {
      const file = fs.readdirSync(videoDir).find(name => name.startsWith(`${id}-`));
      if (!file) return res.status(404).json({ error: "Video not found." });
      fs.unlinkSync(path.join(videoDir, file));
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Request failed." });
});

app.listen(PORT, () => {
  console.log(`freenime running at http://localhost:${PORT}`);
  console.log(`Storage mode: ${R2_ENABLED ? "Cloudflare R2" : "local"}`);
});
