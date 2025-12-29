export function normalizeName(name: string): string {
  if (!name) return '';
  // Lowercase
  let s = name.toLowerCase();
  // Trim
  s = s.trim();
  // Remove leading definite article "the "
  if (s.startsWith('the ')) {
    s = s.slice(4);
  }
  // Remove common quotes and punctuation
  s = s.replace(/["'`.,;:!?#()\[\]{}]/g, ' ');
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function canonicalizeWithType(name: string, type?: string): string {
  const base = normalizeName(name);
  const t = type ? normalizeName(type) : '';
  return t ? `${base}::${t}` : base;
}