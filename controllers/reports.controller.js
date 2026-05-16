const Invoice          = require('../models/Invoice.model');
const TimeEntry        = require('../models/TimeEntry.model');
const Matter           = require('../models/Matter.model');
const Lead             = require('../models/Lead.model');
const Task             = require('../models/Task.model');
const Expense          = require('../models/Expense.model');
const TrustTransaction = require('../models/TrustTransaction.model');
const CalendarEvent    = require('../models/CalendarEvent.model');
const SavedReport      = require('../models/SavedReport.model');
const { sendSuccess, sendError } = require('../utils/response');

const getFirmId = req => req.user.firmId || req.user._id;

/* ── Helpers ────────────────────────────────────────────────────── */
const dr = (from, to, field = 'createdAt') => {
  const f = {};
  if (from || to) {
    f[field] = {};
    if (from) f[field].$gte = new Date(from);
    if (to)   f[field].$lte = new Date(to);
  }
  return f;
};

function monthStart() {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d;
}

function todayRange() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { $gte: s, $lte: e };
}

function groupByMonth(items, dateField, valueField) {
  const map = {};
  items.forEach(item => {
    const d = new Date(item[dateField]);
    if (isNaN(d)) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map[key]) map[key] = { period: key, total: 0, count: 0 };
    map[key].total += item[valueField] || 0;
    map[key].count++;
  });
  return Object.values(map).sort((a, b) => a.period.localeCompare(b.period));
}

