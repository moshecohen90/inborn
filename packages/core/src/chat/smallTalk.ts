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

/**
 * True for a turn the chat answers from the conversation with files attached: a thanks or a greeting
 * (`isAcknowledgement`), or a follow-up of a few words that only asks to go on ("And now", "shorter", "translate it"),
 * with no question mark, no digit and no file word.
 */
export function isPlainChatTurn(text: string): boolean {
  if (isAcknowledgement(text)) return true;
  if (/[?？\p{N}]/u.test(text)) return false;
  const folded = text.normalize("NFKC").toLowerCase().replace(/[’`]/gu, "'").trim();
  if (!folded || FILE_WORD.test(folded) || CONTENT_ASK.test(folded)) return false;
  if (fileAsk(text) === "summary") return false;
  const bare = folded.replace(/[^\p{L}\p{N}\s']+/gu, " ").replace(/\s+/gu, " ").trim();
  const words = wordCount(bare);
  return words > 0 && words <= FOLLOW_UP_MAX_WORDS && FOLLOW_UP.test(bare);
}

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
