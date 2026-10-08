/**
 * A turn about the conversation, not about the attached files (round 133B). "And now" and "thank you" after a summary
 * of an attached file were held for the index model, searched the file and counted as a documents question; they are
 * plain chat, answered from the conversation alone. A question, a file word or a longer message keeps the file route.
 */
import { fileAsk } from "../rag/wholeFile";

/* Each launch locale and Hebrew, lower-cased and NFKC-folded; longer phrases before their prefixes. */
const PHRASES: readonly string[] = [
  // en
  "thank you so much", "thank you very much", "thanks so much", "thanks a lot", "thanks a ton", "many thanks", "thank you", "thank u", "thanks", "thanx", "thx", "tysm", "ty",
  "much appreciated", "appreciate it", "cheers", "okay", "ok", "okey", "kk", "k", "alright", "all right", "great", "awesome", "perfect", "cool", "nice", "lovely", "excellent",
  "wonderful", "fantastic", "amazing", "brilliant", "got it", "gotcha", "understood", "i see", "makes sense", "sounds good", "very good", "good", "bye", "goodbye", "good bye",
  "see you", "see ya", "later", "good night", "goodnight", "night", "hello", "hey", "hiya", "hi", "good morning", "good afternoon", "good evening",
  // de
  "vielen dank", "danke schön", "dankeschön", "danke sehr", "danke", "alles klar", "super", "toll", "prima", "perfekt", "klasse", "verstanden", "sehr gut", "gut", "tschüss",
  "bis dann", "bis später", "gute nacht", "hallo", "guten morgen", "guten tag", "guten abend", "servus", "moin",
  // es
  "muchas gracias", "mil gracias", "gracias", "vale", "de acuerdo", "genial", "perfecto", "excelente", "estupendo", "entendido", "entiendo", "muy bien", "bien", "adiós", "adios",
  "hasta luego", "chao", "chau", "buenas noches", "hola", "buenos días", "buenos dias", "buenas tardes", "buenas",
  // fr
  "merci beaucoup", "merci bien", "merci", "d'accord", "parfait", "génial", "très bien", "tres bien", "compris", "entendu", "au revoir", "bonne nuit", "à plus", "a plus",
  "salut", "bonjour", "bonsoir", "coucou",
  // pt-BR
  "muito obrigado", "muito obrigada", "obrigado", "obrigada", "brigado", "brigada", "valeu", "beleza", "certo", "entendi", "perfeito", "ótimo", "otimo", "show", "legal",
  "maravilha", "tudo bem", "tchau", "até logo", "ate logo", "até mais", "ate mais", "boa noite", "olá", "ola", "oi", "bom dia", "boa tarde",
  // ja
  "どうもありがとうございます", "ありがとうございます", "ありがとうございました", "ありがとう", "どうも", "サンキュー", "了解です", "了解しました", "了解", "りょうかい", "わかりました",
  "分かりました", "わかった", "なるほど", "いいね", "完璧", "すごい", "素晴らしい", "オッケー", "さようなら", "おやすみなさい", "おやすみ", "またね", "こんにちは", "こんばんは",
  "おはようございます", "おはよう",
  // ko
  "감사합니다", "고맙습니다", "고마워요", "고마워", "감사해요", "땡큐", "알겠습니다", "알겠어요", "알겠어", "알았어요", "알았어", "오케이", "좋아요", "좋아", "완벽해요", "대박",
  "안녕하세요", "안녕히 가세요", "안녕", "잘 자요", "잘자요", "잘 자", "굿나잇",
  // zh-Hant (and the simplified spellings)
  "謝謝你", "謝謝", "谢谢你", "谢谢", "多謝", "多谢", "感謝你", "感謝", "感谢", "好的", "了解", "明白了", "明白", "知道了", "太好了", "很好", "完美", "讚", "赞", "棒",
  "再見", "再见", "晚安", "你好", "哈囉", "早安", "午安",
  // he
  "תודה רבה", "תודה לך", "תודה", "תנקס", "אוקיי", "אוקי", "סבבה", "מעולה", "הבנתי", "יופי", "מצוין", "מצויין", "אחלה", "נהדר", "מושלם", "יפה", "בסדר", "טוב", "ביי",
  "להתראות", "לילה טוב", "שלום", "היי", "הי", "בוקר טוב", "ערב טוב",
];

