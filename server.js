const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "##FreenimeadminDipeshONOKPastzonGames02!";

const publicDir = path.join(__dirname, "public");
const videoDir = path.join(publicDir, "videos");
const posterDir = path.join(publicDir, "posters");

fs.mkdirSync(videoDir, { recursive: true });
fs.mkdirSync(posterDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, file.fieldname === "video" ? videoDir : posterDir),
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "-" + safe);
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

app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/videos", (req, res) => {
  const videos = fs.readdirSync(videoDir)
    .filter(f => /\.(mp4|webm|ogg|mov|m4v)$/i.test(f))
    .map((filename, i) => ({
      id: i + 1,
      title: filename
        .replace(/^\d+-/, "")
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " "),
      url: "/videos/" + encodeURIComponent(filename)
    }));
  res.json(videos);
});

app.post("/api/upload", upload.fields([
  { name: "video", maxCount: 1 },
  { name: "poster", maxCount: 1 }
]), (req, res) => {
  if (req.headers["x-admin-key"] !== ADMIN_KEY)
    return res.status(401).json({ error: "Invalid admin key." });

  if (!req.files?.video?.[0])
    return res.status(400).json({ error: "No video uploaded." });

  res.json({ ok: true });
});

app.use((err, req, res, next) =>
  res.status(400).json({ error: err.message || "Upload failed." })
);

app.listen(PORT, () =>
  console.log(`freenime running at http://localhost:${PORT}`)
);
