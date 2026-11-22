import { formatDayRange } from '../../lib/dates';

/**
 * "Share on WhatsApp" — FR-029.
 *
 * Builds a `wa.me` link with prepared text. WhatsApp (or WhatsApp Web) opens,
 * and **the administrator chooses the recipients and presses send**. Nothing
 * is sent automatically, and no WhatsApp Business API is involved.
 *
 * The text is plain: the title, the dates for an event, the body with its
 * formatting removed, and a link to the public News & Events page.
 */

/** The body's text content, without tags, with paragraphs kept apart. */
export function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('p, h2, h3, li').forEach((element) => element.append('\n'));
  doc.querySelectorAll('li').forEach((element) => element.prepend('• '));
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export function whatsAppShareUrl(
  item: { title: string; body: string; event: { startDate: string; endDate: string } | null },
  origin: string,
): string {
  const parts = [`*${item.title}*`];
  if (item.event) parts.push(formatDayRange(item.event.startDate, item.event.endDate));
  parts.push(plainText(item.body));
  parts.push(`${origin}/news`);
  return `https://wa.me/?text=${encodeURIComponent(parts.join('\n\n'))}`;
}
