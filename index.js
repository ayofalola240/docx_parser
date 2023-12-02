const express = require('express');
const docx = require('./docxF.js');
const path = require('path');
const multer = require('multer');
const convertapi = require('convertapi')('FGFS66xMlHGc0A1F');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.json());

const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  cb(null, true);
};
const upload = multer({ storage: storage, fileFilter: fileFilter });

app.post('/extract-docx', async (req, res) => {
  try {
    const filePath = path.join(__dirname, './', 'data', 'english.docx');
    const result = await docx.extractTXT(filePath);
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/process-json', async (req, res) => {
  try {
    const filePath = path.join(__dirname, './', 'data', 'english.txt');
    const result = await docx.extractStringifyTXT(filePath);

    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/process-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }

    const fileName = req.file.originalname;
    const fileExtension = path.extname(fileName);

    if (fileExtension.toLowerCase() !== '.docx') {
      // If the file is not a .docx, upload it to the "bin" folder
      const binFolderPath = path.join(__dirname, 'data/bin');
      const binFilePath = path.join(binFolderPath, fileName);

      fs.writeFileSync(binFilePath, req.file.buffer);

      return res.json({ success: false, message: 'Invalid file format. Uploaded to bin folder.' });
    }

    const baseFileName = path.basename(fileName, fileExtension);
    const outputPath = path.join(__dirname, 'data/output', `${baseFileName}.html`);
    const inputPath = path.join(__dirname, 'data/input', `${baseFileName}.docx`);

    // Write the buffer to the input path
    const writeStream = fs.createWriteStream(inputPath);
    writeStream.write(req.file.buffer);
    writeStream.end();

    const convertToDocx = async (inputPath, outputPath) => {
      try {
        const result = await convertapi.convert('html', { File: inputPath }, 'docx');
        await result.saveFiles(outputPath);
        console.log('Conversion completed successfully');
      } catch (error) {
        console.error('Conversion failed:', error);
      }
    };

    // Uncomment the line below to perform the conversion
    // await convertToDocx(inputPath, outputPath);

    const result = await docx.extractJSON(outputPath, baseFileName);

    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
