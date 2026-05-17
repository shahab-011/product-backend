const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

const FROM = process.env.EMAIL_FROM || 'NyayaAI <noreply@nyaya.ai>';

async function sendMail({ to, subject, html, text }) {
  const transport = getTransporter();
  if (!transport) return false; // SMTP not configured — skip silently

  try {
    await transport.sendMail({ from: FROM, to, subject, html, text });
    return true;
  } catch (err) {
    console.error('[email.service] send failed:', err.message);
    return false;
  }
}

async function sendNotificationEmail(recipientEmail, { title, body, link }) {
  const linkHtml = link
    ? `<p style="margin:20px 0"><a href="${link}" style="background:#7C3AED;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;">View Details</a></p>`
    : '';

  return sendMail({
    to: recipientEmail,
    subject: title,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #E5E7EB">
        <h2 style="margin:0 0 12px;font-size:20px;color:#111827">${title}</h2>
        <p style="color:#374151;line-height:1.6;margin:0 0 16px">${body || ''}</p>
        ${linkHtml}
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0"/>
        <p style="font-size:12px;color:#9CA3AF">You are receiving this because you have notifications enabled in NyayaAI.</p>
      </div>`,
    text: `${title}\n\n${body || ''}\n\n${link || ''}`,
  });
}

async function sendDailyDigest(recipientEmail, { userName, tasks, summary }) {
  const taskList = (tasks || []).map(t =>
    `<li style="margin-bottom:6px;color:#374151">${t.title} — due ${t.dueDate || 'today'}</li>`
  ).join('');

  return sendMail({
    to: recipientEmail,
    subject: `Your daily digest — ${new Date().toDateString()}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #E5E7EB">
        <h2 style="margin:0 0 4px;font-size:20px;color:#111827">Good morning, ${userName}!</h2>
        <p style="color:#6B7280;margin:0 0 20px">Here's what needs your attention today.</p>
        ${taskList ? `<h3 style="font-size:14px;color:#374151;margin:0 0 8px">Tasks due today &amp; this week</h3><ul style="padding-left:18px;margin:0 0 20px">${taskList}</ul>` : ''}
        ${summary ? `<p style="color:#374151;line-height:1.6">${summary}</p>` : ''}
        <p style="font-size:12px;color:#9CA3AF;margin-top:24px">Manage your preferences in NyayaAI → Firm Settings → Notifications.</p>
      </div>`,
    text: `Good morning, ${userName}!\n\nTasks due: ${(tasks||[]).map(t=>t.title).join(', ')}\n\n${summary||''}`,
  });
}

module.exports = { sendMail, sendNotificationEmail, sendDailyDigest };
