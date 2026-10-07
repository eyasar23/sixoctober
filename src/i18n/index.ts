import en from './en.json';

/** Every user-facing string comes from a language file (BRIEF.md §1). Turkish comes later. */
export type MessageKey = keyof typeof en;

/** Looks up a string and fills `{name}` placeholders from `params`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Same as t() for keys built at run time; unknown keys come back as they are. */
export function tKey(key: string, params: Record<string, string | number> = {}): string {
  return key in en ? t(key as MessageKey, params) : key;
}

/** Every string whose key starts with `prefix.` (word lists like comic.punch.0, comic.punch.1 …). */
export function tList(prefix: string): string[] {
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const key = `${prefix}.${i}`;
    if (!(key in en)) return out;
    out.push(t(key as MessageKey));
  }
}
