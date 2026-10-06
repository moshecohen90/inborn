/**
 * Questions about an attached file as a whole ("what is this file about?", "summarize it", "quote a sentence").
 * They share no word with any passage and sit under every cosine door, so retrieval alone hands the model nothing
 * and it invents a file (round 93, docs/qa/web-attach-fix). Such a question gets the file's opening instead.
 */
import { bm25Tokens, isCjkFunctionTerm, isStopWord, isWeakTerm } from "./bm25";
import { foldForSearch } from "./text";
import type { Chunk, Embedder, RetrievalHit } from "./types";

/** `embedModel` of a document read by its words only, while no index model is installed. */
export const LEXICAL_INDEX_ID = "lexical";

/** Stands in for the embedder when there is none; a retriever given no vector never calls it. */
export const lexicalEmbedder: Embedder = {
  id: LEXICAL_INDEX_ID,
  embed: () => Promise.reject(new Error("no-embedder")),
};

/* Words that talk about a file rather than about a subject, in every launch locale, folded as bm25Tokens folds them. */
const META_WORDS = new Set(
  [
    "file files document documents doc docs attachment attachments attached pdf docx txt text texts page pages content contents summary summaries summarize summarise summarized describe explain tell say says said quote quotes quoting sentence sentences line lines paragraph paragraphs passage passages excerpt main point points topic topics subject gist overview following bullet bullets bulleted two three four five few takeaway takeaways mean means give list short brief briefly one single key idea ideas thing things something inside contain contains discuss discusses cover covers written write wrote author title please read whats",
    "datei dateien dokument dokuments dokumente dokumentes anhang anhangs inhalt inhalts zusammenfassung zusammen fasse fass zusammenfassen beschreibe beschreib beschreiben erklare erklar erklaren zitiere zitier zitieren zitat satz satze saetze text textes seite seiten thema punkte hauptpunkte kurz eins worum geht handelt steht darin daraus drin sag sage gib bitte diesem diesen mir folgenden folgende stichpunkten stichpunkte drei",
    "fichier fichiers document documents piece pieces jointe contenu resume resumer resumez decris decrire explique expliquer cite citer citez citation phrase phrases texte page pages sujet parle parlent point points principaux principal idee idees dis dit donne extrait une ceci cela ca moi suivant suivants trois",
    "archivo archivos documento documentos adjunto contenido resumen resume resumir resumeme describe describir explica explicar cita citar frase frases texto pagina paginas tema trata habla dime di dame extracto oracion siguiente tres puntos",
    "arquivo arquivos ficheiro documento documentos anexo conteudo resumo resuma resumir descreva descrever explique explicar cite citar frase frases texto pagina paginas assunto tema trata fala diga dele dela disso seguir tres topicos",
  ]
    .join(" ")
    .split(" "),
);

/* Korean is spaced but agglutinative ("파일은", "요약해"): a word is about the file when it starts with one of these. */
const KO_META_STEMS = ["파일", "문서", "첨부", "요약", "내용", "인용", "무엇", "무슨", "어떤", "관한", "관해", "대해", "대한", "문장", "설명", "알려", "말해", "정리", "텍스트", "페이지", "주세요", "인가요", "입니까", "것", "다음", "글머리", "기호", "개의"];
const KO_META_WORDS = new Set(["이", "그", "저", "한", "해", "줘", "뭐", "좀", "하나", "세"]);
const HANGUL = /[가-힯]/u;
const HEBREW = /[\u05D0-\u05EA]/u;

/* Chinese and Japanese are unspaced: these are removed from the question before it is cut into bigrams. */
const CJK_META = [
  "ドキュメント", "テキスト", "箇条書き", "次の", "3つ", "ファイル", "について", "ください", "教えて", "まとめて", "要約", "文書", "書類", "資料", "添付", "内容", "引用", "一文", "文章", "説明", "概要", "書いて", "ページ", "何",
  "一句話", "一句话", "三個", "三个", "重點", "重点", "以下", "文字", "用", "這份", "这份", "文件", "檔案", "档案", "文檔", "文档", "附件", "摘要", "內容", "總結", "总结", "關於", "关于", "什麼", "什么", "說明", "说明", "其中", "句子", "一句", "講", "讲", "寫", "写", "請", "请",
].sort((a, b) => b.length - a.length);

/* Hebrew, the founder's language: "סכם לי את הקובץ", "מה כתוב בקובץ?". Its one-letter prefixes are glued on, so up to two are stripped. */
const HE_META_WORDS = new Set(
  "קובץ קבצים מסמך מסמכים צרופה קישור תוכן טקסט עמוד עמודים דף דפים פסקה משפט משפטים סכם תסכם תסכמי סכמי לסכם סיכום תמצת תמצתי תמצית תקציר כתוב כתובה כתובים נכתב יש נקודות נקודה עיקריות עיקריים עיקרי עיקר מרכזיות מרכזיים מרכזי רעיון רעיונות נושא נושאים מדבר מדברת עוסק עוסקת אומר אומרת לי תן תני תביא ספר תספר תסביר הסבר תאר תתאר צטט ציטוט בבקשה אותו אותה בו בה זה זאת הזה הזאת קצר קצרה בקצרה אחד אחת שלוש שלושה כמה".split(" "),
);
const HE_PREFIX = /^[והבלמשכ]/u;

/* bm25Tokens also yields each word without its first letter ("כתוב" → "תוב"), so that leftover is matched back too. */
const isHebrewMeta = (term: string): boolean => {
  if ([..."והבלמשכ"].some((p) => HE_META_WORDS.has(p + term))) return true;
  for (let w = term, i = 0; i <= 2 && w.length >= 2; i++, w = w.slice(1)) {
    if (HE_META_WORDS.has(w) || (i > 0 && isStopWord(w))) return true;
    if (!HE_PREFIX.test(w)) return false;
  }
  return false;
};

const isMeta = (term: string): boolean => {
  if (META_WORDS.has(term)) return true;
  if (HEBREW.test(term)) return isHebrewMeta(term);
  if (!HANGUL.test(term)) return false;
  return KO_META_WORDS.has(term) || KO_META_STEMS.some((s) => term.startsWith(s));
};

/**
 * True when the question names no subject of its own: every content word is about the file itself. A question with a
 * subject ("when was the heat pump installed?") keeps going through retrieval and its relevance doors.
 */
export function isAboutAttachment(question: string): boolean {
  let q = foldForSearch(question);
  for (const phrase of CJK_META) q = q.split(phrase).join(" ");
  const content = bm25Tokens(q).filter((t) => !isWeakTerm(t) && !isCjkFunctionTerm(t) && !isMeta(t));
  return content.length === 0 && /[\p{L}\p{N}]/u.test(question);
}

/**
 * The opening passages of each attached file in reading order, taken in turn from every file so none is left out.
 * They are ranked by position alone; buildRagPrompt's budget decides how many fit.
 */
export function openingHits(chunksByDoc: Chunk[][], max = 8): RetrievalHit[] {
  const ordered = chunksByDoc.map((chunks) => [...chunks].sort((a, b) => a.page - b.page || a.ord - b.ord));
  const out: RetrievalHit[] = [];
  for (let i = 0; out.length < max && ordered.some((c) => i < c.length); i++) {
    for (const chunks of ordered) {
      const chunk = chunks[i];
      if (chunk && out.length < max) out.push({ chunk, score: 1 / (i + 1), cosine: 0, bm25: 0, bm25Terms: 0 });
    }
  }
  return out;
}
