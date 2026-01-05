const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function generatePensionPdf({
  memberList = [],
}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const MAX_MEMBERS = 10000;

    try {
      if (!Array.isArray(memberList)) {
        throw new Error('memberList must be an array');
      }

      // GCP Logging - Verify incoming data
      console.log(`[GCP PDF] Generating PDF. Members received: ${memberList.length}`);
      if (memberList.length > 0) {
        console.log(`[GCP PDF] Data Sample (Index 0):`, JSON.stringify({
          name: memberList[0].nameEnglish || memberList[0].nameMalayalam,
          house: memberList[0].houseNameEnglish || memberList[0].houseNameMalayalam,
          keys: Object.keys(memberList[0])
        }));
      }

      if (memberList.length > MAX_MEMBERS) {
        console.warn(`[GCP PDF] Truncating ${memberList.length} down to ${MAX_MEMBERS}`);
        memberList = memberList.slice(0, MAX_MEMBERS);
      }
      // ✅ Use OS temp directory (cloud-safe)
      const outputPath = path.join(
        os.tmpdir(),
        `Pension_List_${Date.now()}.pdf`
      );

      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        autoFirstPage: true,
        bufferPages: true // Necessary for page numbering
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      function safeResolve(p) {
        if (!settled) {
          // Add page numbers and footers before ending
          const range = doc.bufferedPageRange();
          const timestamp = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
          }).replace(/\//g, '-');

          for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);

            // Footer Line - Subtle
            const footerY = doc.page.height - 40;
            doc.save()
              .moveTo(doc.page.margins.left, footerY)
              .lineTo(doc.page.width - doc.page.margins.right, footerY)
              .lineWidth(0.5)
              .stroke('#999999')
              .restore();

            // Footer Text - Professional Muted Gray
            doc.fillColor('#6c757d').fontSize(7);
            doc.text(`Generated: ${timestamp}`, doc.page.margins.left, footerY + 5);
            doc.text(`Page ${i + 1} / ${range.count}`, doc.page.width - doc.page.margins.right - 50, footerY + 5, { align: 'right', width: 50 });
          }
          settled = true;
          resolve(p);
        }
      }

      function safeReject(err) {
        if (!settled) {
          settled = true;
          // attempt to cleanup partial file
          try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) { }
          reject(err);
        }
      }

      // ✅ Robust Font Resolution
      let fontPath = path.join(process.cwd(), 'assets/fonts/Manjari-Bold.otf');

      const hasFont = fs.existsSync(fontPath);
      if (!hasFont) {
        console.warn(`[GCP PDF] Primary font Manjari-Bold.otf not found at ${fontPath}! Using Helvetica fallback.`);
      }

      // ✅ Watermark settings
      const watermarkPath = path.join(process.cwd(), 'assets/images/positron_logo.png');

      function drawWatermark() {
        if (fs.existsSync(watermarkPath)) {
          const imgWidth = 400; // Larger for better visibility
          const x = (doc.page.width - imgWidth) / 2;
          // Centering vertically: (PageHeight - ImageHeightApproximation) / 2
          // Using a more standard 1:3/1:4 aspect ratio for logos usually works well with 150-200 height
          const y = (doc.page.height - 200) / 2;
          doc.save().opacity(0.04).image(watermarkPath, x, y, { width: imgWidth }).restore();
        }
      }

      const widths = [35, 155, 145, 35, 85, 80]; // Optimized widths
      const rowHeight = 23; // Slightly reduced to fit 30 rows
      const rowsPerPage = 30; // Exactly 30 members per page
      let rowCount = 0;

      const englishFontPath = path.join(process.cwd(), 'assets/fonts/Roboto-Regular.ttf');

      // Helper to render text safely
      // Some Malayalam sequences cause fontkit to crash with "xCoordinate of null"
      // We temporarily mute the global error listener to handle it locally.
      function renderTextSafe(text, x, y, options) {
        const str = String(text || '');
        if (!str.trim()) return;

        const charArray = Array.from(str);
        let startX = x + (options.leftOffset || 2);
        let currentSegment = "";
        let isCurrentMal = /[\u0D00-\u0D7F]/.test(charArray[0]);

        const flush = (segment, isMal) => {
          if (!segment) return;

          if (isMal) {
            doc.font(fontPath);
          } else {
            // Use custom English font if it exists, otherwise fallback to Helvetica
            doc.font(fs.existsSync(englishFontPath) ? englishFontPath : 'Helvetica');
          }
          const fontSize = options.fontSize || doc._fontSize || 8;
          doc.fontSize(fontSize);

          const quietError = (err) => {
            if (!err.message.includes('xCoordinate')) console.warn(`[Shaping Warning]:`, err.message);
          };

          doc.removeListener('error', safeReject);
          doc.on('error', quietError);

          try {
            doc.text(segment, startX, y + (options.topOffset || 5), {
              ...options,
              features: isMal ? ['kern', 'liga', 'clig'] : [],
              lineBreak: false,
              width: undefined // Calculate manually to avoid wrap
            });
            startX += doc.widthOfString(segment);
          } catch (err) {
            try {
              // Fallback to simple rendering without complex features
              doc.text(segment, startX, y + (options.topOffset || 5), { ...options, features: false, lineBreak: false });
              startX += doc.widthOfString(segment, { features: false });
            } catch (f) {
              // Last resort: if even simple rendering fails, just estimate width to prevent overlapping
              startX += (segment.length * (options.fontSize || 8) * 0.5);
            }
          } finally {
            doc.removeListener('error', quietError);
            doc.on('error', safeReject);
          }
          doc.fillColor('#333333'); // Reset to professional text color
        };

        for (const char of charArray) {
          const isMal = /[\u0D00-\u0D7F]/.test(char);
          if (isMal === isCurrentMal) {
            currentSegment += char;
          } else {
            flush(currentSegment, isCurrentMal);
            currentSegment = char;
            isCurrentMal = isMal;
          }
        }
        flush(currentSegment, isCurrentMal);
      }

      function drawHeader() {
        drawWatermark();

        // Title - Left aligned as per design
        const heading = 'Pension List / പെൻഷൻ പട്ടിക';
        doc.font(fontPath).fontSize(14).fillColor('#000000');
        renderTextSafe(heading, doc.page.margins.left, doc.y, {
          align: 'left',
          width: doc.page.width - 60,
          fontSize: 14,
          topOffset: 0,
          leftOffset: 0
        });
        doc.y += 25; // 15pt to clear the heading text + 10pt gap before the table

        const startX = doc.page.margins.left;
        const startY = doc.y;

        // Header Background - Professional Soft Gray
        doc.save()
          .rect(startX, startY, widths.reduce((a, b) => a + b, 0), rowHeight)
          .fill('#f8f9fa');

        doc.fillColor('#1a1a1a'); // Darker for headers
        const headers = ['Sl No', 'Name / പേര്', 'House', 'Age', 'Phone', 'Pension'];

        let currentX = startX;
        headers.forEach((h, i) => {
          // Header box - Subtle borders
          doc.save()
            .rect(currentX, startY, widths[i], rowHeight)
            .lineWidth(0.5)
            .stroke('#999999')
            .restore();

          renderTextSafe(h, currentX, startY, {
            width: widths[i],
            align: 'center', // Headers are usually centered in this design
            fontSize: 8,
            topOffset: 7
          });
          currentX += widths[i];
        });

        doc.y = startY + rowHeight;
      }

      drawHeader();

      memberList.forEach((m, index) => {
        console.log(`[GCP PDF] Processing Row ${index + 1}:`, JSON.stringify(m));
        if (rowCount >= rowsPerPage) {
          doc.addPage();
          rowCount = 0;
          drawHeader();
        }

        const currentY = doc.y;
        const startX = doc.page.margins.left;

        doc.fillColor('#333333');

        // 🔹 Draw Row Logic
        const data = [
          index + 1,
          m.NAME_ENGLISH || m.NAME_MALAYALAM || '',
          m.HOUSE_NAME_ENGLISH || m.HOUSE_NAME_MALAYALAM || '',
          m.AGE || '',
          m.PHONE_NUMBER || m.WHATSAPP_NUMBER || '',
          m.PENSION_TYPE || '',
        ];

        let currentX = startX;
        data.forEach((val, i) => {
          // Alignment logic per column for better UX
          let align = 'left';
          if (i === 0 || i === 3) align = 'center'; // Center Sl No and Age

          renderTextSafe(val, currentX, currentY, {
            width: widths[i],
            align: align,
            fontSize: 8.5, // Slightly larger body text
            topOffset: 8 // Centered vertically in 25px row
          });

          // Professional Medium Border
          doc.save().lineWidth(0.4).rect(currentX, currentY, widths[i], rowHeight).stroke('#999999').restore();
          currentX += widths[i];
        });

        doc.y = currentY + rowHeight;
        rowCount++;
      });

      doc.on('error', safeReject);
      stream.on('error', safeReject);
      stream.on('finish', () => safeResolve(outputPath));
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// 🔹 Removed old drawRow function as it's now inline for better safety scoping

module.exports = generatePensionPdf;
