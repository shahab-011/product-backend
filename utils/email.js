const nodemailer = require('nodemailer');

function createTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const FROM = `"${process.env.SMTP_FROM_NAME || 'Nyaya Law'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'noreply@nyayalaw.pk'}>`;

async function sendEmail({ to, subject, html, text }) {
  const transporter = createTransporter();
  if (!transporter) {
    // Dev mode — just log
    console.log(`\n📧 EMAIL (dev — no SMTP configured)\nTo: ${to}\nSubject: ${subject}\n${text || ''}\n`);
    return { messageId: 'dev-mode' };
  }
  return transporter.sendMail({ from: FROM, to, subject, html, text });
}

/* ─── OTP email ──────────────────────────────────────────────── */
function sendOTPEmail(to, name, otp) {
  return sendEmail({
    to,
    subject: 'Verify your Nyaya Law account',
    text: `Hi ${name},\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not create this account, please ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#7C3AED;margin-bottom:8px">Verify your email</h2>
        <p style="color:#374151">Hi <strong>${name}</strong>,</p>
        <p style="color:#374151">Enter this code to complete your registration:</p>
        <div style="background:#F5F3FF;border:1.5px solid #DDD6FE;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
          <span style="font-size:36px;font-weight:900;letter-spacing:12px;color:#6D28D9">${otp}</span>
        </div>
        <p style="color:#6B7280;font-size:13px">This code expires in <strong>10 minutes</strong>. If you didn't create this account, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0"/>
        <p style="color:#9CA3AF;font-size:12px">Nyaya Law Platform</p>
      </div>`,
  });
}

/* ─── Password reset email ───────────────────────────────────── */
function sendPasswordResetEmail(to, name, resetUrl) {
  return sendEmail({
    to,
    subject: 'Reset your Nyaya Law password',
    text: `Hi ${name},\n\nClick the link below to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#7C3AED">Reset your password</h2>
        <p style="color:#374151">Hi <strong>${name}</strong>,</p>
        <p style="color:#374151">We received a request to reset your password. Click the button below — this link expires in <strong>1 hour</strong>.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${resetUrl}" style="background:#7C3AED;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Reset Password</a>
        </div>
        <p style="color:#6B7280;font-size:13px">If the button doesn't work, copy this link: <a href="${resetUrl}" style="color:#7C3AED">${resetUrl}</a></p>
        <p style="color:#9CA3AF;font-size:12px">If you didn't request a password reset, you can safely ignore this email.</p>
      </div>`,
  });
}

/* ─── Team invitation email ──────────────────────────────────── */
function sendInvitationEmail(to, inviteeName, firmName, inviteUrl) {
  return sendEmail({
    to,
    subject: `You've been invited to join ${firmName} on Nyaya Law`,
    text: `Hi ${inviteeName},\n\n${firmName} has invited you to join their workspace on Nyaya Law.\n\nAccept invitation: ${inviteUrl}\n\nThis link expires in 7 days.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#7C3AED">You're invited!</h2>
        <p style="color:#374151">Hi <strong>${inviteeName}</strong>,</p>
        <p style="color:#374151"><strong>${firmName}</strong> has invited you to join their Nyaya Law workspace.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${inviteUrl}" style="background:#7C3AED;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Accept Invitation</a>
        </div>
        <p style="color:#9CA3AF;font-size:12px">This invitation expires in 7 days.</p>
      </div>`,
  });
}

/* ─── Account locked alert email ─────────────────────────────── */
function sendAccountLockedEmail(to, name) {
  return sendEmail({
    to,
    subject: 'Your Nyaya Law account has been temporarily locked',
    text: `Hi ${name},\n\nYour account was locked for 15 minutes due to 5 consecutive failed login attempts.\n\nIf this wasn't you, please reset your password immediately.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#DC2626">Account temporarily locked</h2>
        <p style="color:#374151">Hi <strong>${name}</strong>,</p>
        <p style="color:#374151">Your account was locked for <strong>15 minutes</strong> after 5 consecutive failed login attempts.</p>
        <p style="color:#374151">If this was not you, please <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/forgot-password" style="color:#7C3AED">reset your password</a> immediately.</p>
      </div>`,
  });
}

