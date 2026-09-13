import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Keep the extension, randomise the stem — originals can collide or be hostile.
    const ext = path.extname(file.originalname).slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB is plenty for a POC
});

const router = Router();

router.post("/uploads", upload.single("file"), (req, res, next) => {
  if (!req.file) return next({ status: 400, code: "VALIDATION_ERROR", message: "No file uploaded" });
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype,
  });
});

export default router;
