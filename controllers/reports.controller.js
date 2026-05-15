const Invoice          = require('../models/Invoice.model');
const TimeEntry        = require('../models/TimeEntry.model');
const Matter           = require('../models/Matter.model');
const Lead             = require('../models/Lead.model');
const TrustTransaction = require('../models/TrustTransaction.model');
const { sendSuccess }  = require('../utils/response');

/* helper – date range filter */
const dateRange = (from, to, field = 'createdAt') => {
  const f = {};
  if (from || to) {
    f[field] = {};
    if (from) f[field].$gte = new Date(from);
    if (to)   f[field].$lte = new Date(to);
  }
  return f;
};

exports.summary = async (req, res) => {
  const { from, to } = req.query;
  const firmId = req.user._id;

  const [invoices, timeEntries, matters, leads] = await Promise.all([
    Invoice.find({ firmId, ...dateRange(from, to, 'issueDate') }).lean(),
    TimeEntry.find({ firmId, ...dateRange(from, to, 'date') }).lean(),
    Matter.find({ firmId }).lean(),
    Lead.find({ firmId, ...dateRange(from, to, 'createdAt') }).lean(),
  ]);

  // Revenue
  const revenue = {
    total:       invoices.reduce((s, i) => s + (i.total || 0), 0),
    collected:   invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0),
    outstanding: invoices.filter(i => ['sent','overdue'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0),
    overdue:     invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.total || 0), 0),
    byMonth:     groupByMonth(invoices, 'issueDate', 'total'),
  };

  // Hours
  const hours = {
    total:    +timeEntries.reduce((s, e) => s + e.hours, 0).toFixed(2),
    billable: +timeEntries.filter(e => e.isBillable).reduce((s, e) => s + e.hours, 0).toFixed(2),
    billed:   +timeEntries.filter(e => e.isBilled).reduce((s, e) => s + e.hours, 0).toFixed(2),
    value:    +timeEntries.reduce((s, e) => s + (e.amount || 0), 0).toFixed(2),
    unbilled: +timeEntries.filter(e => e.isBillable && !e.isBilled).reduce((s, e) => s + (e.amount || 0), 0).toFixed(2),
    byMonth:  groupByMonth(timeEntries, 'date', 'hours'),
  };

  // Matters
  const matterStats = {
    total:    matters.length,
    active:   matters.filter(m => m.status === 'active').length,
    closed:   matters.filter(m => m.status === 'closed').length,
    pending:  matters.filter(m => m.status === 'pending').length,
    byStage:  groupByField(matters, 'stage'),
    byArea:   groupByField(matters, 'practiceArea'),
  };

  // Leads / pipeline
  const leadStats = {
    total:   leads.length,
    won:     leads.filter(l => l.stage === 'Won').length,
    lost:    leads.filter(l => l.stage === 'Lost').length,
    active:  leads.filter(l => !['Won','Lost'].includes(l.stage)).length,
    value:   leads.reduce((s, l) => s + (l.estimatedValue || 0), 0),
    wonValue: leads.filter(l => l.stage === 'Won').reduce((s, l) => s + (l.estimatedValue || 0), 0),
    convRate: leads.length > 0 ? +((leads.filter(l => l.stage === 'Won').length / leads.length) * 100).toFixed(1) : 0,
    byStage: groupByField(leads, 'stage'),
  };

  // Top clients by invoice total
  const clientMap = {};
  invoices.filter(i => i.clientId || i.clientName).forEach(i => {
    const key = (i.clientId || '').toString() || i.clientName;
    if (!clientMap[key]) clientMap[key] = { name: i.clientName || key, total: 0, count: 0 };
    clientMap[key].total += i.total || 0;
    clientMap[key].count++;
  });
  const topClients = Object.values(clientMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Practice area breakdown (by invoiced revenue)
  const areaMap = {};
  matters.forEach(m => {
    const area = m.practiceArea || 'Other';
    if (!areaMap[area]) areaMap[area] = { count: 0 };
    areaMap[area].count++;
  });

  sendSuccess(res, {
    period: { from, to },
    revenue,
    hours,
    matters: matterStats,
    leads:   leadStats,
    topClients,
    practiceAreas: areaMap,
  }, 'Reports summary fetched');
};

exports.revenueByPeriod = async (req, res) => {
  const { from, to, groupBy = 'month' } = req.query;
  const firmId = req.user._id;

  const invoices = await Invoice.find({ firmId, status: 'paid', ...dateRange(from, to, 'paymentDate') }).lean();
  const byPeriod = groupBy === 'month'
    ? groupByMonth(invoices, 'paymentDate', 'total')
    : groupByWeek(invoices, 'paymentDate', 'total');

  sendSuccess(res, byPeriod, 'Revenue by period');
};

exports.utilizationReport = async (req, res) => {
  const { from, to } = req.query;
  const firmId = req.user._id;

  const entries = await TimeEntry.find({ firmId, ...dateRange(from, to, 'date') })
    .populate('userId', 'name').lean();

  const byUser = {};
  entries.forEach(e => {
    const uid  = (e.userId?._id || e.userId || '').toString();
    const name = e.userId?.name || 'Unknown';
    if (!byUser[uid]) byUser[uid] = { name, totalHours: 0, billableHours: 0, totalValue: 0 };
    byUser[uid].totalHours    += e.hours;
    byUser[uid].billableHours += e.isBillable ? e.hours : 0;
    byUser[uid].totalValue    += e.amount || 0;
  });

  Object.values(byUser).forEach(u => {
    u.totalHours    = +u.totalHours.toFixed(2);
    u.billableHours = +u.billableHours.toFixed(2);
    u.utilization   = u.totalHours > 0 ? +((u.billableHours / u.totalHours) * 100).toFixed(1) : 0;
  });

  sendSuccess(res, Object.values(byUser), 'Utilization report fetched');
};

/* ── Helpers ────────────────────────────────────────────────────── */
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

function groupByWeek(items, dateField, valueField) {
  const map = {};
  items.forEach(item => {
    const d   = new Date(item[dateField]);
    if (isNaN(d)) return;
    const day = new Date(d);
    day.setDate(d.getDate() - d.getDay());
    const key = day.toISOString().slice(0, 10);
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