function groupByField(items, field) {
  const map = {};
  items.forEach(item => {
    const key = item[field] || 'Unknown';
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function ageDays(invoice) {
  const due = invoice.dueDate ? new Date(invoice.dueDate) : new Date(invoice.issueDate);
  return Math.max(0, Math.floor((Date.now() - due.getTime()) / 86400000));
}

/* ── Dashboard ──────────────────────────────────────────────────── */

exports.getFirmDashboard = async (req, res) => {
  const firmId   = getFirmId(req);
  const todayR   = todayRange();
  const monthS   = monthStart();
  const userId   = req.user._id;

  const [todayEntries, todayInvoices, todayTasks, upcomingEvents,
         monthInvoices, monthMatters, myTasks, recentInvoices] = await Promise.all([
    TimeEntry.find({ firmId, date: todayR, isDeleted: { $ne: true } }).lean(),
    Invoice.find({ firmId, issueDate: todayR }).lean(),
    Task.find({ firmId, dueDate: todayR, status: { $ne: 'completed' } }).lean(),
    CalendarEvent.find({ firmId, startTime: { $gte: new Date() } })
      .sort({ startTime: 1 }).limit(3).lean(),
    Invoice.find({ firmId, issueDate: { $gte: monthS } }).lean(),
    Matter.find({ firmId, openDate: { $gte: monthS }, isDeleted: { $ne: true } }).lean(),
    Task.find({ firmId, assignedTo: userId, status: { $ne: 'completed' } })
      .sort({ dueDate: 1 }).limit(5).populate('matterId', 'title matterNumber').lean(),
    Invoice.find({ firmId }).sort({ createdAt: -1 }).limit(20)
      .populate('matterId', 'title').populate('clientId', 'firstName lastName').lean(),
  ]);

  const todayHours   = +todayEntries.reduce((s, e) => s + e.hours, 0).toFixed(2);
  const todayBilled  = +(todayInvoices.reduce((s, i) => s + (i.total || 0), 0)).toFixed(2);
  const monthBilled  = +(monthInvoices.reduce((s, i) => s + (i.total || 0), 0)).toFixed(2);
  const monthCollected = +(monthInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amountPaid || i.total || 0), 0)).toFixed(2);
  const monthOutstanding = +(monthInvoices.filter(i => ['sent','overdue','partially_paid'].includes(i.status)).reduce((s, i) => s + (i.amountOutstanding || 0), 0)).toFixed(2);

  sendSuccess(res, {
    today: {
      hoursLogged:    todayHours,
      revenueBilled:  todayBilled,
      tasksDueToday:  todayTasks.length,
      upcomingEvents: upcomingEvents.map(e => ({ title: e.title, startTime: e.startTime, type: e.eventType })),
    },
    month: {
      invoicesSent:    monthInvoices.length,
      collected:       monthCollected,
      outstanding:     monthOutstanding,
      billed:          monthBilled,
      newMatters:      monthMatters.length,
    },
    myTasks,
    recentActivity: recentInvoices,
  }, 'Dashboard loaded');
};

/* ── Full Summary ───────────────────────────────────────────────── */

exports.getFullSummary = async (req, res) => {
  const { from, to } = req.query;
  const firmId = getFirmId(req);

  const [invoices, timeEntries, matters, leads] = await Promise.all([
    Invoice.find({ firmId, ...dr(from, to, 'issueDate') }).lean(),
    TimeEntry.find({ firmId, isDeleted: { $ne: true }, ...dr(from, to, 'date') }).lean(),
    Matter.find({ firmId, isDeleted: { $ne: true } }).lean(),
    Lead.find({ firmId, isDeleted: { $ne: true }, ...dr(from, to, 'createdAt') }).lean(),
  ]);

  const revenue = {
    total:       +invoices.reduce((s, i) => s + (i.total || 0), 0).toFixed(2),
    collected:   +invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amountPaid || i.total || 0), 0).toFixed(2),
    outstanding: +invoices.filter(i => ['sent','overdue','partially_paid'].includes(i.status)).reduce((s, i) => s + (i.amountOutstanding || 0), 0).toFixed(2),
    overdue:     +invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.amountOutstanding || 0), 0).toFixed(2),
    byMonth:     groupByMonth(invoices, 'issueDate', 'total'),
  };

  const hours = {
    total:    +timeEntries.reduce((s, e) => s + e.hours, 0).toFixed(2),
    billable: +timeEntries.filter(e => e.isBillable).reduce((s, e) => s + e.hours, 0).toFixed(2),
    billed:   +timeEntries.filter(e => e.isBilled).reduce((s, e) => s + e.hours, 0).toFixed(2),
    value:    +timeEntries.reduce((s, e) => s + (e.amount || 0), 0).toFixed(2),
    unbilled: +timeEntries.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => s + (e.amount || 0), 0).toFixed(2),
    byMonth:  groupByMonth(timeEntries, 'date', 'hours'),
  };

  const matterStats = {
    total:   matters.length,
    active:  matters.filter(m => m.status === 'active').length,
    closed:  matters.filter(m => m.status === 'closed').length,
    pending: matters.filter(m => m.status === 'pending').length,
    byStage: groupByField(matters, 'stage'),
    byArea:  groupByField(matters, 'practiceArea'),
  };

  const leadStats = {
    total:    leads.length,
    active:   leads.filter(l => !['Hired','Not Hired'].includes(l.stage)).length,
    hired:    leads.filter(l => l.stage === 'Hired').length,
    lost:     leads.filter(l => l.stage === 'Not Hired').length,
    value:    leads.reduce((s, l) => s + (l.estimatedValue || 0), 0),
    convRate: leads.length > 0 ? +((leads.filter(l => l.stage === 'Hired').length / leads.length) * 100).toFixed(1) : 0,
    byStage:  groupByField(leads, 'stage'),
  };

  const clientMap = {};
  invoices.forEach(i => {
    const key = (i.clientId || '').toString() || i.clientName || 'Unknown';
    if (!clientMap[key]) clientMap[key] = { name: i.clientName || key, total: 0, count: 0 };
    clientMap[key].total += i.total || 0;
    clientMap[key].count++;
  });
  const topClients = Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 5);

  sendSuccess(res, { period: { from, to }, revenue, hours, matters: matterStats, leads: leadStats, topClients }, 'Summary fetched');
};

/* ── Revenue ────────────────────────────────────────────────────── */

