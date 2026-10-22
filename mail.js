import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

export async function composeMessage(config, draft) {
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
  const result = await t.sendMail({
    from: { name: config.fromName, address: config.user }, to: draft.to,
    subject: draft.subject, text: draft.text, messageId: draft.messageId,
    date: new Date(draft.sentAt), disableFileAccess: true, disableUrlAccess: true
  });
  return result.message;
}

export function imapOptions(config, password) {
  const host = config.imapHost || config.host;
  return { host, port: 993, secure: true, servername: host,
    auth: { user: config.user, pass: password },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: host },
    logger: false, logRaw: false, disableAutoIdle: true,
    connectionTimeout: 12000, greetingTimeout: 10000, socketTimeout: 20000,
    maxLiteralSize: 1048576, maxResponseSize: 2097152 };
}

export function sentFolder(mailboxes) {
  const selectable = mailboxes.filter(m => !m.flags?.has('\\Noselect'));
  const sent = selectable.filter(m => m.specialUse === '\\Sent');
  if (sent.length === 1) return sent[0].path;
  if (sent.length > 1) throw new Error('Birden fazla Gönderilen klasörü bulundu.');
  const names = ['sent', 'sent items', 'sent messages', 'gönderilen', 'gönderilmiş', 'gönderilen öğeler', 'gönderilmiş öğeler'];
  const matches = selectable.filter(m => names.includes(String(m.name || m.path).toLocaleLowerCase('tr-TR')));
  if (matches.length === 1) return matches[0].path;
  throw new Error('Gönderilen klasörü belirlenemedi.');
}

export async function archiveMessage(config, password, draft, raw, makeClient = options => new ImapFlow(options)) {
  const client = makeClient(imapOptions(config, password));
  // Connection errors also reject the pending operation. Do not log credentials/content.
  client.on('error', () => {});
  try {
    await client.connect();
    const path = sentFolder(await client.list());
    const lock = await client.getMailboxLock(path);
    try {
      const found = await client.search({ header: { 'Message-ID': draft.messageId } }, { uid: true });
      if (!Array.isArray(found)) throw new Error('Kopya kontrolü tamamlanamadı.');
      if (!found.length) {
        const appended = await client.append(path, raw, ['\\Seen'], new Date(draft.sentAt));
        if (!appended) throw new Error('Kopya kaydedilemedi.');
      }
      return { folder: path, existing: found.length > 0 };
    } finally { lock.release(); }
  } finally {
    try { await client.logout(); } catch { client.close(); }
  }
}

export function smtpOptions(config, password) {
  return {
    host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: true, opportunisticTLS: false,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: config.host },
    ...(password === undefined ? {} : { auth: { user: config.user, pass: password } }),
    connectionTimeout: 12000, greetingTimeout: 10000, socketTimeout: 20000, dnsTimeout: 8000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1
  };
}
export function transport(config, password) {
  return nodemailer.createTransport(smtpOptions(config, password));
}
export function validateDraft(input) {
  if (!input || typeof input !== 'object') throw new Error('Mail bilgileri gerekli.');
  const { to, subject, text } = input;
  if (typeof to !== 'string' || to.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(to) || to.includes('..')) throw new Error('Tek bir geçerli alıcı adresi gir.');
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n\x00-\x1f\x7f]/.test(subject)) throw new Error('Konu 1–200 karakter olmalı; satır sonu içeremez.');
  if (typeof text !== 'string' || !text.trim() || text.length > 20000 || text.includes('\0')) throw new Error('Mail metni 1–20.000 karakter olmalı.');
  return { to, subject: subject.trim(), text: text.trim() };
}
