const mongoose = require('mongoose');

const CustomRoleSchema = new mongoose.Schema({
  firmId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:        { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, maxlength: 300 },

  // Flat permission flags — each maps to a controller action
  permissions: {
    // Matters
    'matters:read':   { type: Boolean, default: false },
    'matters:create': { type: Boolean, default: false },
    'matters:update': { type: Boolean, default: false },
    'matters:delete': { type: Boolean, default: false },

    // Contacts
    'contacts:read':   { type: Boolean, default: false },
    'contacts:create': { type: Boolean, default: false },
    'contacts:update': { type: Boolean, default: false },
    'contacts:delete': { type: Boolean, default: false },

    // Billing
    'billing:invoice:read':   { type: Boolean, default: false },
    'billing:invoice:create': { type: Boolean, default: false },
    'billing:invoice:send':   { type: Boolean, default: false },
    'trust:deposit':          { type: Boolean, default: false },
    'trust:transfer':         { type: Boolean, default: false },

    // Time tracking
    'time:read':   { type: Boolean, default: false },
    'time:create': { type: Boolean, default: false },

    // Tasks
    'tasks:read':   { type: Boolean, default: false },
    'tasks:create': { type: Boolean, default: false },
    'tasks:update': { type: Boolean, default: false },

    // Reports
    'reports:read': { type: Boolean, default: false },

    // Leads
    'leads:read':   { type: Boolean, default: false },
    'leads:create': { type: Boolean, default: false },
    'leads:update': { type: Boolean, default: false },

    // E-Sign
    'esign:read':   { type: Boolean, default: false },
    'esign:send':   { type: Boolean, default: false },

    // Firm settings (admin only typically)
    'firm:settings:read':   { type: Boolean, default: false },
    'firm:settings:update': { type: Boolean, default: false },
    'firm:team:manage':     { type: Boolean, default: false },
  },
}, { timestamps: true });

CustomRoleSchema.index({ firmId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('CustomRole', CustomRoleSchema);
