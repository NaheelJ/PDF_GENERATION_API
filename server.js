const express = require('express');
const cors = require('cors');
const path = require('path');
const generatePensionPdf = require('./pensionPdfGenerator');
const fs = require('fs');

const app = express();

// 🔐 Basic production middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// 🔹 Health check (IMPORTANT for hosting platforms)
app.get('/', (req, res) => {
  res.send('PDF API is running');
});

// 🔹 PDF generation API
app.post('/generate-pension-pdf', async (req, res) => {
  try {
    // Basic input validation
    const { memberList } = req.body || {};
    if (!Array.isArray(memberList)) {
      return res.status(400).json({ message: 'memberList must be an array' });
    }

    const pdfPath = await generatePensionPdf({ memberList });

    res.download(pdfPath, err => {
      if (err) console.error('res.download error:', err);
    });

    // ✅ Robust cleanup logic
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      fs.unlink(pdfPath, err => {
        if (err && err.code !== 'ENOENT') {
          console.warn('[Cleanup] Failed to remove temp PDF:', err.message);
        }
      });
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
  } catch (e) {
    console.error('PDF Error:', e);
    res.status(500).json({ message: 'PDF generation failed' });
  }
});

// 🔹 Use dynamic port (REQUIRED for hosting)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 PDF API running on port ${PORT}`);
});
