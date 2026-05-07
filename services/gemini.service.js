const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getFirstChunks, prepareContext } = require('./chunker.service');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const safeJsonParse = (text) => {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
};

// Cleans PDF.js "&X&" character-level encoding artifacts (e.g. "&D&e&l&h&i&" → "Delhi")
function cleanExtractedText(raw) {
  if (!raw) return '';
  let text = raw
    .replace(/&([^&\s])&/g, '$1')   // &X& → X
    .replace(/&/g, '');              // remove orphaned & markers
  // Collapse spaced-out single chars from encoding: "D w a r k a" → "Dwarka" (3+ chars)
  text = text.replace(/\b(?:[A-Za-z\d] ){2,}[A-Za-z\d]\b/g, (m) => m.replace(/ /g, ''));
  return text.replace(/ {2,}/g, ' ').trim();
}

exports.analyzeDocument = async (text, docType = 'legal document') => {
  try {
    const context = getFirstChunks(cleanExtractedText(text), 3).join('\n\n');

    const prompt = `You are an expert Indian legal AI assistant. Analyze the following ${docType} and return ONLY a valid JSON object. No markdown. No backticks. No explanation. Start your response with { and end with }.

SUMMARY INSTRUCTION: Write exactly 2-3 sentences in simple plain English that a non-lawyer Indian person can understand. Follow this structure:
  Sentence 1 — What the document is: parties involved, purpose, and duration/scope.
  Sentence 2 — Key practical terms: payment amounts (use ₹ symbol), timelines, or main obligations.
  Sentence 3 — Start with "Key concern:" followed by the single most important risk or clause the user must know about.
If a sentence's information is not available in the document, skip that sentence.

CLAUSES INSTRUCTION: Extract every significant clause from the document. For each clause:
  - type: Use the full standard legal name (e.g. "Non-Compete Clause", "Payment Terms", "Termination Clause", "Force Majeure", "Confidentiality Clause", "Indemnity Clause", "Governing Law", "Dispute Resolution").
  - originalText: Copy the exact verbatim text from the document. Maximum 300 characters — truncate with "..." if longer.
  - plainEnglish: Translate the clause into plain conversational English. Rules: (1) Zero legal jargon — replace every legal term with everyday words. (2) Use "you" and "the other party" — never "indemnifying party", "licensor", "hereinafter", etc. (3) Short sentences, max 15 words each. (4) State the practical consequence clearly: what happens to the user if this clause applies. (5) Add comparative context if the clause is unusual: "Most contracts say X — this one says Y." Maximum 3 sentences total.
  - riskLevel: "high" if the clause is unusually one-sided, missing, or harmful to the user; "medium" if it needs attention; "low" if standard and fair.
  - confidence: 0-100 representing how certain you are this clause is correctly identified.

CONFIDENCE INSTRUCTION: For every confidence score you produce (overall confidenceScore and per-clause confidence), apply this rubric:
  85-100 — You are highly certain: the text is explicit, unambiguous, and the clause or analysis is clearly supported by the document.
  60-84  — Reasonable confidence: the clause is present but text is slightly ambiguous, partially visible, or context is incomplete.
  Below 60 — Low confidence: the text is fragmentary, the clause is implied rather than stated, or the document is too short/damaged to analyse reliably.
Be honest. Do not default to high scores to appear impressive — low confidence scores are more useful to the user than false certainty.

JURISDICTION INSTRUCTION: Identify which Indian state's or Indian central law governs this document. Look for:
  - Explicit governing law clauses: "This agreement is governed by the laws of Maharashtra", "subject to jurisdiction of Delhi courts"
  - Court or arbitration venue: "courts at Mumbai", "arbitration in Bengaluru", "disputes resolved in Chennai"
  - Stamp duty references: often state-specific
  - Regulatory references: Arbitration and Conciliation Act, Companies Act, Indian Contract Act → return "India"
  Return the specific Indian state name (e.g. "Maharashtra", "Karnataka", "Delhi") when a state is identified, or "India" for central law, or "Not specified" if the document gives no clues.

DOC TYPE INSTRUCTION: Classify the document into exactly one of these types — read the document carefully before choosing:
  Contract, NDA, MoU, Rent Agreement, Offer Letter, Will, Property Deed, Partnership Deed, Freelance Agreement, Vendor Agreement, Service Agreement, Consultancy Agreement.
  Rules: (1) Choose the most specific type — prefer "Freelance Agreement" over "Contract" if the document is for independent work. (2) If none match, return the closest one — do NOT return "Other". (3) Use the exact label from the list above.

RISKS INSTRUCTION: Identify every risk, unfair term, or one-sided clause in the document. Actively look for:
  1. Unusually long non-compete periods (flag anything beyond 6 months for freelancers, 12 months for employees)
  2. One-sided termination rights (one party can exit instantly; the other cannot)
  3. Missing payment penalty clauses (no late-payment interest or consequence for delayed payment)
  4. Vague force majeure language (events list is too broad or undefined, giving one party an escape route)
  5. Excessive IP ownership by employer (all work product transferred to employer even for pre-existing work)
  6. No dispute resolution mechanism (no arbitration, mediation, or escalation process defined)
  7. Missing indemnity protection for the user (user bears all liability; the other party has none)
  8. Unbalanced notice periods (one party needs 90 days notice; the other needs only 7 days)
  Also flag any other risk you identify beyond this list.
For each risk:
  - title: Short, specific headline (max 8 words). Bad: "Risk found". Good: "Non-compete clause too broad".
  - description: 1-2 sentences. State the exact problem and why it hurts the user. Include numbers where present (e.g. "12 months", "Industry standard is 3-6 months").
  - severity: "high" = serious financial or legal harm; "medium" = needs negotiation; "low" = minor or standard risk.
  - clauseRef: The clause number or name from the document (e.g. "Clause 8.2", "Section 4 — Termination"). Write "General" if not tied to a specific clause.
  - recommendation: Start with an action verb. Tell the user exactly what to ask for or do. Example: "Ask the company to reduce to 6 months or define 'competitor' as direct clients only."

The JSON must follow this exact structure:
{
  "summary": "2-3 sentence plain English explanation per the SUMMARY INSTRUCTION above",
  "detectedDocType": "Exact type from this list: Contract | NDA | MoU | Rent Agreement | Offer Letter | Will | Property Deed | Partnership Deed | Freelance Agreement | Vendor Agreement | Service Agreement | Consultancy Agreement",
  "detectedJurisdiction": "Specific Indian state name (e.g. Maharashtra, Karnataka, Delhi) or 'India' for central law or 'Not specified'",
  "healthScore": <number 0-100>,
  "confidenceScore": <number 0-100>,
  "clauses": [
    {
      "type": "Full clause name e.g. Termination Clause, Payment Terms, Non-Compete, Confidentiality, Force Majeure, Liability, Indemnity, Governing Law",
      "originalText": "Verbatim quote from the document — max 300 characters. End with ... if truncated.",
      "plainEnglish": "Plain conversational English — no jargon, use 'you'/'the other party', max 3 short sentences, state practical consequence, add comparative context if unusual.",
      "riskLevel": "low|medium|high",
      "confidence": <number 0-100 — how certain you are this is the clause you named>
    }
  ],
  "risks": [
    {
      "title": "Short specific headline — max 8 words e.g. 'Non-compete clause too broad'",
      "description": "1-2 sentences stating the exact problem and why it hurts the user. Include specific numbers if present.",
      "severity": "low|medium|high",
      "clauseRef": "Clause number or section name from the document, e.g. 'Clause 8.2' or 'General'",
      "recommendation": "Action starting with a verb — tell the user exactly what to request or do."
    }
  ],
  "expiryDate": "YYYY-MM-DD or null",
  "renewalDate": "YYYY-MM-DD or null"
}

Document Text:
${context}`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    console.log('Gemini raw response (first 300):', raw?.slice(0, 300));
    return safeJsonParse(raw);
  } catch (err) {
    console.error('analyzeDocument error FULL:', err.message, err.status, err.errorDetails);
    return {
      summary: 'Analysis failed',
      detectedDocType: null,
      detectedJurisdiction: null,
      healthScore: 0,
      confidenceScore: 0,
      clauses: [],
      risks: [],
      expiryDate: null,
      renewalDate: null,
      error: true,
    };
  }
};

