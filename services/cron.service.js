const cron = require('node-cron');
const Document = require('../models/Document.model');
const Alert = require('../models/Alert.model');

/* ─────────────────────────────────────────────────────────────────────
 * Severity tiers — evaluated once per document per cron run.
 *
 * Each tier carries its own dedup window so a doc can receive a
 * low-severity reminder at 25 days AND a high-severity alert at 5 days
 * without the earlier alert blocking the escalation.
 *
 * Spec mapping:  ≤7 d → high | ≤14 d → medium | ≤30 d → low
 * ───────────────────────────────────────────────────────────────────── */
const EXPIRY_TIERS = [
  { maxDays: 7,  severity: 'high',   dedupDays: 3 },
  { maxDays: 14, severity: 'medium', dedupDays: 5 },
  { maxDays: 30, severity: 'low',    dedupDays: 7 },
];

const RENEWAL_TIERS = [
  { maxDays: 7,  severity: 'high',   dedupDays: 3 },
  { maxDays: 30, severity: 'medium', dedupDays: 7 },
];

/* ── helpers ──────────────────────────────────────────────────────── */

/** Returns true if an alert with the same type + severity exists within the dedup window. */
async function isDuplicate(documentId, alertType, severity, dedupDays) {
  const since = new Date(Date.now() - dedupDays * 24 * 60 * 60 * 1000);
  return Alert.exists({ documentId, alertType, severity, createdAt: { $gte: since } });
}

