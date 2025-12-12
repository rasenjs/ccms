import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './resources/en';
import zh from './resources/zh';

function detectLanguage(): 'zh' | 'en' {
  const stored = (typeof localStorage !== 'undefined'
    ? (localStorage.getItem('ccms.language') ?? '')
    : '').toLowerCase();
  if (stored === 'zh' || stored === 'en') return stored;

  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  return lang.startsWith('zh') ? 'zh' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh'],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