/* Words that soften a phrase without asking for anything; alone they are not a turn. */
const FILLERS: readonly string[] = [
  "so much", "very much", "a lot", "again", "really", "so", "very", "yes", "yeah", "man", "mate", "buddy", "for the help", "for your help", "for that", "for this", "for everything",
  "for the answer", "for the summary", "for the explanation", "noch mal", "nochmal", "auch", "también", "aussi", "também", "ね", "です", "本当に", "네", "정말", "너무", "非常", "真的",
  "啦", "喔", "哦", "ממש", "אחי", "גם",
];

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/* Alphabetic phrases end at a word edge, so "hi" is not the start of "hiking"; CJK and kana run together without spaces. */
const alternation = (list: readonly string[]): string => [...list].sort((a, b) => b.length - a.length).map(escape).join("|");
const EDGE = "(?![\\p{Script=Latin}\\p{Script=Hebrew}\\p{Script=Hangul}])";
const PHRASE = `(?:${alternation(PHRASES)})${EDGE}`;
const ANY = `(?:${alternation([...PHRASES, ...FILLERS])})${EDGE}`;
const ACK = new RegExp(`^(?:${ANY}\\s*)*${PHRASE}(?:\\s*${ANY})*$`, "u");

/** The most words a thanks or a greeting runs to; a longer message says something more. */
export const ACK_MAX_WORDS = 6;

/** The most words a follow-up runs to ("And now", "shorter", "translate it"). */
export const FOLLOW_UP_MAX_WORDS = 3;

/* What names the attached file or a part of it, in the launch locales and Hebrew; matched anywhere in the folded text, so a prefixed form (בעמוד) still counts. */
const FILE_WORD =
  /page|file|document|\bdocs?\b|pdf|section|chapter|paragraph|attach|appendix|article|clause|seite|datei|dokument|abschnitt|kapitel|absatz|anhang|artikel|p[áa]gina|archivo|secci[óo]n|cap[íi]tulo|p[áa]rrafo|adjunto|art[íi]culo|fichier|chapitre|paragraphe|pi[èe]ce jointe|arquivo|se[çc][ãa]o|par[áa]grafo|anexo|artigo|ページ|頁|ファイル|文書|資料|書類|章|節|段落|添付|条|페이지|쪽|파일|문서|자료|섹션|단락|첨부|챕터|页|檔案|文件|文檔|文档|节|附件|條|עמוד|עמ'|דף|דפים|קובץ|קבצים|מסמך|מסמכים|סעיף|פרק|פסקה|נספח|מצורף/u;
