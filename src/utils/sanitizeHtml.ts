const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'H2',
  'H3',
  'P',
  'BR',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'A',
]);

const BLOCKED_SUBTREE_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'MATH',
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeHttpUrl(rawHref: string): string | null {
  const trimmed = rawHref.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, 'https://example.invalid');
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      // Reject relative resolution against dummy origin unless original explicitly had http(s)://
      if (/^https?:\/\//i.test(trimmed)) {
        return parsed.href;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return doc.createTextNode(node.textContent ?? '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as Element;
  const tag = el.tagName.toUpperCase();

  if (BLOCKED_SUBTREE_TAGS.has(tag)) {
    return null;
  }

  // Convert legacy <div> wrappers from contentEditable into <p>
  const normalizedTag = tag === 'DIV' ? 'P' : tag === 'H1' ? 'H2' : tag === 'H4' || tag === 'H5' || tag === 'H6' ? 'H3' : tag;

  if (!ALLOWED_TAGS.has(normalizedTag)) {
    const fragment = doc.createDocumentFragment();
    el.childNodes.forEach((child) => {
      const cleanChild = sanitizeNode(child, doc);
      if (cleanChild) fragment.appendChild(cleanChild);
    });
    return fragment;
  }

  const cleanEl = doc.createElement(normalizedTag.toLowerCase());

  if (normalizedTag === 'A') {
    const safeHref = isSafeHttpUrl(el.getAttribute('href') ?? '');
    if (safeHref) {
      cleanEl.setAttribute('href', safeHref);
      cleanEl.setAttribute('target', '_blank');
      cleanEl.setAttribute('rel', 'noopener noreferrer');
    }
  }

  if (normalizedTag !== 'BR') {
    el.childNodes.forEach((child) => {
      const cleanChild = sanitizeNode(child, doc);
      if (cleanChild) cleanEl.appendChild(cleanChild);
    });
  }

  return cleanEl;
}

export function sanitizeLessonHtml(raw: string): string {
  const input = raw ?? '';
  if (!input.trim()) return '';

  // Preserve plain-text lessons written before rich text support
  const looksLikeHtml = /<\/?[a-z][a-z0-9]*(\s+[^>]*)?>/i.test(input);
  if (!looksLikeHtml) {
    return input
      .split(/\n{2,}/)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  if (typeof DOMParser === 'undefined') {
    return `<p>${escapeHtml(input)}</p>`;
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(input, 'text/html');
  const outDoc = document.implementation.createHTMLDocument('');
  const container = outDoc.createElement('div');

  parsed.body.childNodes.forEach((child) => {
    const clean = sanitizeNode(child, outDoc);
    if (clean) container.appendChild(clean);
  });

  return container.innerHTML;
}

export function stripHtmlToText(raw: string): string {
  const input = raw ?? '';
  if (!input.trim()) return '';
  if (typeof DOMParser === 'undefined') {
    return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const parsed = new DOMParser().parseFromString(input, 'text/html');
  return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
