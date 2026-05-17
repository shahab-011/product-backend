const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HAIKU  = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

/* ── Base caller ────────────────────────────────────────────────── */
async function callClaude(messages, systemPrompt = '', maxTokens = 2048, model = HAIKU) {
  const start = Date.now();
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system:     systemPrompt || undefined,
    messages,
  });
  return {
    content:    msg.content[0].text,
    tokensUsed: msg.usage.input_tokens + msg.usage.output_tokens,
    durationMs: Date.now() - start,
    model:      msg.model,
  };
}

function safeJSON(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/* ── 1. Legal document analysis ─────────────────────────────────── */
async function analyzeLegalDocument(text) {
  const system = `You are an expert legal AI assistant for a Pakistan-based law firm management platform.
Analyze the provided legal document and return ONLY valid JSON with no markdown, no backticks.`;

  const prompt = `Analyze this legal document and return a JSON object with exactly these fields:
{
  "summary": "one paragraph executive summary",
  "parties": [{"name": "string", "role": "string"}],
  "keyDates": [{"date": "YYYY-MM-DD or description", "description": "string", "type": "deadline|hearing|filing|other"}],
  "obligations": ["string"],
  "risks": [{"title": "string", "description": "string", "severity": "low|medium|high"}],
  "legalIssues": ["string"],
  "documentType": "string"
}

Document text (first 15000 chars):
${text.slice(0, 15000)}`;

  const result = await callClaude([{ role: 'user', content: prompt }], system, 2000, HAIKU);
  const parsed = safeJSON(result.content);
  return { ...(parsed || { summary: result.content, parties:[], keyDates:[], obligations:[], risks:[], legalIssues:[] }), ...result };
}

/* ── 2. Deadline extraction ─────────────────────────────────────── */
async function extractDeadlines(text) {
  const system = `You are a legal AI that extracts dates and deadlines from court orders and legal documents.
Return ONLY valid JSON with no markdown.`;

  const prompt = `Extract all dates, deadlines, and scheduled events from the following document.
Return JSON with this exact structure:
{
  "deadlines": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "type": "hearing|filing_deadline|discovery_cutoff|statute_date|trial|other",
      "confidence": "high|medium|low"
    }
  ],
  "summary": "brief description of what this document schedules"
}

Document:
${text.slice(0, 12000)}`;

  const result = await callClaude([{ role: 'user', content: prompt }], system, 1500, HAIKU);
  const parsed = safeJSON(result.content);
  return { ...(parsed || { deadlines:[], summary:'' }), ...result };
}

/* ── 3. Time entry review + invoice suggestion ──────────────────── */
async function reviewTimeEntries(entries, matterTitle) {
  const system = `You are a legal billing AI that reviews time entries for accuracy, professionalism, and completeness.
Return ONLY valid JSON.`;

  const entriesText = entries.slice(0, 30).map((e, i) =>
    `${i+1}. ${e.date ? new Date(e.date).toDateString() : 'unknown date'} | ${e.hours}h | ${e.activityType} | "${e.description}"`
  ).join('\n');

  const prompt = `Review these time entries for matter "${matterTitle}" and return:
{
  "flags": [{"index": number, "issue": "string", "severity": "low|medium|high", "suggestion": "string"}],
  "cleanedDescriptions": [{"index": number, "original": "string", "improved": "string"}],
  "summary": "overall assessment",
  "totalHours": number,
  "totalValue": number,
  "readyToBill": boolean
}

Time entries:
${entriesText}`;

  const result = await callClaude([{ role: 'user', content: prompt }], system, 2000, HAIKU);
  const parsed = safeJSON(result.content);
  return { ...(parsed || { flags:[], cleanedDescriptions:[], summary:result.content, readyToBill:false }), ...result };
}

/* ── 4. Document drafting ───────────────────────────────────────── */
async function draftLegalDocument(docType, facts, matterContext = '') {
  const system = `You are an expert legal drafter for a Pakistani law firm. Write in professional legal English appropriate for Pakistani courts and legal practice. Be thorough and complete.`;

  const prompt = `Draft a complete ${docType} based on the following instructions and facts.

${matterContext ? `Matter context:\n${matterContext}\n\n` : ''}Key facts and instructions:
${facts}

Write the complete ${docType} document. Use appropriate legal formatting, numbered paragraphs where suitable, and professional language. Do not use placeholders — fill in all details from the facts provided.`;

  const result = await callClaude([{ role: 'user', content: prompt }], system, 4000, SONNET);
  return result;
}

/* ── 5. Matter chat ─────────────────────────────────────────────── */
async function chatWithMatter(messages, matterContext) {
  const system = `You are an AI legal assistant with full access to the matter context below.
Answer questions about this matter accurately. Cite specific data points (e.g., "As of [date], the outstanding balance is $X based on invoice #Y").
If the answer is not in the provided context, say so clearly.
Be concise and professional.

MATTER CONTEXT:
${matterContext}`;

  const result = await callClaude(messages, system, 1500, HAIKU);
  return result;
}

/* ── 6. Report narration ────────────────────────────────────────── */
async function narrateReport(query, reportData) {
  const system = `You are a legal business analyst AI for a law firm. Provide concise, insightful narrative analysis of firm data.`;

  const prompt = `Query: "${query}"

Report data:
${JSON.stringify(reportData, null, 2).slice(0, 6000)}

Provide a 2-3 paragraph narrative analysis answering the query. Include specific numbers, percentage changes, and actionable insights.`;

  const result = await callClaude([{ role: 'user', content: prompt }], system, 800, HAIKU);
  return result;
}

/* ── 7. Conflict analysis narrative ─────────────────────────────── */
async function analyzeConflictNarrative(conflictDetails, searchTerms, contacts, matters) {
  const system = `You are a legal ethics AI. Assess conflict of interest findings and provide a clear risk narrative.`;

  const terms = searchTerms.map(t => `${t.type}: ${t.value}`).join(', ');
  const prompt = `Assess the following conflict of interest check results and provide a narrative risk assessment.

Search terms: ${terms}
Conflict flags: ${conflictDetails.length ? conflictDetails.map(d => `${d.type} (${d.severity}): ${d.description}`).join('; ') : 'None'}
Contacts found: ${contacts.length}
Matters found: ${matters.length}

Write a 2-3 sentence professional risk assessment suitable for a legal memo. State the risk level (CLEAR / LOW / MEDIUM / HIGH) and explain why.`;

  const result = await callClaude([{ role: 'user', content: prompt }], system, 500, HAIKU);
  return result;
}

module.exports = {
  callClaude,
  analyzeLegalDocument,
  extractDeadlines,
  reviewTimeEntries,
  draftLegalDocument,
  chatWithMatter,
  narrateReport,
  analyzeConflictNarrative,
};