/* Asks for the content that `fileAsk` does not read as one ("resúmelo" keeps its accent there): they keep the file route. */
const CONTENT_ASK = /tl;?dr|res[úu]m/u;
/* A short turn is a follow-up only when every word asks to go on with the conversation; "treason clause" is a search. */
const FOLLOW_UPS: readonly string[] = [
  // en
  "and", "now", "next", "then", "more", "again", "continue", "go on", "keep going", "shorter", "longer", "simpler", "briefer", "go", "on", "simplify", "shorten", "translate", "explain", "repeat",
  "elaborate", "expand", "rephrase", "also", "please", "it", "this", "that", "in", "to", "into", "as", "a", "ok", "okay", "so", "well", "detail", "details", "example", "examples",
  "bullet", "bullets", "points", "list", "english", "hebrew", "spanish", "french", "german", "portuguese", "japanese", "korean", "chinese", "italian", "russian", "arabic",
  // de
  "und", "jetzt", "nun", "weiter", "mehr", "nochmal", "noch mal", "wieder", "kürzer", "länger", "einfacher", "übersetze", "übersetz", "übersetzen", "erkläre", "erklär",
  "erklären", "wiederhole", "ausführlicher", "auch", "bitte", "es", "das", "dies", "auf", "dann", "deutsch", "englisch", "hebräisch",
  // es
  "y", "ahora", "siguiente", "luego", "más", "mas", "otra vez", "de nuevo", "sigue", "continúa", "continua", "corto", "largo", "simple", "traduce", "tradúcelo", "traducir",
  "explica", "explícalo", "repite", "amplía", "también", "por favor", "lo", "esto", "eso", "en", "al", "vale", "bueno", "entonces", "español", "inglés", "hebreo",
  // fr
  "et", "maintenant", "ensuite", "suivant", "puis", "plus", "encore", "continuez", "court", "long", "traduis", "traduire", "explique", "répète", "développe", "aussi",
  "s'il te plaît", "s'il vous plaît", "stp", "svp", "le", "la", "ça", "ca", "cela", "ceci", "alors", "bon", "français", "anglais", "hébreu",
  // pt-BR
  "e", "agora", "próximo", "proximo", "depois", "mais", "de novo", "curto", "longo", "simples", "traduza", "traduz", "traduzir", "explique", "repete", "repita", "também",
  "isso", "isto", "o", "em", "para", "então", "bom", "português", "hebraico",
  // ja
  "そして", "今", "それで", "次は", "次", "もっと", "もう一度", "続けて", "続き", "短く", "長く", "簡単に", "翻訳して", "翻訳", "訳して", "説明して", "説明", "繰り返して", "詳しく", "お願いします",
  "お願い", "ください", "これ", "それ", "も", "に", "を", "で", "じゃあ", "英語", "日本語", "ヘブライ語",
  // ko
  "그리고", "지금", "부탁해", "부탁", "이제", "그다음", "다음", "더", "다시", "계속해", "계속", "짧게", "길게", "쉽게", "번역해줘", "번역해", "설명해줘", "설명해", "반복해", "자세히", "줘", "주세요", "제발",
  "이거", "그거", "영어로", "한국어로", "히브리어로", "그래서", "좋아",
  // zh-Hant (and the simplified spellings)
  "然後呢", "然後", "然后", "現在", "现在", "下一個", "下一个", "接下來", "接下来", "更多", "再一次", "再來", "再", "繼續", "继续", "短一點", "短一点", "長一點", "长一点", "簡單一點",
  "简单一点", "翻譯", "翻译", "解釋", "解释", "重複", "重复", "詳細", "详细", "也", "請", "请", "它", "這個", "这个", "那個", "那个", "成", "英文", "中文", "希伯來文", "呢", "吧",
  // he
  "עכשיו", "הבא", "אחר כך", "עוד", "שוב", "המשך", "תמשיך", "תמשיכי", "קצר", "ארוך", "פשוט", "יותר", "תתרגם", "תתרגמי", "תרגם", "תסביר", "תסבירי", "הסבר", "תחזור", "תרחיב",
  "בבקשה", "את", "זה", "זאת", "גם", "אנגלית", "עברית", "לאנגלית", "לעברית", "באנגלית", "בעברית", "אוקיי", "אז", "טוב",
];
/* Hebrew glues "and" (ו), "the" (ה), "in" (ב) and "to" (ל) to the next word: "ועכשיו", "באנגלית". */
const FOLLOW_UP = new RegExp(`^(?:(?:[והבל](?=\\p{Script=Hebrew})|(?:${alternation(FOLLOW_UPS)})${EDGE})\\s*)+$`, "u");
/* Han and kana carry no spaces between words: three characters count as about one word. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

const wordCount = (folded: string): number => {
  const cjk = folded.match(CJK)?.length ?? 0;
  const rest = folded.replace(CJK, " ").trim();
  return (rest ? rest.split(/\s+/u).length : 0) + Math.ceil(cjk / 3);
};

/* Round 134A: "shorter" after a summary got "You're welcome!" while it shared the thanks' reply line and short plan. */
export type PlainChatKind = "acknowledgement" | "follow-up";

