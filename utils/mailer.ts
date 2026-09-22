const nodemailer = require('nodemailer');

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure:
    String(process.env.SMTP_SECURE).toLowerCase() === 'true',

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/*
 * --------------------------------------------------
 * Verify SMTP connection
 * --------------------------------------------------
 *
 * This runs when the server starts.
 * It helps identify incorrect SMTP credentials early.
 * --------------------------------------------------
 */
export const verifyMailer = async () => {
  try {
    await transporter.verify();

    console.log(
      '[mailer] SMTP connection verified successfully'
    );
  } catch (error: any) {
    console.error(
      '[mailer] SMTP connection failed:',
      error.message
    );
  }
}


