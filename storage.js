const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

/**
 * Save uploaded file buffer to object storage
 */
function savePhotoFile({ fileBuffer, originalName, mimeType }) {
  const photoId = 'photo_' + crypto.randomBytes(12).toString('hex');
  const ext = path.extname(originalName) || getExtFromMime(mimeType) || '.jpg';
  const sanitizedOriginalName = path.basename(originalName).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const storedFilename = `${photoId}${ext}`;
  const targetPath = path.join(UPLOAD_DIR, storedFilename);

  fs.writeFileSync(targetPath, fileBuffer);

  return {
    photoId,
    filename: storedFilename,
    originalName: sanitizedOriginalName,
    storageLocation: targetPath,
    fileSize: fileBuffer.length,
    mimeType: mimeType || 'image/jpeg'
  };
}

/**
 * Helper to get extension from mime type
 */
function getExtFromMime(mimeType) {
  switch (mimeType) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/svg+xml': return '.svg';
    default: return '.jpg';
  }
}

/**
 * Retrieve file stream or path from storage
 */
function getPhotoFilePath(storedFilename) {
  const fullPath = path.join(UPLOAD_DIR, path.basename(storedFilename));
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  return null;
}

/**
 * Delete photo from storage
 */
function deletePhotoFile(storedFilename) {
  const fullPath = path.join(UPLOAD_DIR, path.basename(storedFilename));
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

module.exports = {
  UPLOAD_DIR,
  ALLOWED_MIME_TYPES,
  savePhotoFile,
  getPhotoFilePath,
  deletePhotoFile
};
