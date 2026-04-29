const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const parseGeminiJSON = (rawText) => {
  try {
    const raw = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse Gemini JSON:', rawText);
    return {
      summary: "Analysis failed to produce secure output.",
      clauses: [],
      risks: [{ title: 'Parse Error', description: 'AI output was malformed.', severity: 'high', clause: 'N/A' }],
      healthScore: 0
    };
  }
};

const analyzeDocument = async (text, docType) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", generationConfig: { responseMimeType: "application/json" } });
  
  const prompt = `
  You are an expert legal AI. Analyze the following ${docType} document.
  Extract the key clauses, identify risks, provide a summary, and give a health score out of 100.
  
  Return ONLY valid JSON. No markdown. No explanation. No backticks.
  Start your response with { and end with }.
  
  Format must be exactly:
  {
    "summary": "Overall plain english summary...",
    "clauses": [
      { "type": "string", "originalText": "string", "plainEnglish": "string", "riskLevel": "low|medium|high", "confidence": number }
    ],
    "risks": [
      { "title": "string", "description": "string", "severity": "low|medium|high", "clause": "string" }
    ],
    "healthScore": number
  }

  Document Text:
  ${text.substring(0, 30000)} // truncate to prevent payload crash just in case
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return parseGeminiJSON(response.text());
};

const askQuestion = async (question, documentText) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const prompt = `
  You are a legal assistant chatting with a user about a specific legal document.
  Use the document content below to answer their question accurately.
  If the answer is not in the document, say so.
  
  Document Content:
  ${documentText.substring(0, 30000)}...
  
  Question: ${question}
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
};

const compareDocuments = async (text1, text2) => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", generationConfig: { responseMimeType: "application/json" } });
  
  const prompt = `
  Compare these two versions of a legal document. Identify what was added, removed, or modified.
  
  Return ONLY valid JSON. No markdown. No explanation.
  {
    "summary": "Overview of differences",
    "additions": ["string"],
    "removals": ["string"],
    "modifications": [{ "clause": "string", "before": "string", "after": "string", "impact": "string" }],
    "riskChange": "improved|worsened|neutral",
    "recommendation": "string"
  }
  
  Version A (Original): ${text1.substring(0, 15000)}
  
  Version B (New): ${text2.substring(0, 15000)}
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return parseGeminiJSON(response.text());
};

module.exports = {
  analyzeDocument,
  askQuestion,
  compareDocuments
};