exports.getRevenueReport = async (req, res) => {
  const { from, to, groupBy = 'month' } = req.query;
  const firmId = getFirmId(req);

  const invoices = await Invoice.find({ firmId, status: { $ne: 'void' }, ...dr(from, to, 'issueDate') })
    .populate('matterId', 'title practiceArea')
    .populate('clientId', 'firstName lastName company')
    .lean();

  const byPeriod = groupByMonth(invoices, 'issueDate', 'total');

  // By practice area
  const areaMap = {};
  invoices.forEach(i => {
    const area = i.matterId?.practiceArea || 'Unknown';
    if (!areaMap[area]) areaMap[area] = { area, billed: 0, collected: 0, count: 0 };
    areaMap[area].billed    += i.total || 0;
    areaMap[area].collected += i.status === 'paid' ? (i.amountPaid || i.total || 0) : 0;
    areaMap[area].count++;
  });

  // By matter (top 10)
  const matterMap = {};
  invoices.forEach(i => {
    const key = (i.matterId?._id || 'no-matter').toString();
    const title = i.matterId?.title || 'No Matter';
    if (!matterMap[key]) matterMap[key] = { title, billed: 0, collected: 0, count: 0 };
    matterMap[key].billed    += i.total || 0;
    matterMap[key].collected += i.status === 'paid' ? (i.amountPaid || i.total || 0) : 0;
    matterMap[key].count++;
  });

  // By client (top 10)
  const clientMap = {};
  invoices.forEach(i => {
    const key = (i.clientId?._id || i.clientName || 'unknown').toString();
    const name = i.clientId ? `${i.clientId.firstName || ''} ${i.clientId.lastName || ''}`.trim() || i.clientId.company : (i.clientName || 'Unknown');
    if (!clientMap[key]) clientMap[key] = { name, billed: 0, collected: 0, count: 0 };
    clientMap[key].billed    += i.total || 0;
    clientMap[key].collected += i.status === 'paid' ? (i.amountPaid || i.total || 0) : 0;
    clientMap[key].count++;
  });

  const totals = {
    billed:      +invoices.reduce((s, i) => s + (i.total || 0), 0).toFixed(2),
    collected:   +invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amountPaid || i.total || 0), 0).toFixed(2),
    outstanding: +invoices.filter(i => ['sent','overdue','partially_paid'].includes(i.status)).reduce((s, i) => s + (i.amountOutstanding || 0), 0).toFixed(2),
    writtenOff:  0,
    invoiceCount: invoices.length,
  };

  sendSuccess(res, {
    totals, byPeriod,
    byArea:   Object.values(areaMap).sort((a, b) => b.billed - a.billed),
    byMatter: Object.values(matterMap).sort((a, b) => b.billed - a.billed).slice(0, 10),
    byClient: Object.values(clientMap).sort((a, b) => b.billed - a.billed).slice(0, 10),
  }, 'Revenue report fetched');
};

/* ── AR Aging ───────────────────────────────────────────────────── */

exports.getARAgingReport = async (req, res) => {
  const firmId = getFirmId(req);
  const outstanding = await Invoice.find({
    firmId, status: { $in: ['sent', 'overdue', 'partially_paid'] },
  }).populate('clientId', 'firstName lastName company').lean();

  const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
  outstanding.forEach(inv => {
    const days = ageDays(inv);
    const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
    buckets[bucket].push({
      invoiceNumber: inv.invoiceNumber,
      clientName:    inv.clientName || (inv.clientId ? `${inv.clientId.firstName||''} ${inv.clientId.lastName||''}`.trim() : 'Unknown'),
      dueDate:       inv.dueDate,
      amount:        +(inv.amountOutstanding || 0).toFixed(2),
      days,
    });
  });

  const summary = Object.entries(buckets).map(([range, items]) => ({
    range, count: items.length,
    total: +items.reduce((s, i) => s + i.amount, 0).toFixed(2),
  }));

  sendSuccess(res, { buckets, summary, totalOutstanding: +outstanding.reduce((s, i) => s + (i.amountOutstanding || 0), 0).toFixed(2) }, 'AR aging fetched');
};

/* ── Collections ────────────────────────────────────────────────── */

exports.getCollectionsReport = async (req, res) => {
  const { from, to } = req.query;
  const firmId = getFirmId(req);

  const invoices = await Invoice.find({ firmId, 'payments.0': { $exists: true }, ...dr(from, to, 'paidAt') })
    .populate('clientId', 'firstName lastName company')
    .populate('matterId', 'title matterNumber')
    .lean();

  const payments = [];
  invoices.forEach(inv => {
    (inv.payments || []).forEach(p => {
      const pd = new Date(p.date);
      if (from && pd < new Date(from)) return;
      if (to   && pd > new Date(to))   return;
      payments.push({
        invoiceNumber: inv.invoiceNumber,
        clientName:    inv.clientName || (inv.clientId ? `${inv.clientId.firstName||''} ${inv.clientId.lastName||''}`.trim() : 'Unknown'),
        matterTitle:   inv.matterId?.title,
        amount:        p.amount,
        date:          p.date,
        method:        p.method,
      });
    });
  });

  const total = +payments.reduce((s, p) => s + p.amount, 0).toFixed(2);
  sendSuccess(res, { payments: payments.sort((a, b) => new Date(b.date) - new Date(a.date)), total }, 'Collections report fetched');
};

