/**
 * I18N.D.TS — Declaraciones de tipos para i18n.js
 */

export function t(key: string, vars?: Record<string, unknown> | null, defaultValue?: string | null): string;
export function getUrlPrefix(lang?: string): string;
export function getLanguage(): string;
