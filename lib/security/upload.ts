import "server-only";
import sharp from "sharp";
import { saveIconPng } from "@/lib/icons";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

// Accepted input formats, verified by magic bytes (not by the client-sent MIME).
function sniffFormat(buf: Buffer): "png" | "jpeg" | "webp" | "gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && // RIFF
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 // WEBP
  )
    return "webp";
  return null;
}

export type UploadResult =
  | { ok: true; filename: string }
  | { ok: false; error: string };

/**
 * Validate and process an admin-uploaded icon:
 *  - size cap
 *  - magic-byte allowlist (PNG/JPEG/WebP/GIF); SVG is rejected (script risk)
 *  - re-encode with sharp to a small PNG, which strips any embedded payload
 *    or metadata (defence against polyglot / malicious files)
 */
export async function processIconUpload(file: File): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: "No file provided." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Image must be 2 MB or smaller." };

  const buf = Buffer.from(await file.arrayBuffer());
  const format = sniffFormat(buf);
  if (!format) {
    return { ok: false, error: "Unsupported image type. Use PNG, JPEG, WebP or GIF." };
  }

  try {
    const png = await sharp(buf, { animated: false })
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const filename = await saveIconPng(png);
    return { ok: true, filename };
  } catch {
    return { ok: false, error: "Could not process that image." };
  }
}
