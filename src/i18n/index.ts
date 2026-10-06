import en from './en.json';

/** Every user-facing string comes from a language file (BRIEF.md §1). Turkish comes later. */
export type MessageKey = keyof typeof en;

/** Looks up a string and fills `{name}` placeholders from `params`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
