import { LIMITS } from "./threads/capabilities";
import type { MediaItem } from "./types";

export function countUniqueLinks(text: string, attachment?: string | null): number {
  const urls = new Set((text.match(/https?:\/\/[^\s]+/gi) ?? []).map((u) => u.replace(/[).,!?]+$/, "").toLowerCase()));
  if (attachment) urls.add(attachment.toLowerCase());
  return urls.size;
}

export function validatePost(p: { text: string; media: MediaItem[]; link_attachment?: string | null }): string[] {
  const errs: string[] = [];
  if (!p.text.trim() && p.media.length === 0) errs.push("Пост порожній: додайте текст або медіа");
  if ([...p.text].length > LIMITS.textMax) errs.push(`Текст довший за ${LIMITS.textMax} символів`);
  if (countUniqueLinks(p.text, p.link_attachment) > LIMITS.maxLinks) errs.push(`Більше ${LIMITS.maxLinks} унікальних посилань`);
  if (p.media.length > LIMITS.carouselMax) errs.push(`Максимум ${LIMITS.carouselMax} медіа в каруселі`);
  if (p.link_attachment && p.media.length) errs.push("link_attachment дозволений лише для текстових постів");
  for (const m of p.media) if (!/^https:\/\//i.test(m.url)) errs.push(`Медіа має бути публічним https URL: ${m.url}`);
  return errs;
}
