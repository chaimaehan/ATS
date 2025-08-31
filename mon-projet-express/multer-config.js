const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Dossier uploads créé');
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Keep original extension
    const ext = path.extname(file.originalname);




    const name = path.basename(file.originalname, ext);
    const timestamp = Date.now();
    
    // Generate filename: originalname_timestamp.ext
    cb(null, `${name}_${timestamp}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  console.log(`[Multer] 📁 Fichier reçu :`, {
    originalname: file.originalname,

    mimetype: file.mimetype,
    size: file.size
  });
  
  // Check file extension
  const allowedExts = ['.pdf', '.txt', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Check MIME type (more flexible approach)
  const allowedMimes = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream' // Sometimes browsers send this for doc files
  ];
  
  if (!allowedExts.includes(ext)) {
    console.log(`[Multer] ❌ Extension non supportée : ${ext}`);
    return cb(new Error(`Extension non supportée : ${ext}. Extensions autorisées: ${allowedExts.join(', ')}`), false);
  }
  
  // More lenient MIME type checking 
  if (!allowedMimes.includes(file.mimetype) && !file.mimetype.startsWith('text/')) {
    console.log(`[Multer] ⚠️ MIME type inattendu : ${file.mimetype} (mais extension OK, on accepte)`);
    // Still accept if extension is correct (some browsers send wrong MIME types)
  }
  
  console.log(`[Multer] ✅ Fichier accepté : ${file.originalname}`);
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Only one file at a time
  }
});

// Export with error handling wrapper
module.exports = upload;