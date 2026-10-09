import { diffDays, toDate, fmtLong } from './limitation';

export interface WhatsAppReminderParams {
  phone: string;
  clientName: string;
  matterTitle: string;
  hearingDate: string;
  hearingTime: string;
  court: string;
  purpose: string;
}

export function cleanIndianMobile(phone: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`;
  }
  return null;
}

export function buildWhatsAppLink({
  phone,
  clientName,
  matterTitle,
  hearingDate,
  hearingTime,
  court,
  purpose,
}: WhatsAppReminderParams): { link: string; message: string; validPhone: boolean } {
  const cleanPhone = cleanIndianMobile(phone);

  const message = [
    `Namaste ${clientName || 'Sir/Madam'},`,
    ``,
    `This is a reminder regarding your legal matter:`,
    `*${matterTitle}*`,
    ``,
    `*Next Hearing Details:*`,
    `📅 Date: ${hearingDate}`,
    `⏰ Time: ${hearingTime || '10:30 AM'}`,
    `🏛️ Court: ${court}`,
    `📋 Purpose: ${purpose || 'Hearing'}`,
    ``,
    `Please ensure all requested documents are kept ready. Feel free to contact our office for any clarifications.`,
    ``,
    `Warm regards,`,
    `Legal Office`,
  ].join('\n');

  const encoded = encodeURIComponent(message);
  const link = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  return {
    link,
    message,
    validPhone: !!cleanPhone,
  };
}

export function getHearingUrgency(
  hearingDateIso: string,
  todayIso: string
): { daysLeft: number; label: string; badgeColor: string } {
  const days = diffDays(hearingDateIso, todayIso);
  if (days < 0) {
    return { daysLeft: days, label: 'Past hearing', badgeColor: '#64748b' };
  }
  if (days === 0) {
    return { daysLeft: 0, label: 'Today', badgeColor: '#ef4444' };
  }
  if (days === 1) {
    return { daysLeft: 1, label: 'Tomorrow', badgeColor: '#f97316' };
  }
  if (days <= 7) {
    return { daysLeft: days, label: `In ${days} days`, badgeColor: '#eab308' };
  }
  return { daysLeft: days, label: `In ${days} days`, badgeColor: '#3b82f6' };
}