/* ─── Trust payment request ──────────────────────────────────── */
function sendTrustPaymentRequest(to, clientName, { firmName, amount, description, message, payUrl, accountName }) {
  const fmt$ = n => '$' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sendEmail({
    to,
    subject: `${firmName} — Trust Account Payment Request: ${fmt$(amount)}`,
    text: `Hi ${clientName},\n\n${firmName} is requesting a trust account deposit of ${fmt$(amount)}.\n\nPurpose: ${description || '—'}\n${message ? `\n${message}\n` : ''}\nPay here: ${payUrl}\n\nThis link expires in 7 days.\n\n${firmName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#7C3AED;margin-bottom:4px">Trust Account Payment Request</h2>
        <p style="color:#6B7280;font-size:13px;margin-top:0">${firmName}</p>
        <p style="color:#374151">Hi <strong>${clientName}</strong>,</p>
        <p style="color:#374151">Your attorney is requesting a trust account deposit:</p>
        <div style="background:#F5F3FF;border:1.5px solid #DDD6FE;border-radius:12px;padding:20px 24px;margin:20px 0">
          <div style="font-size:32px;font-weight:900;color:#6D28D9;margin-bottom:6px">${fmt$(amount)}</div>
          <div style="font-size:14px;color:#374151"><strong>Account:</strong> ${accountName}</div>
          ${description ? `<div style="font-size:14px;color:#374151;margin-top:4px"><strong>Purpose:</strong> ${description}</div>` : ''}
        </div>
        ${message ? `<p style="color:#374151;font-size:14px;border-left:3px solid #DDD6FE;padding-left:12px;margin:16px 0">${message}</p>` : ''}
        <div style="text-align:center;margin:28px 0">
          <a href="${payUrl}" style="background:#7C3AED;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Pay Now</a>
        </div>
        <p style="color:#6B7280;font-size:12px">If the button doesn't work: <a href="${payUrl}" style="color:#7C3AED">${payUrl}</a></p>
        <p style="color:#9CA3AF;font-size:12px">This link expires in 7 days. If you have questions, contact ${firmName} directly.</p>
      </div>`,
  });
}

