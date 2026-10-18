/** MarkdownRenderer does not attach Obsidian's note navigation to a custom ItemView. */
export function internalNoteLink(target: EventTarget | null, root: HTMLElement): string | undefined {
  const element = target as Element | null;
  if (!element || element.nodeType !== 1 || typeof element.closest !== 'function') return undefined;
  const anchor = element.closest<HTMLAnchorElement>('a.internal-link');
  if (!anchor || !root.contains(anchor)) return undefined;
  const link = (anchor.getAttribute('data-href') || anchor.getAttribute('href') || '').trim();
  if (!link || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)) return undefined;
  return link;
}
