import type { LocaleMode, TabGroupColor } from './contracts';
import { resolveSupportedLocale } from './locale';

export type AutoGroupPresetLocale = 'en' | 'zh-CN' | 'ja' | 'fr' | 'es' | 'ar' | 'ru' | 'el' | 'ko';

export interface AutoGroupPresetMatchers {
  domains?: string[];
  hostLabels?: string[];
  keywords?: string[];
  paths?: string[];
}

export interface DefaultAutoGroupPreset {
  id: string;
  color: TabGroupColor;
  titles: { en: string; 'zh-CN': string } & Partial<Record<AutoGroupPresetLocale, string>>;
  matchers: AutoGroupPresetMatchers;
}

interface AutoGroupMatchInput {
  hostname?: string;
  url?: string;
  pendingUrl?: string;
  title?: string | null;
}

interface AutoGroupMatchContext {
  hostname: string;
  pathname: string;
  source: string;
  title: string;
}

export const defaultAutoGroupPresets: DefaultAutoGroupPreset[] = [
  createDefaultAutoGroupPreset({
    id: 'shopping',
    color: 'orange',
    titles: { en: 'Shopping', 'zh-CN': '购物', ja: 'ショッピング', fr: 'Achats', es: 'Compras', ar: 'تسوق' },
    matchers: {
      domains: [
        'amazon.com',
        'ebay.com',
        'taobao.com',
        'tmall.com',
        'jd.com',
        'aliexpress.com',
        'temu.com',
        'walmart.com',
        'target.com',
        'costco.com',
        'etsy.com',
        'shopify.com',
        'pinduoduo.com',
        'goofish.com',
        'vip.com',
        'suning.com',
        '1688.com',
        'kaola.com'
      ],
      hostLabels: ['xianyu'],
      paths: ['xiaohongshu.com/store', 'xiaohongshu.com/shop', 'douyin.com/mall']
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'social',
    color: 'pink',
    titles: { en: 'Social', 'zh-CN': '社交', ja: 'ソーシャル', fr: 'Réseaux', es: 'Social', ar: 'تواصل' },
    matchers: {
      domains: [
        'twitter.com',
        'x.com',
        'facebook.com',
        'instagram.com',
        'linkedin.com',
        'reddit.com',
        'discord.com',
        'threads.net',
        'weibo.com',
        'xiaohongshu.com',
        'mastodon.social',
        'bsky.app',
        'zhihu.com',
        'douban.com',
        'tieba.baidu.com',
        'qzone.qq.com',
        'weixin.qq.com',
        'wechat.com'
      ]
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'media',
    color: 'red',
    titles: { en: 'Media', 'zh-CN': '媒体', ja: 'メディア', fr: 'Médias', es: 'Medios', ar: 'وسائط' },
    matchers: {
      domains: [
        'youtube.com',
        'bilibili.com',
        'netflix.com',
        'twitch.tv',
        'spotify.com',
        'soundcloud.com',
        'vimeo.com',
        'primevideo.com',
        'disneyplus.com',
        'hulu.com',
        'youku.com',
        'iqiyi.com',
        'mgtv.com',
        'v.qq.com',
        'ximalaya.com',
        'douyin.com',
        'kuaishou.com',
        'music.163.com',
        'y.qq.com'
      ],
      paths: ['qq.com/video']
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'office',
    color: 'green',
    titles: { en: 'Office', 'zh-CN': '办公', ja: '仕事', fr: 'Bureau', es: 'Oficina', ar: 'عمل' },
    matchers: {
      domains: [
        'notion.so',
        'notion.site',
        'slack.com',
        'teams.microsoft.com',
        'zoom.us',
        'meet.google.com',
        'calendar.google.com',
        'docs.google.com',
        'drive.google.com',
        'outlook.live.com',
        'outlook.office.com',
        'office.com',
        'airtable.com',
        'asana.com',
        'trello.com',
        'linear.app',
        'monday.com',
        'feishu.cn',
        'dingtalk.com',
        'alidrive.com',
        'yuque.com',
        'docs.qq.com',
        'docs.wps.cn',
        'wps.cn',
        'lanhuapp.com',
        'mastergo.com'
      ],
      hostLabels: ['jira', 'confluence']
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'ai',
    color: 'purple',
    titles: { en: 'AI', 'zh-CN': 'AI', ja: 'AI', fr: 'IA', es: 'IA', ar: 'ذكاء اصطناعي' },
    matchers: {
      domains: [
        'openai.com',
        'chatgpt.com',
        'claude.ai',
        'gemini.google.com',
        'perplexity.ai',
        'huggingface.co',
        'midjourney.com',
        'poe.com',
        'moonshot.cn',
        'kimi.moonshot.cn',
        'deepseek.com',
        'zhipuai.cn',
        'metaso.cn'
      ],
      hostLabels: ['tongyi', 'qianwen', 'yuanbao', 'doubao', 'wenxin', 'yiyan'],
      keywords: ['deepseek', 'zhipu', 'chatglm']
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'development',
    color: 'cyan',
    titles: { en: 'Development', 'zh-CN': '开发', ja: '開発', fr: 'Développement', es: 'Desarrollo', ar: 'تطوير' },
    matchers: {
      domains: [
        'github.com',
        'gitlab.com',
        'bitbucket.org',
        'stackoverflow.com',
        'npmjs.com',
        'vercel.com',
        'cloudflare.com',
        'localhost',
        '127.0.0.1',
        'gitee.com',
        'juejin.cn',
        'csdn.net',
        'oschina.net',
        'gitcode.com',
        'apifox.com',
        'swagger.io',
        'postman.com'
      ],
      hostLabels: ['developer']
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'news',
    color: 'grey',
    titles: { en: 'News', 'zh-CN': '新闻', ja: 'ニュース', fr: 'Actualités', es: 'Noticias', ar: 'أخبار' },
    matchers: {
      domains: [
        'news.google.com',
        'nytimes.com',
        'bbc.com',
        'bbc.co.uk',
        'bloomberg.com',
        'reuters.com',
        'theverge.com',
        'wsj.com',
        'sina.com.cn',
        'sohu.com',
        'news.163.com',
        'ifeng.com',
        'guancha.cn',
        'jiemian.com',
        'caixin.com',
        'thepaper.cn'
      ],
      hostLabels: ['news']
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'finance',
    color: 'yellow',
    titles: { en: 'Finance', 'zh-CN': '金融', ja: '金融', fr: 'Finance', es: 'Finanzas', ar: 'مالية' },
    matchers: {
      domains: [
        'paypal.com',
        'stripe.com',
        'coinbase.com',
        'binance.com',
        'robinhood.com',
        'bankofamerica.com',
        'tradingview.com',
        'alipay.com',
        'xueqiu.com',
        'eastmoney.com',
        'futunn.com',
        'futubull.com',
        'tigerbrokers.com',
        'snowball.com',
        'wise.com'
      ],
      hostLabels: ['bank']
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'travel',
    color: 'orange',
    titles: { en: 'Travel', 'zh-CN': '出行', ja: '旅行', fr: 'Voyage', es: 'Viajes', ar: 'سفر' },
    matchers: {
      domains: [
        'airbnb.com',
        'booking.com',
        'expedia.com',
        'trip.com',
        'ctrip.com',
        'agoda.com',
        'skyscanner.com',
        'kayak.com',
        'qunar.com',
        'tongcheng.com',
        'mafengwo.cn',
        'fliggy.com',
        '12306.cn'
      ]
    }
  }),
  createDefaultAutoGroupPreset({
    id: 'learning',
    color: 'green',
    titles: { en: 'Learning', 'zh-CN': '学习', ja: '学習', fr: 'Apprentissage', es: 'Aprendizaje', ar: 'تعلم' },
    matchers: {
      domains: [
        'coursera.org',
        'udemy.com',
        'edx.org',
        'khanacademy.org',
        'icourse163.org',
        'chaoxing.com',
        'zhihuishu.com',
        'runoob.com',
        'w3school.com.cn',
        'leetcode.com',
        'nowcoder.com'
      ],
      hostLabels: ['mooc']
    }
  })
];

export function resolveAutoGroupPresetLocale(
  localeMode: LocaleMode | AutoGroupPresetLocale
): AutoGroupPresetLocale {
  return resolveSupportedLocale(localeMode);
}

function normalizeHostnameValue(value: string): string {
  return value.trim().replace(/^www\./, '').toLowerCase();
}

function normalizePathnameValue(value: string): string {
  const normalized = value.trim().replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  return normalized ? `/${normalized}` : '';
}

function normalizeMatcherValue(value: string): string {
  return value.trim().replace(/^www\./, '').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

function createDefaultAutoGroupPreset(
  preset: DefaultAutoGroupPreset
): DefaultAutoGroupPreset {
  return preset;
}

function buildAutoGroupMatchContext(input: AutoGroupMatchInput): AutoGroupMatchContext {
  const rawUrl = input.url ?? input.pendingUrl ?? '';
  const explicitHostname = input.hostname ? normalizeHostnameValue(input.hostname) : '';
  const title = input.title?.toLowerCase() ?? '';

  try {
    const parsedUrl = new URL(rawUrl);
    const hostname = normalizeHostnameValue(parsedUrl.hostname);
    const pathname = normalizePathnameValue(parsedUrl.pathname);
    return {
      hostname,
      pathname,
      source: `${hostname}${pathname}`,
      title
    };
  } catch {
    return {
      hostname: explicitHostname,
      pathname: '',
      source: explicitHostname,
      title
    };
  }
}

function matchesDomain(hostname: string, domain: string): boolean {
  const normalizedDomain = normalizeMatcherValue(domain);
  if (!normalizedDomain) return false;
  return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
}

function matchesHostLabel(hostname: string, label: string): boolean {
  const normalizedLabel = normalizeMatcherValue(label);
  if (!normalizedLabel) return false;
  return hostname.split('.').includes(normalizedLabel);
}

function matchesPath(context: AutoGroupMatchContext, pathPattern: string): boolean {
  const normalizedPattern = normalizeMatcherValue(pathPattern);
  if (!normalizedPattern) return false;

  const slashIndex = normalizedPattern.indexOf('/');
  if (slashIndex === -1) {
    return matchesDomain(context.hostname, normalizedPattern);
  }

  const domain = normalizedPattern.slice(0, slashIndex);
  const pathPrefix = normalizePathnameValue(normalizedPattern.slice(slashIndex + 1));
  if (!matchesDomain(context.hostname, domain)) return false;
  return pathPrefix === '' || context.pathname === pathPrefix || context.pathname.startsWith(`${pathPrefix}/`);
}

function matchesKeyword(context: AutoGroupMatchContext, keyword: string): boolean {
  const normalizedKeyword = normalizeMatcherValue(keyword);
  if (normalizedKeyword.length < 4) return false;
  return context.source.includes(normalizedKeyword) || context.title.includes(normalizedKeyword);
}

function matchesPresetMatchers(
  preset: DefaultAutoGroupPreset,
  context: AutoGroupMatchContext
): boolean {
  return (
    (preset.matchers.domains ?? []).some((domain) => matchesDomain(context.hostname, domain)) ||
    (preset.matchers.hostLabels ?? []).some((label) => matchesHostLabel(context.hostname, label)) ||
    (preset.matchers.paths ?? []).some((pathPattern) => matchesPath(context, pathPattern)) ||
    (preset.matchers.keywords ?? []).some((keyword) => matchesKeyword(context, keyword))
  );
}

export function matchDefaultAutoGroupPreset(
  input: AutoGroupMatchInput
): DefaultAutoGroupPreset | null {
  const context = buildAutoGroupMatchContext(input);
  return defaultAutoGroupPresets.find((preset) => matchesPresetMatchers(preset, context)) ?? null;
}

export function matchesDefaultAutoGroupPresetById(
  input: AutoGroupMatchInput,
  presetId: string
): boolean {
  const preset = defaultAutoGroupPresets.find((entry) => entry.id === presetId);
  if (!preset) return false;

  const context = buildAutoGroupMatchContext(input);
  return matchesPresetMatchers(preset, context);
}

export function isDefaultAutoGroupPresetTitle(
  preset: DefaultAutoGroupPreset,
  title: string | null | undefined
): boolean {
  if (!title) return false;

  const normalizedTitle = title.trim();
  return Object.values(preset.titles).some((presetTitle) => presetTitle === normalizedTitle);
}

export function getDefaultAutoGroupPresetTitle(
  preset: DefaultAutoGroupPreset,
  localeMode: LocaleMode | AutoGroupPresetLocale
): string {
  const locale = resolveAutoGroupPresetLocale(localeMode);
  return preset.titles[locale] ?? preset.titles.en;
}
