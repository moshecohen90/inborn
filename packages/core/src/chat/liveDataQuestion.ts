/*
 * Round 134O: a question only live data can answer (today's weather, last night's score, bitcoin right now) is answered by
 * the app: offline, the honest answer is that it cannot check, and Instant made up a forecast 6 times in 9 even with the
 * offline line in its prompt (134N2 sim). Narrow on purpose: a domain word AND a live anchor ("today", "last night",
 * "right now"), a short message, no year, and not a "how does / why / explain" question, so "how do weather forecasts
 * work" or "what was the price of bitcoin in 2010" stay with the model.
 */
import type { SelfQuestionLang } from "./selfQuestion";

export type LiveDataQuestion = "weather" | "news" | "scores" | "prices";

interface Rules {
  greeting: RegExp;
  /** "how do…", "why…", "explain…": a question about the subject, not a request for today's value. */
  about: RegExp;
  anchor: RegExp;
  scores: RegExp;
  prices: RegExp;
  news: RegExp;
  weather: RegExp;
}

const SEP = "(?=[\\s,!.:-]|$)[\\s,!.:-]*";

const RULES: Record<SelfQuestionLang, Rules> = {
  en: {
    greeting: new RegExp(`^(?:(?:hey|hi|hello|ok|okay|so|um|yo|please|quick question)${SEP})+`),
    about: /^(?:how (?:do|does|is|are|can)|why|explain|define|what (?:is|are) (?:a|an|the) (?:weather )?forecasts?\b)|\bhistory of\b|\busually\b|\bon (?:mars|the moon|venus|jupiter)\b/,
    anchor: /\b(?:today|tonight|tomorrow|now|right now|currently|current|at the moment|this (?:morning|afternoon|evening|week|weekend)|latest|live|last night|yesterday|forecast)\b/,
    scores: /\b(?:who won|who(?:'s| is) winning|score|scores|result|results)\b.*\b(?:game|match|race|final)\b|\b(?:game|match|race|final)\b.*\b(?:score|result|won|winner)\b|\b(?:score|scores)\b/,
    prices: /\b(?:price|prices|rate|worth|value|trading at|how much is)\b.*\b(?:bitcoin|btc|ethereum|eth|stocks?|shares?|gold|silver|oil|dollar|euro|usd|eur|nasdaq|dow|s&p)\b|\b(?:bitcoin|btc|ethereum|stocks?|shares?|gold|dollar|euro)\b.*\b(?:price|prices|rate|worth|value|at)\b|\bexchange rates?\b/,
    news: /\b(?:news|headlines)\b/,
    weather: /\b(?:weather|forecast|temperature|rain|raining|snow|snowing|sunny)\b/,
  },
  ja: {
    greeting: /^(?:(?:こんにちは|こんばんは|おはよう(?:ございます)?|ねえ)[\s、,!！]*)+/,
    about: /どうやって|どのように|仕組み|なぜ|とは|説明して|歴史|普段|いつも|火星|月面/,
    anchor: /今日|明日|今夜|今晩|(?:今|いま)(?!年|月|回|度|まで)|現在|最新|昨夜|昨日|今週|週末|ライブ|速報|予報/,
    scores: /(?:勝った|勝者|勝ち|スコア|結果).*(?:試合|ゲーム|レース)|(?:試合|ゲーム|レース).*(?:勝った|勝者|勝ち|スコア|結果)|スコア/,
    prices: /(?:価格|値段|株価|レート|為替|いくら|相場).*(?:ビットコイン|株|金|ドル|ユーロ|円)?|(?:ビットコイン|株|金|ドル|ユーロ).*(?:価格|値段|いくら|相場|レート)|為替|株価/,
    news: /ニュース|見出し/,
    weather: /天気|天候|気温|雨|雪|予報/,
  },
  de: {
    greeting: new RegExp(`^(?:(?:hallo|hey|hi|na|also|ok|okay|sag mal|bitte)${SEP})+`),
    about: /^(?:wie (?:funktioniert|funktionieren|entsteht|entstehen)|warum|erklär|erkläre|was (?:ist|sind) (?:eine?|die) )|\bgeschichte\b|\bnormalerweise\b|\bauf dem mars\b/,
    anchor: /\b(?:heute|morgen|heute abend|heute nacht|jetzt|gerade|aktuell|aktuelle[nrs]?|momentan|diese woche|dieses wochenende|neueste[nrs]?|live|gestern|letzte nacht|vorhersage)\b/,
    scores: /\b(?:gewonnen|gewinnt|spielstand|ergebnis|ergebnisse|steht es)\b.*\b(?:spiel|match|partie|rennen|finale)\b|\b(?:spiel|match|partie|rennen|finale)\b.*\b(?:gewonnen|ergebnis|spielstand)\b|\bspielstand\b/,
    prices: /\b(?:preis|kurs|wert|steht|kostet)\b.*\b(?:bitcoin|btc|aktie|aktien|gold|dollar|euro|dax)\b|\b(?:bitcoin|btc|aktie|aktien|gold|dollar|euro|dax)\b.*\b(?:preis|kurs|wert|steht|kostet)\b|\bwechselkurs\b/,
    news: /\b(?:nachrichten|schlagzeilen|news)\b/,
    weather: /\b(?:wetter|vorhersage|temperatur|regen|regnet|schnee|schneit)\b/,
  },
  fr: {
    greeting: new RegExp(`^(?:(?:salut|bonjour|bonsoir|coucou|hé|hey|dis|alors|ok)${SEP})+`),
    about: /^(?:comment (?:fonctionne|fonctionnent|marche|marchent)|pourquoi|explique|expliquez|qu'est-ce qu'une? )|\bhistoire\b|\bd'habitude\b|\bhabituellement\b|\bsur mars\b/,
    anchor: /\b(?:aujourd'hui|demain|ce soir|maintenant|en ce moment|actuellement|actuel(?:le)?s?|cette semaine|ce week-end|dernières|derniers|en direct|hier soir|hier|prévisions?)\b/,
    scores: /\b(?:gagné|gagne|score|résultat|résultats)\b.*\b(?:match|partie|course|finale)\b|\b(?:match|partie|course|finale)\b.*\b(?:gagné|score|résultat)\b|\bscore\b/,
    prices: /\b(?:prix|cours|vaut|valeur|taux)\b.*\b(?:bitcoin|btc|actions?|l'or|dollar|euro|cac)\b|\b(?:bitcoin|btc|actions?|l'or|dollar|euro)\b.*\b(?:prix|cours|vaut|taux)\b|\btaux de change\b/,
    news: /\b(?:actualités|actus|infos|nouvelles|gros titres)\b/,
    weather: /\b(?:météo|quel temps|température|pluie|pleuvoir|pleut|neige|neiger|prévisions?)\b/,
  },
  es: {
    greeting: new RegExp(`^(?:(?:hola|oye|buenas|ok|vale|bueno)${SEP})+`),
    about: /^¿?(?:c[oó]mo funcionan?|por qu[eé]|expl[ií]ca(?:me)?|qu[eé] es (?:un|una|el) )|\bhistoria\b|\bnormalmente\b|\bsuele\b|\ben marte\b/,
    anchor: /\b(?:hoy|mañana|esta noche|ahora|ahora mismo|actualmente|actual(?:es)?|en este momento|esta semana|este fin de semana|últimas|último|en (?:vivo|directo)|anoche|ayer|pron[oó]stico)\b/,
    scores: /\b(?:gan[oó]|marcador|resultado|resultados|va ganando)\b.*\b(?:partido|juego|carrera|final)\b|\b(?:partido|juego|carrera|final)\b.*\b(?:gan[oó]|marcador|resultado)\b|\bmarcador\b/,
    prices: /\b(?:precio|cotizaci[oó]n|vale|valor|cuesta)\b.*\b(?:bitcoin|btc|acci[oó]n|acciones|oro|d[oó]lar|euro)\b|\b(?:bitcoin|btc|acciones|oro|d[oó]lar|euro)\b.*\b(?:precio|cotizaci[oó]n|vale|cuesta)\b|\btipo de cambio\b/,
    news: /\b(?:noticias|titulares)\b/,
    weather: /\b(?:qu[eé] tiempo|el tiempo|clima|temperatura|lluvia|llover[aá]?|llueve|nieve|nevar[aá]?|pron[oó]stico)\b/,
  },
  "pt-BR": {
    greeting: new RegExp(`^(?:(?:oi|olá|ola|e aí|e ai|ei|bom dia|boa tarde|boa noite|ok)${SEP})+`),
    about: /^(?:como funcionam?|por que|porque|expli(?:que|ca)|o que (?:é|são) (?:uma?|a|o) )|\bhistória\b|\bnormalmente\b|\bcostuma\b|\bem marte\b/,
    anchor: /\b(?:hoje|amanhã|hoje à noite|agora|agora mesmo|atualmente|atual|no momento|nesta semana|esta semana|neste fim de semana|últimas|ao vivo|ontem à noite|ontem|previsão)\b/,
    scores: /\b(?:ganhou|placar|resultado|resultados|venceu)\b.*\b(?:jogo|partida|corrida|final)\b|\b(?:jogo|partida|corrida|final)\b.*\b(?:ganhou|placar|resultado|venceu)\b|\bplacar\b/,
    prices: /\b(?:preço|cotação|vale|valor|custa)\b.*\b(?:bitcoin|btc|ação|ações|ouro|dólar|euro)\b|\b(?:bitcoin|btc|ações|ouro|dólar|euro)\b.*\b(?:preço|cotação|vale|custa)\b|\bcâmbio\b/,
    news: /\b(?:notícias|noticias|manchetes)\b/,
    weather: /\b(?:o tempo|clima|previsão|temperatura|chuva|chover|chovendo|neve)\b/,
  },
  ko: {
    greeting: /^(?:(?:안녕(?:하세요)?|저기요?)[\s,!.~]*)+/,
    about: /어떻게 (?:작동|만들어|되)|원리|왜|설명해|이란|란 무엇|역사|보통|화성/,
    anchor: /오늘|내일|오늘\s*밤|지금|현재|이번\s*주말?|최신|실시간|어젯밤|어제|예보|요즘/,
    scores: /(?:이겼|이긴|승자|점수|스코어|결과).*(?:경기|게임|시합)|(?:경기|게임|시합).*(?:이겼|이긴|승자|점수|스코어|결과)|스코어/,
    prices: /(?:가격|시세|얼마|주가).*(?:비트코인|주식|금값|달러|유로)?|(?:비트코인|주식|금값|달러|유로).*(?:가격|시세|얼마)|환율|주가|금값/,
    news: /뉴스|헤드라인|소식/,
    weather: /날씨|기온|비가|비 와|비 올|눈이|눈 와|눈 올|일기\s*예보|예보/,
  },
  "zh-Hant": {
    greeting: /^(?:(?:你好|您好|嗨|哈囉|請問|请问)[\s,，!！。]*)+/,
    about: /怎麼|怎么|如何運作|如何运作|為什麼|为什么|解釋|解释|原理|是什麼意思|是什么意思|歷史|历史|通常|平常|火星/,
    anchor: /今天|明天|今晚|現在|现在|目前|此刻|這週|这周|本週|本周|週末|周末|最新|即時|实时|直播|昨晚|昨天|預報|预报/,
    scores: /(?:誰贏|谁赢|贏了|赢了|比分|結果|结果).*(?:比賽|比赛|球賽|球赛)?|(?:比賽|比赛|球賽|球赛).*(?:誰贏|谁赢|比分|結果|结果)/,
    prices: /(?:價格|价格|多少錢|多少钱|行情|股價|股价).*|(?:比特幣|比特币|股票|黃金|黄金|美元|歐元|欧元).*(?:價格|价格|多少|行情)|匯率|汇率|股價|股价/,
    news: /新聞|新闻|頭條|头条/,
    weather: /天氣|天气|氣溫|气温|下雨|下雪|預報|预报/,
  },
  he: {
    greeting: new RegExp(`^(?:(?:היי|הי|שלום|אהלן|הלו|רגע|תגיד|תגידי|בבקשה)${SEP})+`),
    about: /^(?:איך (?:עובד|עובדת|עובדים|עובדות|נוצר|נוצרת)|למה|הסבר|תסביר|תסבירי|מה זה )|היסטוריה|בדרך כלל|במאדים/,
    anchor: /היום|מחר|הלילה|עכשיו|כרגע|כעת|השבוע|בסופ"ש|בסוף השבוע|אחרונות|העדכניות|עדכני|בשידור חי|אתמול בלילה|אמש|אתמול|תחזית/,
    scores: /(?:ניצח|ניצחה|ניצחו|תוצאה|תוצאות|תוצאת).*(?:משחק|המשחק|מרוץ|גמר)?|(?:משחק|המשחק|מרוץ|גמר).*(?:ניצח|ניצחה|ניצחו|תוצאה)/,
    prices: /(?:מחיר|שער|שווה|כמה עולה|כמה שווה).*(?:ביטקוין|מניה|מניות|זהב|דולר|יורו)|(?:ביטקוין|מניה|מניות|זהב|דולר|יורו).*(?:מחיר|שער|שווה|עולה)|שער (?:ה)?(?:דולר|יורו|חליפין|יציג)/,
    news: /חדשות|כותרות|מבזק/,
    weather: /מזג (?:ה)?אוויר|תחזית|טמפרטורה|גשם|שלג/,
  },
};

/* `\b` is ASCII-only: "últimas", "câmbio", "aujourd'hui" need a word edge that knows accented letters. */
const W = "[\\p{L}\\p{N}]";
const EDGE = `(?:(?<!${W})(?=${W})|(?<=${W})(?!${W}))`;
const unicode = (r: RegExp): RegExp => new RegExp(r.source.replace(/\\b/g, EDGE), r.flags.includes("u") ? r.flags : `${r.flags}u`);
const COMPILED = Object.fromEntries(
  Object.entries(RULES).map(([lang, r]) => [lang, Object.fromEntries(Object.entries(r).map(([k, re]) => [k, unicode(re)])) as unknown as Rules]),
) as Record<SelfQuestionLang, Rules>;

const ORDER = Object.keys(RULES) as SelfQuestionLang[];
const KINDS = ["scores", "prices", "news", "weather"] as const;
/* "in 2010", "the 1998 final": a past value, which the model may know. */
const YEAR = /(?:^|\D)(?:1[89]|20)\d\d(?:\D|$)/;

const normalized = (text: string): string => text.normalize("NFC").toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();
const stripped = (text: string, greeting: RegExp): string =>
  text.replace(greeting, "").replace(/[\s?？!！.。…~,，、:;"«»“”]+$/u, "").replace(/^[\s¿¡,，、]+/u, "").trim();

/** Which live-data question `text` is and the language it is asked in; the UI locale's rules are tried first. */
export function liveDataQuestionMatch(text: string, locale = "en"): { kind: LiveDataQuestion; lang: SelfQuestionLang } | null {
  const plain = normalized(text);
  if (!plain || plain.length > 80 || YEAR.test(plain)) return null;
  const first = ORDER.find((l) => l === locale || l.split("-")[0] === locale.split("-")[0]);
  for (const lang of first ? [first, ...ORDER.filter((l) => l !== first)] : ORDER) {
    const r = COMPILED[lang];
    const q = stripped(plain, r.greeting);
    if (!q || r.about.test(q) || !r.anchor.test(q)) continue;
    const kind = KINDS.find((k) => r[k].test(q));
    if (kind) return { kind, lang };
  }
  return null;
}

/** "weather" | "news" | "scores" | "prices" for a question only live data answers; null for anything else. */
export function liveDataQuestion(text: string, locale = "en"): LiveDataQuestion | null {
  return liveDataQuestionMatch(text, locale)?.kind ?? null;
}
