import type { LocaleMode, TabGroupColor } from './contracts';

export type AutoGroupPresetLocale = 'en' | 'zh-CN' | 'ja' | 'fr' | 'es' | 'ar';

export interface DefaultAutoGroupPreset {
  id: string;
  color: TabGroupColor;
  titles: { en: string; 'zh-CN': string } & Partial<Record<AutoGroupPresetLocale, string>>;
  patterns: RegExp[];
}

interface AutoGroupMatchInput {
  hostname?: string;
  url?: string;
  pendingUrl?: string;
  title?: string | null;
}

export const defaultAutoGroupPresets: DefaultAutoGroupPreset[] = [
  {
    id: 'shopping',
    color: 'orange',
    titles: { en: 'Shopping', 'zh-CN': '购物' },
    patterns: [/(amazon|ebay|taobao|tmall|jd\.com|aliexpress|temu|walmart|target|costco|etsy|shopify|pinduoduo|xiaohongshu\.com\/store|xiaohongshu\.com\/shop|xianyu|goofish|vip\.com|suning|douyin\.com\/mall|1688\.com|kaola)/i]
  },
  {
    id: 'social',
    color: 'pink',
    titles: { en: 'Social', 'zh-CN': '社交' },
    patterns: [/(twitter|x\.com|facebook|instagram|linkedin|reddit|discord|threads|weibo|xiaohongshu|mastodon|bsky\.app|zhihu|douban|tieba|qq\.com|wechat|weixin)/i]
  },
  {
    id: 'media',
    color: 'red',
    titles: { en: 'Media', 'zh-CN': '媒体' },
    patterns: [/(youtube|bilibili|netflix|twitch|spotify|soundcloud|vimeo|primevideo|disneyplus|hulu|youku|iqiyi|mgtv|qq\.com\/video|v\.qq\.com|ximalaya|douyin|kuaishou|music\.163|y\.qq\.com)/i]
  },
  {
    id: 'office',
    color: 'green',
    titles: { en: 'Office', 'zh-CN': '办公' },
    patterns: [/(notion|slack|teams|zoom|meet|calendar|docs\.google|drive\.google|outlook|office\.com|airtable|asana|trello|linear|jira|confluence|monday\.com|feishu|dingtalk|alidrive|yuque|docs\.qq\.com|docs\.wps|wps\.cn|lanhuapp|mastergo)/i]
  },
  {
    id: 'ai',
    color: 'purple',
    titles: { en: 'AI', 'zh-CN': 'AI' },
    patterns: [/(openai|chatgpt|claude|gemini|perplexity|huggingface|midjourney|poe\.com|tongyi|qianwen|kimi|moonshot|yuanbao|doubao|deepseek|zhipu|glm|metaso|wenxin|yiyan)/i]
  },
  {
    id: 'development',
    color: 'cyan',
    titles: { en: 'Development', 'zh-CN': '开发' },
    patterns: [/(github|gitlab|bitbucket|stackoverflow|npmjs|vercel|cloudflare|developer|localhost|127\.0\.0\.1|gitee|juejin|csdn|oschina|gitcode|apifox|swagger|postman)/i]
  },
  {
    id: 'news',
    color: 'grey',
    titles: { en: 'News', 'zh-CN': '新闻' },
    patterns: [/(news\.google|nytimes|bbc|bloomberg|reuters|theverge|wsj|news|sina|sohu|163\.com|ifeng|guancha|jiemian|caixin|thepaper)/i]
  },
  {
    id: 'finance',
    color: 'yellow',
    titles: { en: 'Finance', 'zh-CN': '金融' },
    patterns: [/(paypal|stripe|coinbase|binance|robinhood|bank|tradingview|alipay|xueqiu|eastmoney|futunn|futubull|tigerbrokers|snowball|wise)/i]
  },
  {
    id: 'travel',
    color: 'orange',
    titles: { en: 'Travel', 'zh-CN': '出行' },
    patterns: [/(airbnb|booking|expedia|trip\.com|ctrip|agoda|skyscanner|kayak|qunar|tongcheng|mafengwo|fliggy|12306)/i]
  },
  {
    id: 'learning',
    color: 'green',
    titles: { en: 'Learning', 'zh-CN': '学习' },
    patterns: [/(coursera|udemy|edx|khanacademy|mooc|icourse|chaoxing|zhihuishu|runoob|w3school|leetcode|nowcoder)/i]
  }
];

export function resolveAutoGroupPresetLocale(
  localeMode: LocaleMode | AutoGroupPresetLocale
): AutoGroupPresetLocale {
  if (
    localeMode === 'en' ||
    localeMode === 'zh-CN' ||
    localeMode === 'ja' ||
    localeMode === 'fr' ||
    localeMode === 'es' ||
    localeMode === 'ar'
  ) {
    return localeMode;
  }

  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
    const language = chrome.i18n.getUILanguage().toLowerCase();
    if (language.startsWith('zh')) return 'zh-CN';
    if (language.startsWith('ja')) return 'ja';
    if (language.startsWith('fr')) return 'fr';
    if (language.startsWith('es')) return 'es';
    if (language.startsWith('ar')) return 'ar';
    return 'en';
  }

  if (typeof navigator !== 'undefined') {
    const language = navigator.language.toLowerCase();
    if (language.startsWith('zh')) return 'zh-CN';
    if (language.startsWith('ja')) return 'ja';
    if (language.startsWith('fr')) return 'fr';
    if (language.startsWith('es')) return 'es';
    if (language.startsWith('ar')) return 'ar';
    return 'en';
  }

  return 'en';
}

function buildAutoGroupMatchSource(input: AutoGroupMatchInput): string {
  const rawUrl = input.url ?? input.pendingUrl ?? '';
  const explicitHostname = input.hostname?.replace(/^www\./, '').toLowerCase() ?? '';

  try {
    const parsedUrl = new URL(rawUrl);
    const hostname = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();
    const pathname = parsedUrl.pathname.replace(/\/+$/, '').toLowerCase();
    return `${hostname}${pathname}`;
  } catch {
    return explicitHostname;
  }
}

export function matchDefaultAutoGroupPreset(
  input: AutoGroupMatchInput
): DefaultAutoGroupPreset | null {
  const source = buildAutoGroupMatchSource(input);
  return defaultAutoGroupPresets.find((preset) => preset.patterns.some((pattern) => pattern.test(source))) ?? null;
}

export function matchesDefaultAutoGroupPresetById(
  input: AutoGroupMatchInput,
  presetId: string
): boolean {
  const preset = defaultAutoGroupPresets.find((entry) => entry.id === presetId);
  if (!preset) return false;

  const source = buildAutoGroupMatchSource(input);
  return preset.patterns.some((pattern) => pattern.test(source));
}

export function getDefaultAutoGroupPresetTitle(
  preset: DefaultAutoGroupPreset,
  localeMode: LocaleMode | AutoGroupPresetLocale
): string {
  const locale = resolveAutoGroupPresetLocale(localeMode);
  return preset.titles[locale] ?? preset.titles.en;
}
