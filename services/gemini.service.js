const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getFirstChunks, prepareContext } = require('./chunker.service');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const safeJsonParse = (text) => {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
};

exports.analyzeDocument = async (text, docType = 'legal document') => {
  try {
    const context = getFirstChunks(text, 3).join('\n\n');

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
    const context = prepareContext(documentText, question);

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
    const snippet1 = text1.slice(0, 3000);
    const snippet2 = text2.slice(0, 3000);

    const prompt = `You are an expert legal AI. Compare these two legal documents and return ONLY a valid JSON object. No markdown. No backticks. No explanation. Start your response with { and end with }.

The JSON must follow this exact structure:
{
  "summary": "plain English overview of the differences",
  "additions": ["string — clauses or terms added in Document B"],
  "removals": ["string — clauses or terms removed from Document A"],
  "modifications": [
    {
      "clauseName": "name of the changed clause",
      "before": "original text or description",
      "after": "new text or description",
      "impact": "what this change means for the user",
      "severity": "low|medium|high"
    }
  ],
  "riskChange": "improved|worsened|neutral",
  "recommendation": "overall recommendation for the user"
}

Document A (Original):
${snippet1}

Document B (New Version):
${snippet2}`;

    const result = await model.generateContent(prompt);
    return safeJsonParse(result.response.text());
  } catch (err) {
    console.error('compareDocuments error:', err.message);
    return {
      summary: 'Comparison could not be completed',
      additions: [],
      removals: [],
      modifications: [],
      riskChange: 'neutral',
      recommendation: 'Please try again or compare manually.',
      error: true,
    };
  }
};

exports.generateHealthScore = (aiScore, complianceScore) => {
  return Math.round(aiScore * 0.6 + complianceScore * 0.4);
};