/* ── Trust ──────────────────────────────────────────────────────── */

exports.getTrustReport = async (req, res) => {
  const { from, to } = req.query;
  const firmId = getFirmId(req);

  const txns = await TrustTransaction.find({ firmId, isVoided: { $ne: true }, ...dr(from, to, 'date') })
    .populate('matterId', 'title matterNumber')
    .populate('clientId', 'firstName lastName')
    .populate('performedBy', 'name')
    .sort({ date: 1 })
    .lean();

  const deposits = txns.filter(t => t.type === 'deposit');
  const disbursements = txns.filter(t => t.type !== 'deposit');

  const totalDeposited    = +deposits.reduce((s, t) => s + t.amount, 0).toFixed(2);
  const totalDisbursed    = +disbursements.reduce((s, t) => s + t.amount, 0).toFixed(2);
  const netBalance        = +(totalDeposited - totalDisbursed).toFixed(2);

  sendSuccess(res, { transactions: txns, totalDeposited, totalDisbursed, netBalance }, 'Trust report fetched');
};

/* ── Time Report ────────────────────────────────────────────────── */

exports.getTimeReport = async (req, res) => {
  const { from, to } = req.query;
  const firmId = getFirmId(req);

  const entries = await TimeEntry.find({ firmId, isDeleted: { $ne: true }, ...dr(from, to, 'date') })
    .populate('userId', 'name email')
    .populate('matterId', 'title practiceArea')
    .lean();

  const totals = {
    hours:          +entries.reduce((s, e) => s + e.hours, 0).toFixed(2),
    billableHours:  +entries.filter(e => e.isBillable).reduce((s, e) => s + e.hours, 0).toFixed(2),
    billedHours:    +entries.filter(e => e.isBilled).reduce((s, e) => s + e.hours, 0).toFixed(2),
    unbilledHours:  +entries.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => s + e.hours, 0).toFixed(2),
    value:          +entries.reduce((s, e) => s + (e.amount || 0), 0).toFixed(2),
    unbilledValue:  +entries.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => s + (e.amount || 0), 0).toFixed(2),
  };

  // By activity type
  const actMap = {};
  entries.forEach(e => {
    const a = e.activityType || 'other';
    if (!actMap[a]) actMap[a] = { type: a, hours: 0, count: 0 };
    actMap[a].hours += e.hours;
    actMap[a].count++;
  });

  // By practice area
  const areaMap = {};
  entries.forEach(e => {
    const a = e.matterId?.practiceArea || 'Unknown';
    if (!areaMap[a]) areaMap[a] = { area: a, hours: 0, billable: 0 };
    areaMap[a].hours    += e.hours;
    areaMap[a].billable += e.isBillable ? e.hours : 0;
  });

  sendSuccess(res, {
    totals,
    byActivity: Object.values(actMap).sort((a, b) => b.hours - a.hours),
    byArea:     Object.values(areaMap).sort((a, b) => b.hours - a.hours),
    byMonth:    groupByMonth(entries, 'date', 'hours'),
  }, 'Time report fetched');
};

/* ── Utilization ────────────────────────────────────────────────── */