/** The most words a rework of the previous answer runs to ("make it 3 bullet points", "translate it to French"). */
export const REWORK_MAX_WORDS = 8;

/* Round 134G: Build 39 sent "make it 3 bullet points" and "translate it to French" to the file. A rework is an imperative
   transformation verb that refers back with it / that / this (or the locale's own form), with any target after it. */
const L = "(?<!\\p{L})";
const R = "(?!\\p{L})";
const lead = (softeners: string): string => `^(?:(?:${softeners})[\\s,]+)*`;
const REWORKS: readonly RegExp[] = [
  // en
  new RegExp(
    `${lead("please|pls|now|and|ok|okay|so|also|just|then|can you|could you|would you")}(?:make|turn|rewrite|rephrase|reword|shorten|condense|expand|lengthen|translate|summari[sz]e|simplify|put|convert|format|reformat|change|break|cut|trim|redo|write|list|tighten|polish)${R}.*${L}(?:it|that|this|them)${R}`,
    "u",
  ),
  // de
  new RegExp(`${lead("bitte|jetzt|und|dann|nun|kannst du|könntest du")}(?:mach|übersetz|ubersetz|kürz|formulier|schreib|verwandel|wandel|vereinfach|erweiter|fass|gib|bring|stell|setz)\\p{L}*.*${L}(?:es|das|dies|daraus|davon|ihn)${R}`, "u"),
  // es: the pronoun is glued to the verb ("hazlo", "tradúcelo", "traducirlo")
  new RegExp(
    `${lead("ahora|y|por favor|puedes|podrías|podrias|entonces")}(?:haz|trad[uú]ce|convi[eé]rte|pon|simplif[ií]ca|reescr[ií]be|ac[oó]rta|ampl[ií]a|c[aá]mbia|escr[ií]be|p[aá]sa|transf[oó]rma|div[ií]de|d[eé]ja|traducir|hacer|poner|convertir|simplificar|reescribir|acortar|ampliar|cambiar|escribir|pasar|transformar|dividir|dejar)(?:l[oa]s?${R}|${R}.*${L}(?:eso|esto)${R})`,
    "u",
  ),
  // fr: "rends-le", "fais-en", "traduis ça"
  new RegExp(
    `${lead("maintenant|et|alors|puis|s'il te plaît|s'il vous plaît|stp|svp")}(?:rends|traduis|fais|mets|transforme|raccourcis|simplifie|reformule|r[ée][ée]cris|d[ée]veloppe|allonge|condense|convertis|passe|[ée]cris|change)(?:-(?:le|la|les|en)${R}|${R}.*${L}(?:ça|ca|cela|ceci)${R})`,
    "u",
  ),
  // pt-BR: "traduza isso", "transforma-o"
  new RegExp(
    `${lead("agora|e|então|entao|por favor|pode")}(?:fa[çc]a|faz|deixe|deixa|traduz|traduza|transforme|transforma|coloque|coloca|p[õo]e|ponha|simplifique|simplifica|reescreva|reescreve|encurte|encurta|amplie|expanda|mude|muda|converta|escreva)(?:-(?:o|a|lo|la)${R}|${R}.*${L}(?:isso|isto)${R})`,
    "u",
  ),
  // ja, ko, zh-Hant (and the simplified spellings): the pronoun leads and the verb closes the sentence
  /(?:それ|これ|あれ|今の|さっきの|上の).*(?:翻訳|訳し|訳す|箇条書き|短く|長く|簡単に|簡潔に|まとめ|書き直|言い換え|にして|に変え|変えて|直して|詳しく|分かりやすく|わかりやすく)/u,
  /(?:그거|이거|저거|그것|이것|그걸|이걸|방금|위\s?내용).*(?:번역|만들|바꿔|바꾸|줄여|줄이|짧게|길게|쉽게|요약|정리|다시\s?써|고쳐|자세히|간단히|늘려)/u,
  /(?:它|這個|这个|這|这|那個|那个|上面|剛才|刚才).*(?:翻譯|翻译|改成|變成|变成|縮短|缩短|簡化|简化|改寫|改写|重寫|重写|列成|整理成|寫成|写成|做成|擴展|扩展|擴充|扩充|精簡|精简)/u,
  // he
  /^(?:(?:בבקשה|עכשיו|ועכשיו|אפשר|ואפשר|תוכל|תוכלי|אז)\s+)*ו?(?:תעשה|תעשי|עשה|לעשות|תהפוך|תהפכי|הפוך|להפוך|תתרגם|תתרגמי|תרגם|לתרגם|תקצר|תקצרי|קצר|לקצר|תרחיב|תרחיבי|הרחב|להרחיב|תפשט|תפשטי|פשט|לפשט|תנסח|תנסחי|נסח|לנסח|תכתוב|תכתבי|כתוב|לכתוב|תסדר|תסדרי|סדר|לסדר|תחלק|תחלקי|לחלק|תשנה|תשני|שנה|לשנות|תסכם|תסכמי|לסכם|תפרט|תפרטי|לפרט)(?![א-ת]).*(?<![א-ת])(?:זה|זאת|אותו|אותה|אותם|אותן)(?![א-ת])/u,
];
/* "箇条書き" (bullet points) and "條列" (itemize) carry the file word 条/條 ("clause") without naming a file. */
const NOT_FILE_WORDS = /箇条書き|條列|条列/gu;

