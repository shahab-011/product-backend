// Each clause has a canonical key and a list of keywords that count as a match.
// Pure JS — no API calls, works offline, fully deterministic.
const MANDATORY_CLAUSES = [
  {
    key: 'termination',
    keywords: ['termination', 'terminate', 'terminat', 'notice period', 'end of agreement', 'expiry of agreement'],
  },
  {
    key: 'payment',
    keywords: ['payment', 'pay ', 'invoice', 'fees', 'fee ', 'compensation', 'remuneration', 'salary', 'consideration'],
  },
  {
    key: 'confidentiality',
    keywords: ['confidential', 'non-disclosure', 'nda', 'proprietary information', 'trade secret'],
  },
  {
    key: 'jurisdiction',
    keywords: ['jurisdiction', 'governing law', 'governed by', 'applicable law', 'laws of', 'courts of', 'arbitration'],
  },
  {
    key: 'liability',
    keywords: ['liability', 'liable', 'damages', 'limitation of liability', 'limited liability'],
  },
  {
    key: 'indemnity',
    keywords: ['indemnity', 'indemnification', 'indemnif', 'hold harmless'],
  },
];

// State names in display form — checked case-insensitively against document text
const INDIAN_STATES = [
  { key: 'maharashtra',      label: 'Maharashtra'      },
  { key: 'karnataka',        label: 'Karnataka'        },
  { key: 'delhi',            label: 'Delhi'            },
  { key: 'tamil nadu',       label: 'Tamil Nadu'       },
  { key: 'west bengal',      label: 'West Bengal'      },
  { key: 'gujarat',          label: 'Gujarat'          },
  { key: 'rajasthan',        label: 'Rajasthan'        },
  { key: 'kerala',           label: 'Kerala'           },
  { key: 'andhra pradesh',   label: 'Andhra Pradesh'   },
  { key: 'telangana',        label: 'Telangana'        },
  { key: 'uttar pradesh',    label: 'Uttar Pradesh'    },
  { key: 'bihar',            label: 'Bihar'            },
  { key: 'punjab',           label: 'Punjab'           },
  { key: 'haryana',          label: 'Haryana'          },
  { key: 'goa',              label: 'Goa'              },
];

// Central-law markers resolve to "India" when no specific state is found
const CENTRAL_MARKERS = [
  'indian law',
  'laws of india',
  'arbitration and conciliation act',
  'companies act',
  'contract act',
  'india',
];

exports.runComplianceCheck = (text) => {
  const lower = text.toLowerCase();

  // A clause passes if ANY of its keywords appear in the document text.
  const missingClauses = MANDATORY_CLAUSES
    .filter(({ keywords }) => !keywords.some((kw) => lower.includes(kw)))
    .map(({ key }) => key);
  const mandatoryClauses = missingClauses.length === 0;

  const signaturePresent =
    /signatur|signed by|authorised signatory|authorized signatory|witness|attestation|notarized/i.test(text);

  // Matches: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and "January 15, 2024" / "15 January 2024"
  const dates = text.match(
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/gi,
  ) || [];
  const datesValid = dates.length > 0;

  // Layer 1: state-specific match (most precise)
  const matchedState = INDIAN_STATES.find((s) => lower.includes(s.key));
  // Layer 2: central-act / generic India marker
  const hasCentralMarker = CENTRAL_MARKERS.some((m) => lower.includes(m));

  const jurisdictionDetected = matchedState
    ? matchedState.label
    : hasCentralMarker
      ? 'India'
      : 'Not specified';
  const jurisdictionValid = !!(matchedState || hasCentralMarker);

  const score =
    (mandatoryClauses ? 40 : 0) +
    (signaturePresent ? 20 : 0) +
    (datesValid ? 20 : 0) +
    (jurisdictionValid ? 20 : 0);

  return {
    score,
    mandatoryClauses,
    missingClauses,
    signaturePresent,
    datesFound: dates.length,
    datesValid,
    jurisdictionDetected,
    jurisdictionValid,
  };
};
