import { createI18n } from '../shared/i18n';
import { en } from './en';
import { fr } from './fr';

export type Key = keyof typeof fr;
export const dictionaries = { fr: fr as Record<Key, string>, en };
export const { I18nProvider, useI18n } = createI18n<Key>(dictionaries, 'morel:lang');
