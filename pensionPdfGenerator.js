const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function generatePensionPdf({
  memberList = [],
  tabType = 0,
  searchQuery = '',
  pensionFilter = '',
}) {
  return new Promise((resolve, reject) => {
    try {
      // ✅ Use OS temp directory (cloud-safe)
      const outputPath = path.join(
        os.tmpdir(),
        `Pension_List_${Date.now()}.pdf`
      );

      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        autoFirstPage: true,
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // ✅ Malayalam-safe font (disable buggy features)
      const fontPath = path.join(
        process.cwd(),
        'assets/fonts/NotoSansMalayalam-Regular.ttf'
      );

      if (!fs.existsSync(fontPath)) {
        throw new Error('Malayalam font not found');
      }

      doc.font(fontPath, { features: [] });

      // ✅ Watermark (optional)
      const watermarkPath = path.join(
        process.cwd(),
        'assets/images/positron_logo.png'
      );

      const rowsPerPage = 28;
      let rowCount = 0;

      function drawWatermark() {
        if (fs.existsSync(watermarkPath)) {
          doc
            .save()
            .opacity(0.08)
            .image(watermarkPath, 150, 250, { width: 300 })
            .restore();
        }
      }

      function drawHeader() {
        drawWatermark();

        doc
          .fontSize(16)
          .text(getHeading(tabType), { align: 'center' })
          .moveDown(1);

        drawRow(doc, [
          'Sl No',
          'Name / പേര്',
          'House',
          'Age',
          'Phone',
          'Pension',
          'Status',
        ], true);
      }

      drawHeader();

      memberList.forEach((m, index) => {
        if (rowCount >= rowsPerPage) {
          doc.addPage();
          rowCount = 0;
          drawHeader();
        }

        drawRow(doc, [
          index + 1,
          m.nameEnglish || m.nameMalayalam || '',
          m.houseNameEnglish || m.houseNameMalayalam || '',
          m.age || '',
          m.phoneNumber || m.whatsappNumber || '',
          m.pensionType || '',
          getStatus(tabType),
        ]);

        rowCount++;
      });

      doc.end();

      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// 🔹 Table row
function drawRow(doc, row, isHeader = false) {
  const widths = [40, 130, 110, 40, 90, 90, 70];
  let x = doc.page.margins.left;
  const y = doc.y;

  row.forEach((text, i) => {
    doc
      .fontSize(isHeader ? 9 : 8)
      .text(String(text), x, y, {
        width: widths[i],
        align: 'left',
      });
    x += widths[i];
  });

  doc.moveDown(0.8);
}

// 🔹 Heading
function getHeading(tabType) {
  switch (tabType) {
    case 0:
      return 'Pension – Eligible List / യോഗ്യരുടെ പട്ടിക';
    case 1:
      return 'Pension – Informed List / അറിയിച്ചവർ';
    case 2:
      return 'Pension – Claimed List / ലഭിച്ചവർ';
    default:
      return 'Pension List';
  }
}

// 🔹 Status text
function getStatus(tabType) {
  if (tabType === 2) return 'Claimed';
  if (tabType === 1) return 'Informed';
  return 'Eligible';
}

module.exports = generatePensionPdf;