exports.getUtilizationReport = async (req, res) => {
  const { from, to } = req.query;
  const firmId = getFirmId(req);

  const entries = await TimeEntry.find({ firmId, isDeleted: { $ne: true }, ...dr(from, to, 'date') })
    .populate('userId', 'name email').lean();

  const byUser = {};
  entries.forEach(e => {
    const uid  = (e.userId?._id || e.userId || '').toString();
    const name = e.userId?.name || 'Unknown';
    if (!byUser[uid]) byUser[uid] = { name, totalHours: 0, billableHours: 0, billedHours: 0, totalValue: 0, billedValue: 0 };
    byUser[uid].totalHours    += e.hours;
    byUser[uid].billableHours += e.isBillable ? e.hours : 0;
    byUser[uid].billedHours   += e.isBilled   ? e.hours : 0;
    byUser[uid].totalValue    += e.amount || 0;
    byUser[uid].billedValue   += e.isBilled ? (e.amount || 0) : 0;
  });

  const result = Object.values(byUser).map(u => ({
    ...u,
    totalHours:    +u.totalHours.toFixed(2),
    billableHours: +u.billableHours.toFixed(2),
    billedHours:   +u.billedHours.toFixed(2),
    utilization:   u.totalHours > 0 ? +((u.billableHours / u.totalHours) * 100).toFixed(1) : 0,
    realization:   u.billableHours > 0 ? +((u.billedHours / u.billableHours) * 100).toFixed(1) : 0,
  })).sort((a, b) => b.totalHours - a.totalHours);

  sendSuccess(res, result, 'Utilization report fetched');
};

/* ── WIP (Work In Progress) ─────────────────────────────────────── */

exports.getWorkInProgress = async (req, res) => {
  const firmId = getFirmId(req);

  const [unbilledTime, unbilledExpenses] = await Promise.all([
    TimeEntry.find({ firmId, isBillable: true, isBilled: false, isDeleted: { $ne: true } })
      .populate('matterId', 'title matterNumber clientId')
      .populate('userId', 'name')
      .lean(),
    Expense.find({ firmId, isBillable: true, isBilled: false })
      .populate('matterId', 'title matterNumber')
      .lean(),
  ]);

  const timeValue    = +unbilledTime.reduce((s, e) => s + (e.amount || 0), 0).toFixed(2);
  const expenseValue = +unbilledExpenses.reduce((s, e) => s + e.amount, 0).toFixed(2);

  sendSuccess(res, {
    unbilledTime,
    unbilledExpenses,
    summary: {
      timeEntries:  unbilledTime.length,
      timeValue,
      expenseCount: unbilledExpenses.length,
      expenseValue,
      totalWIP:     +(timeValue + expenseValue).toFixed(2),
    },
  }, 'WIP report fetched');
};

/* ── Matter Report ──────────────────────────────────────────────── */

exports.getMatterReport = async (req, res) => {
  const { status, practiceArea, from, to } = req.query;
  const firmId = getFirmId(req);

  const filter = { firmId, isDeleted: { $ne: true } };
  if (status)       filter.status       = status;
  if (practiceArea) filter.practiceArea = practiceArea;
  if (from || to)   Object.assign(filter, dr(from, to, 'openDate'));

  const matters = await Matter.find(filter)
    .populate('clientId', 'firstName lastName company')
    .populate('assignedTo', 'name')
    .lean();

  const byStatus    = groupByField(matters, 'status');
  const byStage     = groupByField(matters, 'stage');
  const byArea      = groupByField(matters, 'practiceArea');
  const byBilling   = groupByField(matters, 'billingType');

  const closed = matters.filter(m => m.status === 'closed' && m.closeDate && m.openDate);
  const avgDaysToClose = closed.length > 0
    ? +(closed.reduce((s, m) => s + (new Date(m.closeDate) - new Date(m.openDate)) / 86400000, 0) / closed.length).toFixed(1)
    : 0;

  sendSuccess(res, {
    total: matters.length,
    byStatus, byStage, byArea, byBilling,
    avgDaysToClose,
    openMatters:   matters.filter(m => m.status === 'active').length,
    closedMatters: closed.length,
    matters: matters.slice(0, 100),
  }, 'Matter report fetched');
};

/* ── Pipeline Report ────────────────────────────────────────────── */