/* ─── Invoice payment reminder ───────────────────────────────── */
function sendInvoiceReminder(to, clientName, { firmName, invoiceNumber, amount, dueDate, payUrl, isOverdue }) {
  const fmt$ = n => '$' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dueTxt = dueDate ? new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  const subject = isOverdue
    ? `Overdue Invoice ${invoiceNumber} — ${fmt$(amount)} — ${firmName}`
    : `Payment Reminder: Invoice ${invoiceNumber} due ${dueTxt} — ${firmName}`;
  return sendEmail({
    to,
    subject,
    text: `Hi ${clientName},\n\n${isOverdue ? 'Your invoice is overdue.' : 'This is a reminder that your invoice is due soon.'}\n\nInvoice: ${invoiceNumber}\nAmount Due: ${fmt$(amount)}\nDue Date: ${dueTxt}\n\nPay here: ${payUrl || '—'}\n\n${firmName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:${isOverdue ? '#DC2626' : '#7C3AED'};margin-bottom:4px">${isOverdue ? 'Invoice Overdue' : 'Payment Reminder'}</h2>
        <p style="color:#6B7280;font-size:13px;margin-top:0">${firmName}</p>
        <p style="color:#374151">Hi <strong>${clientName}</strong>,</p>
        <p style="color:#374151">${isOverdue ? 'Your invoice is past due. Please arrange payment at your earliest convenience.' : 'This is a friendly reminder that your invoice is due soon.'}</p>
        <div style="background:${isOverdue ? '#FEF2F2' : '#F5F3FF'};border:1.5px solid ${isOverdue ? '#FECACA' : '#DDD6FE'};border-radius:12px;padding:20px 24px;margin:20px 0">
          <div style="font-size:13px;color:#6B7280;margin-bottom:4px">Invoice ${invoiceNumber}</div>
          <div style="font-size:28px;font-weight:900;color:${isOverdue ? '#DC2626' : '#6D28D9'}">${fmt$(amount)}</div>
          <div style="font-size:13px;color:#374151;margin-top:6px">Due: ${dueTxt}</div>
        </div>
        ${payUrl ? `<div style="text-align:center;margin:24px 0"><a href="${payUrl}" style="background:${isOverdue ? '#DC2626' : '#7C3AED'};color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Pay Now</a></div>` : ''}
        <p style="color:#9CA3AF;font-size:12px">Questions? Contact ${firmName} directly.</p>
      </div>`,
  });
}

/* ─── Invoice sent to client ─────────────────────────────────── */
function sendInvoiceEmail(to, clientName, { firmName, invoiceNumber, amount, dueDate, payUrl, notes }) {
  const fmt$ = n => '$' + Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dueTxt = dueDate ? new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  return sendEmail({
    to,
    subject: `Invoice ${invoiceNumber} from ${firmName} — ${fmt$(amount)} due ${dueTxt}`,
    text: `Hi ${clientName},\n\nPlease find your invoice from ${firmName}.\n\nInvoice: ${invoiceNumber}\nAmount Due: ${fmt$(amount)}\nDue Date: ${dueTxt}\n${notes ? `\nNotes: ${notes}\n` : ''}\nPay online: ${payUrl || '—'}\n\nThank you,\n${firmName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#7C3AED;margin-bottom:4px">Invoice from ${firmName}</h2>
        <p style="color:#374151">Hi <strong>${clientName}</strong>,</p>
        <p style="color:#374151">Please find your invoice details below.</p>
        <div style="background:#F5F3FF;border:1.5px solid #DDD6FE;border-radius:12px;padding:20px 24px;margin:20px 0">
          <div style="font-size:13px;color:#6B7280;margin-bottom:4px">Invoice ${invoiceNumber}</div>
          <div style="font-size:32px;font-weight:900;color:#6D28D9">${fmt$(amount)}</div>
          <div style="font-size:13px;color:#374151;margin-top:6px">Due: ${dueTxt}</div>
        </div>
        ${notes ? `<p style="color:#374151;font-size:13px;border-left:3px solid #DDD6FE;padding-left:12px">${notes}</p>` : ''}
        ${payUrl ? `<div style="text-align:center;margin:24px 0"><a href="${payUrl}" style="background:#7C3AED;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Pay Now</a></div>` : ''}
        ${payUrl ? `<p style="color:#6B7280;font-size:12px">Or copy this link: <a href="${payUrl}" style="color:#7C3AED">${payUrl}</a></p>` : ''}
        <p style="color:#9CA3AF;font-size:12px">Questions? Contact ${firmName} directly.</p>
      </div>`,
  });
}

/* ─── E-sign invitation ──────────────────────────────────────── */
function sendESignInviteEmail(to, signatoryName, { firmName, title, description, sigUrl, expiresAt }) {
  const expTxt = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return sendEmail({
    to,
    subject: `${firmName} is requesting your signature on "${title}"`,
    text: `Hi ${signatoryName},\n\n${firmName} has requested your electronic signature on the following document:\n\n${title}\n${description ? description + '\n' : ''}\nSign here: ${sigUrl}\n${expTxt ? `This link expires on ${expTxt}.\n` : ''}\n${firmName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="color:#4F46E5;margin-bottom:4px">Signature Requested</h2>
        <p style="color:#6B7280;font-size:13px;margin-top:0">${firmName}</p>
        <p style="color:#374151">Hi <strong>${signatoryName}</strong>,</p>
        <p style="color:#374151"><strong>${firmName}</strong> is requesting your electronic signature on the following document:</p>
        <div style="background:#EEF2FF;border:1.5px solid #C7D2FE;border-radius:12px;padding:20px 24px;margin:20px 0">
          <div style="font-size:17px;font-weight:800;color:#312E81">${title}</div>
          ${description ? `<div style="font-size:13px;color:#4338CA;margin-top:6px">${description}</div>` : ''}
        </div>
        <div style="text-align:center;margin:28px 0">
          <a href="${sigUrl}" style="background:#4F46E5;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Review &amp; Sign</a>
        </div>
        <p style="color:#6B7280;font-size:12px">Or copy this link: <a href="${sigUrl}" style="color:#4F46E5">${sigUrl}</a></p>
        ${expTxt ? `<p style="color:#9CA3AF;font-size:12px">This signing link expires on ${expTxt}.</p>` : ''}
        <p style="color:#9CA3AF;font-size:12px">Questions? Contact ${firmName} directly.</p>
      </div>`,
  });
}

module.exports = {
  sendOTPEmail, sendPasswordResetEmail, sendInvitationEmail,
  sendAccountLockedEmail, sendTrustPaymentRequest, sendInvoiceReminder,
  sendInvoiceEmail, sendESignInviteEmail,
};
