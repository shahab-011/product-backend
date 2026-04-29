// Common English words that carry no signal for legal query matching
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'shall','what','which','who','this','that','these','those','it','its',
  'as','not','no','so','if','then','than','when','where','how','about',
  'into','through','during','before','after','above','below','between',
  'each','any','all','both','few','more','most','other','some','such',
  'can','just','over','also','very','they','their','there','here','he',
  'she','we','you','i','me','my','your','our','his','her','them','us',
]);

/**
 * Split text into overlapping chunks at sentence boundaries.
 * Target: ~500 words per chunk, 80-word overlap.
 * Smaller chunks → more precise retrieval → less noise sent to Gemini.
 */
exports.chunkText = (text, targetWords = 500, overlap = 80) => {
  // Split at sentence-ending punctuation followed by whitespace
  const sentences = text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  let current = [];
  let wordCount = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).length;
    current.push(sentence);
    wordCount += words;

    if (wordCount >= targetWords) {
      chunks.push(current.join(' '));
      // Keep last `overlap` words as the start of the next chunk
      const overlapText = current.join(' ').split(/\s+/).slice(-overlap).join(' ');
      current = [overlapText];
      wordCount = overlapText.split(/\s+/).length;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  return chunks.length > 0 ? chunks : [text];
};

/**
 * Score each chunk against the query using term-frequency (not just presence).
 * Stop words are ignored so "what does the termination clause say" correctly
 * focuses on "termination clause" rather than "what/does/the".
 */
exports.findRelevantChunks = (chunks, query, topN = 3) => {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // If query is entirely stop words, fall back to first N chunks
  if (queryTerms.length === 0) return chunks.slice(0, topN);

  const scored = chunks.map((chunk, idx) => {
    const lower = chunk.toLowerCase();
    const words = lower.split(/\s+/);
    const wordCount = words.length || 1;

    // Term frequency: count how many times each query term appears
    const tf = queryTerms.reduce((acc, term) => {
      const count = (lower.match(new RegExp(term, 'g')) || []).length;
      return acc + count;
    }, 0);

    // Normalise by chunk length so shorter chunks aren't penalised
    const score = tf / Math.sqrt(wordCount);

    return { chunk, score, idx };
  });

  const allZero = scored.every((s) => s.score === 0);
  if (allZero) return chunks.slice(0, topN);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .sort((a, b) => a.idx - b.idx) // restore document order after ranking
    .map((s) => s.chunk);
};

/** Return the first N chunks (used for full-document analysis, not chat). */
exports.getFirstChunks = (text, n = 3) => {
  const chunks = exports.chunkText(text);
  return chunks.slice(0, n);
};

/**
 * Full RAG pipeline: chunk → rank → assemble context.
 * Returned string is ready to be injected directly into a Gemini prompt.
 */
exports.prepareContext = (text, query) => {
  const chunks = exports.chunkText(text);
  const relevant = exports.findRelevantChunks(chunks, query);

  // Label each section so Gemini knows it's reading excerpts, not the full doc
  return relevant
    .map((chunk, i) => `[Excerpt ${i + 1}]\n${chunk}`)
    .join('\n\n---\n\n');
};
