import nodemailer from 'nodemailer';

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
