/** Shared language catalog for the AI translation layer (marketing + app). */
export const LANGUAGES = [
  { code: "EN", g: "en", label: "English", flag: "🇺🇸" },
  { code: "ES", g: "es", label: "Español", flag: "🇪🇸" },
  { code: "PT", g: "pt", label: "Português", flag: "🇧🇷" },
  { code: "FR", g: "fr", label: "Français", flag: "🇫🇷" },
  { code: "DE", g: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "IT", g: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "NL", g: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "PL", g: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "SV", g: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "TR", g: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "AR", g: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "HE", g: "he", label: "עברית", flag: "🇮🇱" },
  { code: "RU", g: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "ZH", g: "zh", label: "中文", flag: "🇨🇳" },
  { code: "JA", g: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "KO", g: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "HI", g: "hi", label: "हिन्दी", flag: "🇮🇳" },
  { code: "VI", g: "vi", label: "Tiếng Việt", flag: "🇻🇳" },
  { code: "TH", g: "th", label: "ไทย", flag: "🇹🇭" },
  { code: "ID", g: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
] as const;

export type LanguageOption = (typeof LANGUAGES)[number];
