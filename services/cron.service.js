const cron          = require('node-cron');
const Document      = require('../models/Document.model');
const Alert         = require('../models/Alert.model');
const Invoice       = require('../models/Invoice.model');
const Matter        = require('../models/Matter.model');
const FirmSettings  = require('../models/FirmSettings.model');
const Notification  = require('../models/Notification.model');
const { sendInvoiceReminder } = require('../utils/email');

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

/* ── Invoice payment reminder scan ────────────────────────────────── */

async function runInvoiceReminderScan() {
  const now = new Date();
  // Find sent/overdue invoices whose nextReminderAt is due
  const invoices = await Invoice.find({
    status:        { $in: ['sent', 'partially_paid', 'overdue'] },
    isDeleted:     { $ne: true },
    nextReminderAt: { $lte: now },
    clientEmail:   { $exists: true, $ne: '' },
  }).lean();

  let sent = 0;
  for (const inv of invoices) {
    try {
      const settings = await FirmSettings.findOne({ firmId: inv.firmId }).lean();
      if (!settings?.invoiceReminders?.enabled) continue;

      const isOverdue = inv.status === 'overdue' || (inv.dueDate && new Date(inv.dueDate) < now);
      const payUrl    = inv.paymentLink || null;

      await sendInvoiceReminder(inv.clientEmail, inv.clientName || 'Client', {
        firmName: settings.name || 'Your Law Firm',
        invoiceNumber: inv.invoiceNumber,
        amount:  inv.amountOutstanding,
        dueDate: inv.dueDate,
        payUrl,
        isOverdue,
      });

      // Schedule next reminder 7 days out (or clear if paid)
      const nextReminderAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await Invoice.findByIdAndUpdate(inv._id, {
        $push: { remindersSent: { type: isOverdue ? 'overdue' : 'upcoming', sentAt: now } },
        nextReminderAt,
      });
      sent++;
    } catch (e) {
      console.error(`  ⚠ Invoice reminder failed for ${inv.invoiceNumber}:`, e.message);
    }
  }
  if (sent) console.log(`  📧 Invoice reminders sent: ${sent}`);
}

/* ── SOL (Statute of Limitations) alert scan ──────────────────────── */

async function runSOLAlertScan() {
  const now = new Date();
  const matters = await Matter.find({
    solDate:   { $exists: true, $ne: null },
    status:    { $in: ['active', 'pending', 'on_hold'] },
    isDeleted: { $ne: true },
  }).lean();

  let created = 0;
  for (const m of matters) {
    const daysLeft = Math.ceil((new Date(m.solDate) - now) / 86400000);
    const alertDays = m.solAlertDays || 30;
    if (daysLeft < 0 || daysLeft > alertDays) continue;

    // Check if we already sent an alert today for this matter
    const dedupSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const exists = await Notification.findOne({
      'metadata.matterId': m._id,
      type:      'system_alert',
      createdAt: { $gte: dedupSince },
    });
    if (exists) continue;

    const severity = daysLeft <= 7 ? '🚨' : daysLeft <= 14 ? '⚠️' : '📅';
    await Notification.create({
      firmId:  m.firmId,
      userId:  m.assignedTo?.[0] || m.firmId,
      type:    'system_alert',
      title:   `${severity} SOL Alert: "${m.title}"`,
      message: `Statute of limitations expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${new Date(m.solDate).toLocaleDateString()}).`,
      metadata: { matterId: m._id },
      isRead:  false,
    });
    created++;
  }
  if (created) console.log(`  ⚖️  SOL alerts created: ${created}`);
}

/* ── Schedule ─────────────────────────────────────────────────────── */

exports.startCronJobs = () => {
  // Every day at midnight  '0 0 * * *'
  cron.schedule('0 0 * * *', async () => {
    try {
      await runLifecycleScan();
    } catch (fatalErr) {
      console.error('❌ CRON FATAL (unreachable):', fatalErr.message);
    }
  });

  // Every day at 08:00 — invoice reminders + SOL alerts
  cron.schedule('0 8 * * *', async () => {
    try {
      console.log('\n⏰ Practice management daily scan starting…');
      await runInvoiceReminderScan();
      await runSOLAlertScan();
      console.log('  ✅ Practice management scan complete\n');
    } catch (e) {
      console.error('❌ Practice scan failed:', e.message);
    }
  });

  console.log('✅ Cron jobs scheduled — nightly scan 00:00, practice scan 08:00');
};

// Exported for manual testing: require('../services/cron.service').runLifecycleScan()
exports.runLifecycleScan = runLifecycleScan;
