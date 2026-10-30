const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(SMTP_PORT || '587', 10),
      secure: SMTP_SECURE === 'true',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  } else {
    // Development fallback transporter (logs to console or creates test account)
    transporter = null;
  }
  return transporter;
}

/**
 * Send an email alert to the admin with the captured webcam intruder image attached
 */
async function sendIntruderAlert({ emailAttempted, failureReason, ipAddress, userAgent, attemptCount, photoPath, timestamp }) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'admin@college.edu';
  const mailTransporter = getTransporter();

  const formattedTime = timestamp ? new Date(timestamp).toLocaleString() : new Date().toLocaleString();

  const attachments = [];
  let inlineImgTag = '';

  if (photoPath && fs.existsSync(photoPath)) {
    attachments.push({
      filename: `intruder_${Date.now()}.jpg`,
      path: photoPath,
      cid: 'intruder_photo'
    });
    inlineImgTag = `
      <div style="margin: 20px 0; text-align: center;">
        <p style="font-weight: bold; color: #d9534f;">Captured Photo of Person at Terminal:</p>
        <img src="cid:intruder_photo" alt="Captured Intruder" style="max-width: 420px; border-radius: 8px; border: 3px solid #d9534f; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"/>
      </div>
    `;
  }

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 1px solid #e1e4e8; border-radius: 10px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #d9534f 0%, #b52b27 100%); color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; letter-spacing: 0.5px;">🚨 CRITICAL SECURITY ALERT</h1>
        <p style="margin: 6px 0 0; font-size: 15px; opacity: 0.95;">Unauthorized Admin Login Attempt Detected</p>
      </div>

      <div style="padding: 24px 28px; color: #2c3e50;">
        <p style="font-size: 15px; line-height: 1.6;">
          An unauthorized login attempt targeting the <strong>College Bus Route Optimizer</strong> administrative portal was intercepted and blocked.
        </p>

        <div style="background: #fff8f8; border-left: 4px solid #d9534f; padding: 14px 18px; margin: 18px 0; border-radius: 0 6px 6px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #555;">Target Account:</td>
              <td style="padding: 6px 0; font-family: monospace; color: #b52b27;">${emailAttempted || 'Unknown'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #555;">Failure Reason:</td>
              <td style="padding: 6px 0; color: #d9534f; font-weight: 600;">${failureReason || 'Invalid credentials'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #555;">Attempt Count:</td>
              <td style="padding: 6px 0;"><strong>${attemptCount}</strong> (Lockout at ${process.env.MAX_FAILED_ATTEMPTS || 5})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #555;">Timestamp:</td>
              <td style="padding: 6px 0;">${formattedTime}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #555;">IP Address:</td>
              <td style="padding: 6px 0; font-family: monospace;">${ipAddress || '127.0.0.1'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; font-weight: bold; color: #555;">Client Device / OS:</td>
              <td style="padding: 6px 0; word-break: break-all; font-size: 13px; color: #666;">${userAgent || 'Unknown Device'}</td>
            </tr>
          </table>
        </div>

        ${inlineImgTag}

        <p style="font-size: 13px; color: #7f8c8d; line-height: 1.5; margin-top: 25px; border-top: 1px solid #eee; padding-top: 15px;">
          Note: This automated notification was dispatched immediately upon breach detection. The physical terminal snapshot has been archived in the secure system audit logs.
        </p>
      </div>
      <div style="background: #f8f9fa; padding: 12px; text-align: center; font-size: 12px; color: #95a5a6;">
        College Bus Route Optimizer Security Subsystem • Automated Dispatch
      </div>
    </div>
  `;

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: process.env.EMAIL_FROM || '"College Bus Security" <no-reply@collegebusoptimizer.edu>',
        to: adminEmail,
        subject: `🚨 SECURITY ALERT: Unauthorized Admin Login Attempt [${failureReason}]`,
        html: htmlContent,
        attachments
      });
      console.log('📧 Intruder alert email sent to admin successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error('⚠️ Could not send alert email via SMTP:', err.message);
      return { success: false, error: err.message };
    }
  } else {
    // If SMTP not configured, simulate by generating an Ethereal test account or logging
    console.log('\n================== 🚨 INTRUDER ALERT EMAIL SIMULATION ==================');
    console.log(`To: ${adminEmail}`);
    console.log(`Subject: 🚨 SECURITY ALERT: Unauthorized Admin Login Attempt [${failureReason}]`);
    console.log(`Attempted Email: ${emailAttempted}`);
    console.log(`IP: ${ipAddress} | Attempt Count: ${attemptCount}`);
    console.log(`Photo Attached: ${photoPath ? photoPath : 'No photo'}`);
    console.log('========================================================================\n');
    return { success: true, simulated: true };
  }
}

module.exports = {
  sendIntruderAlert,
  getTransporter
};
