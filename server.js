const express = require('express');
const cors = require('cors');
const path = require('path');
const generatePensionPdf = require('./pensionPdfGenerator');

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
    const pdfPath = await generatePensionPdf(req.body);

    res.download(pdfPath, err => {
      if (err) console.error(err);
    });
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