exports.askQuestion = async (question, documentText, chatHistory = []) => {
  try {
    const context = prepareContext(cleanExtractedText(documentText), question);

    const historyStr = chatHistory
      .slice(-6)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const prompt = `You are a helpful legal assistant for NyayaAI. You help ordinary Indian users understand their legal documents in simple, clear English — not legal jargon.

Rules:
- Answer ONLY from the document excerpts provided below — do not use outside knowledge.
- The excerpts are the most relevant sections retrieved from the full document for this specific question.
- If the answer is not in the excerpts, say: "This specific information was not found in the relevant sections of your document."
- Use simple language a non-lawyer can understand. No legal jargon.
- Always end your response with: "⚠ AI-generated — verify with a qualified lawyer"

${historyStr ? `Conversation so far:\n${historyStr}\n\n` : ''}Retrieved document excerpts (most relevant to your question):
${context}

User question: ${question}`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error('askQuestion error:', err.message);
    return 'Sorry, I could not process your question. Please try again.';
  }
};

exports.compareDocuments = async (text1, text2) => {
  try {
    const compareGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const compareModel = compareGenAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.2, maxOutputTokens: 3000 },
    });

    const snippet1 = cleanExtractedText(text1).slice(0, 3000);
    const snippet2 = cleanExtractedText(text2).slice(0, 3000);

    const prompt = `You are an expert Indian legal AI helping ordinary users understand what changed between two versions of a legal document. Return ONLY a valid JSON object. No markdown. No backticks. No explanation. Start your response with { and end with }.

PERSPECTIVE: Always write from the USER's perspective — the person reading this comparison. "You" = the user. "The other party" = company/builder/employer/counterparty.

SUMMARY INSTRUCTION: Write 2-3 plain English sentences. Sentence 1: what kind of document this is and the overall direction of change. Sentence 2: the most important change that affects the user. Sentence 3: overall verdict (e.g. "Version B is significantly worse for you because..."). Zero legal jargon.

ADDITIONS INSTRUCTION: List every clause, right, or protection that appears in Document B but did NOT exist in Document A.
Each addition is a plain English string (not a clause number) describing:
  - What was added AND what it means for the user practically
  - Example: "Late payment penalty added: if they don't pay within 30 days, they owe you 1.5% monthly interest — this protects you"
  - Example: "Company can now assign this contract to any third party without telling you — you could end up working for a completely different company"
Include ALL additions. Do not skip any.

REMOVALS INSTRUCTION: List every clause, right, or protection that existed in Document A but is GONE in Document B.
Each removal is a plain English string describing:
  - What was removed AND why losing it hurts the user
  - Example: "Dispute resolution clause removed — if there's a disagreement, you now have no agreed process to resolve it and must go straight to court"
  - Example: "Your right to keep your pre-existing work (IP) removed — everything you made before this contract could now belong to them"
Include ALL removals. Do not skip any.

MODIFICATIONS INSTRUCTION: For every clause that exists in BOTH documents but changed:
  - clauseName: Full clause name + number if visible (e.g. "Non-Compete Clause (8.2)")
  - before: Exact quote or close paraphrase from Document A (max 200 chars, truncate with ...)
  - after: Exact quote or close paraphrase from Document B (max 200 chars, truncate with ...)
  - impact: 1-2 plain English sentences on what this change MEANS FOR THE USER. Start with a concrete consequence: "This means you..." or "As a result, you..."
  - severity: "high" = serious financial or legal harm to user; "medium" = needs negotiation attention; "low" = minor or administrative

RISK CHANGE INSTRUCTION:
  - "worsened": Version B has more clauses that harm the user than Version A
  - "improved": Version B has fewer harmful clauses or better protections for the user
  - "neutral": The changes roughly balance out — some better, some worse

RECOMMENDATION INSTRUCTION: Write a full paragraph (3-5 sentences) of specific, actionable advice. Name the exact clauses to negotiate. Use plain English. End with whether the user should or should not sign as-is.

Return this exact JSON structure:
{
  "summary": "2-3 plain English sentences — what changed and overall verdict",
  "additions": [
    "Plain English description of what was added AND what it means for the user"
  ],
  "removals": [
    "Plain English description of what was removed AND why losing it hurts the user"
  ],
  "modifications": [
    {
      "clauseName": "Full clause name + number e.g. Non-Compete Clause (8.2)",
      "before": "Verbatim or close paraphrase from Document A — max 200 chars",
      "after": "Verbatim or close paraphrase from Document B — max 200 chars",
      "impact": "Plain English: what this specific change means for the user. Start with a concrete consequence.",
      "severity": "low|medium|high"
    }
  ],
  "riskChange": "improved|worsened|neutral",
  "recommendation": "Full paragraph: specific clauses to negotiate, what to ask for, and whether to sign as-is"
}

Document A (Original Version):
${snippet1}

Document B (New/Revised Version):
${snippet2}`;

    const result = await compareModel.generateContent(prompt);
    const rawText = result.response.text();
    console.log('compareDocuments raw (first 200):', rawText?.slice(0, 200));
    return safeJsonParse(rawText);
  } catch (err) {
    console.error('Gemini compareDocuments error:', err.message);
    return {
      summary: 'Document comparison encountered an error. Please try again.',
      additions: [],
      removals: [],
      modifications: [],
      riskChange: 'neutral',
      recommendation: 'Unable to complete comparison. Please try again.',
      error: true,
      errorMessage: err.message,
    };
  }
};

exports.generateHealthScore = (aiScore, complianceScore) => {
  return Math.round(aiScore * 0.6 + complianceScore * 0.4);
};