function expiryTitle(docName, daysLeft) {
  if (daysLeft <= 7)  return `🚨 Urgent: "${docName}" expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
  if (daysLeft <= 14) return `⚠ Warning: "${docName}" expires in ${daysLeft} days`;
  return `📅 Reminder: "${docName}" expires in ${daysLeft} days`;
}

function expiryMessage(date, daysLeft) {
  const dateStr = new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  if (daysLeft <= 7)  return `This document expires on ${dateStr}. Renew immediately or contact the other party to extend.`;
  if (daysLeft <= 14) return `This document expires on ${dateStr}. Schedule a review and prepare renewal documents now.`;
  return `This document expires on ${dateStr}. Begin the renewal process early to avoid disruption.`;
}

function renewalMessage(date, daysLeft) {
  const dateStr = new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return `Renewal is due on ${dateStr} — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} away. Review terms and initiate renewal to maintain continuity.`;
}

/* ── Expiry scan ──────────────────────────────────────────────────── */

async function processExpiryAlerts(now, in30Days) {
  const stats = { scanned: 0, created: 0, skipped: 0, errors: 0 };

  // Query: expiryDate between now and 30 days from now, status = analyzed
  const docs = await Document.find({
    expiryDate: { $gte: now, $lte: in30Days },
    status: 'analyzed',
  }).lean();

  stats.scanned = docs.length;

  for (const doc of docs) {
    try {
      // Calculate exact days left
      const daysLeft = Math.ceil((new Date(doc.expiryDate) - now) / (1000 * 60 * 60 * 24));

      // Determine severity tier (≤7 = high, ≤14 = medium, ≤30 = low)
      const tier = EXPIRY_TIERS.find((t) => daysLeft <= t.maxDays);
      if (!tier) { stats.skipped++; continue; }

      // Check for duplicate alert in the tier's dedup window
      const duplicate = await isDuplicate(doc._id, 'expiry', tier.severity, tier.dedupDays);
      if (duplicate) { stats.skipped++; continue; }

      // Create alert in MongoDB
      await Alert.create({
        userId:      doc.userId,
        documentId:  doc._id,
        alertType:   'expiry',
        title:       expiryTitle(doc.originalName, daysLeft),
        message:     expiryMessage(doc.expiryDate, daysLeft),
        severity:    tier.severity,
      });

      stats.created++;
      console.log(`  🔔 [expiry/${tier.severity}] "${doc.originalName}" — ${daysLeft}d left`);
    } catch (docErr) {
      // Per-document error — log and continue; never abort the batch
      stats.errors++;
      console.error(`  ⚠ Error processing expiry for "${doc.originalName}":`, docErr.message);
    }
  }

  return stats;
}

/* ── Renewal scan ─────────────────────────────────────────────────── */

async function processRenewalAlerts(now, in30Days) {
  const stats = { scanned: 0, created: 0, skipped: 0, errors: 0 };

  const docs = await Document.find({
    renewalDate: { $gte: now, $lte: in30Days },
    status: 'analyzed',
  }).lean();

  stats.scanned = docs.length;

  for (const doc of docs) {
    try {
      const daysLeft = Math.ceil((new Date(doc.renewalDate) - now) / (1000 * 60 * 60 * 24));

      const tier = RENEWAL_TIERS.find((t) => daysLeft <= t.maxDays);
      if (!tier) { stats.skipped++; continue; }

      const duplicate = await isDuplicate(doc._id, 'renewal', tier.severity, tier.dedupDays);
      if (duplicate) { stats.skipped++; continue; }

      await Alert.create({
        userId:     doc.userId,
        documentId: doc._id,
        alertType:  'renewal',
        title:      `🔄 Renewal due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — "${doc.originalName}"`,
        message:    renewalMessage(doc.renewalDate, daysLeft),
        severity:   tier.severity,
      });

      stats.created++;
      console.log(`  🔄 [renewal/${tier.severity}] "${doc.originalName}" — ${daysLeft}d to renewal`);
    } catch (docErr) {
      stats.errors++;
      console.error(`  ⚠ Error processing renewal for "${doc.originalName}":`, docErr.message);
    }
  }

  return stats;
}

/* ── Main scan runner (exported so tests can trigger it manually) ─── */

async function runLifecycleScan() {
  const runAt = new Date().toISOString();
  console.log(`\n⏰ [${runAt}] NyayaAI nightly lifecycle scan starting…`);

  // Compute window once — shared by both scans
  const now      = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let expiryStats  = { scanned: 0, created: 0, skipped: 0, errors: 0 };
  let renewalStats = { scanned: 0, created: 0, skipped: 0, errors: 0 };

  try {
    expiryStats = await processExpiryAlerts(now, in30Days);
  } catch (err) {
    // Function-level catch — the renewal scan still runs
    console.error('  ❌ Expiry scan failed entirely:', err.message);
  }

  try {
    renewalStats = await processRenewalAlerts(now, in30Days);
  } catch (err) {
    console.error('  ❌ Renewal scan failed entirely:', err.message);
  }

  // Structured run summary
  const totalCreated = expiryStats.created + renewalStats.created;
  const totalErrors  = expiryStats.errors  + renewalStats.errors;

  console.log('  ─────────────────────────────────────────────');
  console.log(`  📋 Expiry  — scanned: ${expiryStats.scanned}  | created: ${expiryStats.created} | skipped: ${expiryStats.skipped} | errors: ${expiryStats.errors}`);
  console.log(`  🔄 Renewal — scanned: ${renewalStats.scanned} | created: ${renewalStats.created} | skipped: ${renewalStats.skipped} | errors: ${renewalStats.errors}`);
  console.log(`  ✅ Scan complete — ${totalCreated} alert${totalCreated !== 1 ? 's' : ''} created${totalErrors > 0 ? `, ${totalErrors} error${totalErrors !== 1 ? 's' : ''}` : ''}`);
  console.log('  ─────────────────────────────────────────────\n');
}

/* ── Schedule ─────────────────────────────────────────────────────── */

exports.startCronJobs = () => {
  // Every day at midnight  '0 0 * * *'
  cron.schedule('0 0 * * *', async () => {
    try {
      await runLifecycleScan();
    } catch (fatalErr) {
      // Absolute last-resort catch — the server must never crash from a cron error
      console.error('❌ CRON FATAL (unreachable):', fatalErr.message);
    }
  });

  console.log('✅ Cron jobs scheduled — nightly scan at 00:00');
};

// Exported for manual testing: require('../services/cron.service').runLifecycleScan()
exports.runLifecycleScan = runLifecycleScan;