/**
 * What kind of turn the chat answers from the conversation with files attached: a thanks or a greeting
 * (`isAcknowledgement`), or a follow-up about the previous answer. A follow-up is a few follow-up words ("And now",
 * "shorter", "translate it") with no digit, or a rework of up to eight words ("make it 3 bullet points", "translate it to
 * French") that is not an ask about the file itself ("Summarize it"). Never with a question mark or a file word. Null keeps
 * the file route.
 */
export function plainChatKind(text: string): PlainChatKind | null {
  if (isAcknowledgement(text)) return "acknowledgement";
  if (/[?？]/u.test(text)) return null;
  const folded = text.normalize("NFKC").toLowerCase().replace(/[’`]/gu, "'").trim();
  if (!folded || FILE_WORD.test(folded.replace(NOT_FILE_WORDS, " ")) || CONTENT_ASK.test(folded)) return null;
  if (fileAsk(text) === "summary") return null;
  const bare = folded.replace(/[^\p{L}\p{N}\s']+/gu, " ").replace(/\s+/gu, " ").trim();
  const words = wordCount(bare);
  if (words === 0) return null;
  if (!/\p{N}/u.test(folded) && words <= FOLLOW_UP_MAX_WORDS && FOLLOW_UP.test(bare)) return "follow-up";
  /* An ask about the file names no subject; a rework verb is one, though fileAsk reads "それを3つの箇条書きにして" as "about". */
  return words <= REWORK_MAX_WORDS && REWORKS.some((re) => re.test(folded)) ? "follow-up" : null;
}

/** True when a message names a file, page or section in one of the launch languages or Hebrew ("what does my document say…"). */
export const namesFile = (text: string): boolean => FILE_WORD.test(text.normalize("NFKC").toLowerCase().replace(NOT_FILE_WORDS, " "));

/** True for either kind of plain chat turn: neither one searches the attached files. */
export const isPlainChatTurn = (text: string): boolean => plainChatKind(text) !== null;

/** True for a message that only thanks, agrees, greets or says goodbye, in the eight launch languages and Hebrew. */
export function isAcknowledgement(text: string): boolean {
  if (/[?？]/u.test(text)) return false;
  const folded = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’`]/gu, "'")
    .replace(/[^\p{L}\p{N}\s']+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!folded || folded.length > 40 || folded.split(" ").length > ACK_MAX_WORDS) return false;
  return ACK.test(folded);
}
