import { EmailPayload } from '../types/index.js';
import { logger } from '../utils/logger.js';

let sendEmailFn: ((payload: EmailPayload) => Promise<void>) | null = null;

async function initSendGrid() {
  const sgMail = await import('@sendgrid/mail');
  sgMail.default.setApiKey(process.env.SENDGRID_API_KEY!);
  return async (payload: EmailPayload) => {
    await sgMail.default.send({
      to: payload.to,
      from: {
        email: process.env.FROM_EMAIL ?? 'noreply@trackzen.app',
        name: process.env.FROM_NAME ?? 'TrackZen',
      },
      subject: payload.subject,
      html: payload.html,
    });
  };
}

async function initSES() {
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const client = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  return async (payload: EmailPayload) => {
    const command = new SendEmailCommand({
      Destination: { ToAddresses: [payload.to] },
      Message: {
        Subject: { Data: payload.subject },
        Body: { Html: { Data: payload.html } },
      },
      Source: `${process.env.FROM_NAME ?? 'TrackZen'} <${process.env.FROM_EMAIL ?? 'noreply@trackzen.app'}>`,
    });
    await client.send(command);
  };
}

async function getEmailSender(): Promise<(payload: EmailPayload) => Promise<void>> {
  if (sendEmailFn) return sendEmailFn;

  const provider = process.env.EMAIL_PROVIDER ?? 'sendgrid';
  if (provider === 'ses') {
    sendEmailFn = await initSES();
  } else {
    sendEmailFn = await initSendGrid();
  }
  return sendEmailFn;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  try {
    const sender = await getEmailSender();
    await sender(payload);
    logger.info({ to: payload.to, subject: payload.subject }, 'Email sent');
  } catch (err) {
    logger.error({ err, to: payload.to }, 'Failed to send email');
  }
}