exports.getPipelineReport = async (req, res) => {
  const { from, to } = req.query;
  const firmId = getFirmId(req);

  const leads = await Lead.find({ firmId, isDeleted: { $ne: true }, ...dr(from, to, 'createdAt') }).lean();

  const STAGES = ['New Lead','Contacted','Consultation Scheduled','Proposal Sent','Hired','Not Hired'];
  const funnel = STAGES.map(stage => ({
    stage,
    count: leads.filter(l => l.stage === stage).length,
    value: leads.filter(l => l.stage === stage).reduce((s, l) => s + (l.estimatedValue || 0), 0),
  }));

  const total   = leads.length || 1;
  const hired   = leads.filter(l => l.stage === 'Hired').length;
  const convRate = +((hired / total) * 100).toFixed(1);

  const converted = leads.filter(l => l.isConverted && l.convertedToContactId && l.createdAt);
  const avgDaysToHire = converted.length > 0
    ? +(converted.reduce((s, l) => {
        const diff = (new Date(l.updatedAt) - new Date(l.createdAt)) / 86400000;
        return s + diff;
      }, 0) / converted.length).toFixed(1)
    : 0;

  const totalPipelineValue = leads.filter(l => !['Hired','Not Hired'].includes(l.stage))
    .reduce((s, l) => s + (l.estimatedValue || 0), 0);

  sendSuccess(res, {
    funnel, convRate, avgDaysToHire, totalPipelineValue,
    total, hired, lost: leads.filter(l => l.stage === 'Not Hired').length,
  }, 'Pipeline report fetched');
};

/* ── Lead Source Report ─────────────────────────────────────────── */

exports.getLeadSourceReport = async (req, res) => {
  const { from, to } = req.query;
  const firmId = getFirmId(req);

  const leads = await Lead.find({ firmId, isDeleted: { $ne: true }, ...dr(from, to, 'createdAt') }).lean();

  const sourceMap = {};
  leads.forEach(l => {
    const src = l.source || 'Unknown';
    if (!sourceMap[src]) sourceMap[src] = { source: src, total: 0, hired: 0, value: 0 };
    sourceMap[src].total++;
    if (l.stage === 'Hired') sourceMap[src].hired++;
    sourceMap[src].value += l.estimatedValue || 0;
  });

  const result = Object.values(sourceMap).map(s => ({
    ...s,
    convRate: s.total > 0 ? +((s.hired / s.total) * 100).toFixed(1) : 0,
  })).sort((a, b) => b.total - a.total);

  sendSuccess(res, result, 'Lead source report fetched');
};

/* ── Custom Reports (Saved) ─────────────────────────────────────── */

exports.createCustomReport = async (req, res) => {
  const report = await SavedReport.create({ ...req.body, firmId: getFirmId(req), createdBy: req.user._id });
  sendSuccess(res, report, 'Custom report saved', 201);
};

exports.updateCustomReport = async (req, res) => {
  const report = await SavedReport.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    req.body, { new: true, runValidators: true }
  );
  if (!report) return sendError(res, 'Report not found', 404);
  sendSuccess(res, report, 'Report updated');
};

exports.deleteCustomReport = async (req, res) => {
  const report = await SavedReport.findOneAndDelete({ _id: req.params.id, firmId: getFirmId(req) });
  if (!report) return sendError(res, 'Report not found', 404);
  sendSuccess(res, null, 'Report deleted');
};

exports.listCustomReports = async (req, res) => {
  const reports = await SavedReport.find({ firmId: getFirmId(req) }).sort({ updatedAt: -1 }).lean();
  sendSuccess(res, reports, 'Custom reports fetched');
};

exports.runCustomReport = async (req, res) => {
  const report = await SavedReport.findOne({ _id: req.params.id, firmId: getFirmId(req) });
  if (!report) return sendError(res, 'Report not found', 404);

  report.lastRunAt = new Date();
  await report.save();

  sendSuccess(res, { report, message: 'Custom report runner not yet implemented — use specific endpoints above.' }, 'Report config returned');
};

exports.scheduleReport = async (req, res) => {
  const { frequency, dayOfWeek, dayOfMonth, hour, recipients } = req.body;
  const report = await SavedReport.findOneAndUpdate(
    { _id: req.params.id, firmId: getFirmId(req) },
    { schedule: { frequency: frequency || 'none', dayOfWeek, dayOfMonth, hour: hour || 8, recipients: recipients || [] } },
    { new: true }
  );
  if (!report) return sendError(res, 'Report not found', 404);
  sendSuccess(res, report, 'Schedule saved');
};

exports.exportReport = async (req, res) => {
  sendSuccess(res, { message: 'Export via CSV is handled client-side from any report endpoint.' }, 'Export info');
};

/* ── Legacy aliases ─────────────────────────────────────────────── */
exports.summary         = exports.getFullSummary;
exports.revenueByPeriod = exports.getRevenueReport;
exports.utilizationReport = exports.getUtilizationReport;
