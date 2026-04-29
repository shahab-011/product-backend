const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = require('../middleware/upload.middleware');
const { protect } = require('../middleware/auth.middleware');
const {
  uploadDocument,
  uploadTextOnly,
  getDocuments,
  getDocument,
  getTextPreview,
  updateDocument,
  deleteDocument,
} = require('../controllers/document.controller');
const {
  getAnnotations,
  createAnnotation,
  deleteAnnotation,
} = require('../controllers/annotation.controller');

router.post('/upload', protect, upload.single('document'), uploadDocument);
router.post('/text-only', protect, uploadTextOnly);
router.get('/', protect, getDocuments);
router.get('/:id/text-preview', protect, getTextPreview);
router.get('/:id', protect, getDocument);
router.put('/:id', protect, updateDocument);
router.delete('/:id', protect, deleteDocument);

// Annotations — nested under each document
router.get('/:docId/annotations',          protect, getAnnotations);
router.post('/:docId/annotations',         protect, createAnnotation);
router.delete('/:docId/annotations/:aId',  protect, deleteAnnotation);

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 50MB' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err && err.message) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

module.exports = router;
