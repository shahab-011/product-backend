const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const extractTextFromImage = async (buffer, mimetype) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const base64 = buffer.toString('base64');
  const imagePart = { inlineData: { data: base64, mimeType: mimetype } };

  const result = await model.generateContent([
    'Extract all text from this legal document image. Return only raw text.',
    imagePart,
  ]);

  return { text: result.response.text(), pages: 1 };
};

const extractText = async (buffer, originalname, mimetype) => {
  const ext = path.extname(originalname).toLowerCase();

  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    return { text: data.text, pages: data.numpages };
  }

  if (['.docx', '.doc'].includes(ext)) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, pages: 1 };
  }

  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return extractTextFromImage(buffer, mimetype);
  }

  throw new Error(`Unsupported file type: ${ext}`);
};

module.exports = { extractText };
