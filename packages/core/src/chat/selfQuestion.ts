/*
 * Round 134N: a question about the assistant itself is answered by the app, not the model. Asked "tell me about yourself",
 * Fast read its system prompt out (sim 134M2 nf2-08) and Instant named its base model (134M ai3-08); no prompt wording
 * stopped it. The patterns match the whole message, so "what can you do with PDFs" or "who made the Eiffel tower" stay
 * questions for the model.
 */

export type SelfQuestion = "identity" | "capabilities";
/** The language the question was asked in, so the answer is in it whatever the UI locale. */
export type SelfQuestionLang = "en" | "ja" | "de" | "fr" | "es" | "pt-BR" | "ko" | "zh-Hant" | "he";

const OTHER_AI = "(?:chat ?gpt|gpt(?:[- ]?\\d[\\w.]*)?|gemini|qwen[\\w.-]*|claude|copilot|llama|siri|alexa|bard|deepseek|mistral)";

const PATTERNS: Record<SelfQuestionLang, { greeting: RegExp; identity: RegExp; capabilities: RegExp }> = {
  en: {
    greeting: /^(?:(?:hey|hi|hello|ok|okay|so|um|hmm|yo|and|but|please|quick question)(?=[\s,!.:-]|$)[\s,!.:-]*)+/,
    identity: new RegExp(
      `^(?:who|what) (?:are|r) (?:you|u)(?: exactly| really)?$|^(?:tell me|talk) about (?:yourself|you)$|^(?:please )?(?:introduce|describe) yourself$|^what(?:'s| is) (?:this app|inborn|this assistant)$|^what app is this$|^who (?:made|built|created|developed|trained|wrote) (?:you|this app)$|^who(?:'s| is) your (?:creator|developer|maker)$|^(?:what|which) (?:ai |language )?(?:model|llm) (?:are you|is this|do you use|are you running|powers you)$|^are you (?:an? )?(?:${OTHER_AI}|ai|bot|robot|human|a real person)$|^what(?:'s| is) your name$`,
    ),
    capabilities: /^what (?:can|could) (?:you|u) (?:do|help (?:me )?with)$|^what are you (?:able to do|good at|for)$|^what do you do$|^how (?:can|could) you help(?: me)?$|^what are your (?:capabilities|features|skills)$|^what can i (?:ask|do with) you$|^what (?:can|does) this app do$/,
  },
  ja: {
    greeting: /^(?:(?:こんにちは|こんばんは|おはよう(?:ございます)?|やあ|ねえ|あの)[\s、,!！]*)+/,
    identity: new RegExp(
      `^(?:あなた|君|きみ)(?:は|って)?(?:誰|だれ|何者|なにもの|何|なに)(?:ですか|なの|なんですか|ですの)?$|^(?:誰|だれ)(?:ですか)?$|^自己紹介(?:して|してください|をして(?:ください)?)$|^(?:あなた|君)(?:のこと|について)(?:を)?教えて(?:ください)?$|^この(?:アプリ|アシスタント)(?:は|って)(?:何|なに|なん)(?:ですか|なの|ですの)?$|^(?:誰|だれ)が(?:あなた|君|このアプリ)を(?:作った|作りました|開発した)(?:の|んですか|か)?$|^(?:あなた|君)を(?:作った|開発した)のは(?:誰|だれ)(?:ですか)?$|^(?:あなた|君)?(?:は)?(?:何|なん|どの)(?:の)?モデル(?:ですか|なの)?$|^(?:あなた|君)(?:は|って)${OTHER_AI}(?:ですか|なの)?$|^(?:あなたの)?名前は(?:何|なん)?(?:ですか)?$`,
      "i",
    ),
    capabilities: /^(?:あなた|君)?(?:は)?(?:何|なに)が(?:できる|できます)(?:の|か|ますか)?$|^(?:あなた|君)?(?:は)?(?:何|なに)を手伝(?:える|えます|ってくれる)(?:の|か)?$|^できることは(?:何|なに)?(?:ですか)?$|^(?:どう|どのように)手伝ってくれる(?:の)?$/,
  },
  de: {
    greeting: /^(?:(?:hallo|hey|hi|na|also|ok|okay|sag mal|bitte)(?=[\s,!.:-]|$)[\s,!.:-]*)+/,
    identity: new RegExp(
      `^(?:wer|was) (?:bist du|sind sie)$|^(?:erzähl|erzähle|erzählen sie)(?: mir)?(?: etwas| was)? (?:von|über) (?:dir|dich|ihnen|sich)$|^(?:stell dich|stelle dich|stellen sie sich) (?:mal )?vor$|^was ist (?:das )?(?:diese|das für eine) app$|^was ist inborn$|^wer hat (?:dich|sie|diese app) (?:gemacht|entwickelt|gebaut|erstellt|programmiert)$|^welches (?:ki-)?modell (?:bist du|sind sie|ist das|benutzt du|verwendest du)$|^(?:bist du|sind sie) (?:ein |eine )?(?:${OTHER_AI}|ki|bot|roboter|ein mensch|mensch)$|^wie heißt du$|^wie heißen sie$`,
    ),
    capabilities: /^was (?:kannst du|können sie)(?: alles)?(?: tun| machen)?$|^wobei (?:kannst du|können sie)(?: mir)? helfen$|^wie (?:kannst du|können sie) mir helfen$|^was kann (?:diese app|inborn)(?: alles)?$/,
  },
  fr: {
    greeting: /^(?:(?:salut|bonjour|bonsoir|coucou|hé|hey|dis|dites|alors|ok|euh)(?=[\s,!.:-]|$)[\s,!.:-]*)+/,
    identity: new RegExp(
      `^(?:qui|qu'est-ce que) (?:es-tu|es tu|êtes-vous|êtes vous|tu es)$|^tu es qui$|^(?:présente-toi|présente toi|présentez-vous|présentez vous)$|^parle(?:-moi| moi|z-moi) de (?:toi|vous)$|^(?:c'est quoi|qu'est-ce que c'est que|quelle est) cette (?:app|appli|application)$|^c'est quoi inborn$|^qui (?:t'a|vous a) (?:créé|crée|fait|conçu|développé|programmé)$|^quel modèle (?:es-tu|es tu|êtes-vous|utilises-tu|tu utilises|est-ce)$|^(?:es-tu|es tu|tu es|êtes-vous) (?:un |une )?(?:${OTHER_AI}|ia|bot|robot|humain)$|^comment (?:tu t'appelles|t'appelles-tu|vous appelez-vous)$`,
    ),
    capabilities: /^(?:que (?:peux-tu|peux tu|pouvez-vous) faire|qu'est-ce que (?:tu peux|vous pouvez) faire|tu (?:peux|sais) faire quoi|(?:en quoi|comment) (?:peux-tu|pouvez-vous|tu peux) m'aider|que sais-tu faire)$/,
  },
  es: {
    greeting: /^(?:(?:hola|oye|oiga|buenas|buenos días|ok|vale|bueno|che)(?=[\s,!.:-]|$)[\s,!.:-]*)+/,
    identity: new RegExp(
      `^¿?(?:qui[eé]n|qu[eé]) (?:eres|sos|es usted)(?: tú| vos)?$|^¿?(?:preséntate|presentate|preséntese)$|^¿?(?:háblame|hablame|cuéntame|cuentame) (?:sobre|de|acerca de) ti$|^¿?qu[eé] es (?:esta|esa) (?:app|aplicación|aplicacion)$|^¿?qu[eé] es inborn$|^¿?qui[eé]n te (?:cre[oó]|hizo|desarroll[oó]|program[oó]|entren[oó])$|^¿?qu[eé] modelo (?:eres|usas|es este)$|^¿?eres (?:un |una )?(?:${OTHER_AI}|ia|bot|robot|humano)$|^¿?c[oó]mo te llamas$`,
    ),
    capabilities: /^¿?(?:qu[eé] (?:puedes|sabes) hacer|en qu[eé] (?:me )?puedes ayudar(?:me)?|c[oó]mo (?:me )?puedes ayudar(?:me)?|qu[eé] haces)$/,
  },
  "pt-BR": {
    greeting: /^(?:(?:oi|olá|ola|e aí|e ai|ei|bom dia|boa tarde|boa noite|ok|então)(?=[\s,!.:-]|$)[\s,!.:-]*)+/,
    identity: new RegExp(
      `^(?:quem|o que) (?:é você|é vc|és tu|você é|vc é)$|^(?:fale|fala|me fale|me fala|conte|me conte|me conta) (?:sobre|de) (?:você|vc|ti)$|^(?:se apresente|apresente-se|apresenta-te|se apresenta)$|^(?:que app é esse|que aplicativo é esse|o que é (?:esse|este) (?:app|aplicativo))$|^o que é (?:o )?inborn$|^quem (?:te|o) (?:criou|fez|desenvolveu|programou|treinou)$|^qual (?:modelo você é|modelo vc é|é o seu modelo|modelo você usa)$|^(?:você é|vc é) (?:o |a |um |uma )?(?:${OTHER_AI}|ia|bot|robô|robo|humano)$|^(?:qual (?:é )?o seu nome|como (?:você|vc) se chama)$`,
    ),
    capabilities: /^(?:o que (?:você|vc) (?:pode|sabe) fazer|o que (?:você|vc) faz|(?:como|em que) (?:você|vc) (?:pode|consegue) me ajudar|como (?:você|vc) pode ajudar)$/,
  },
  ko: {
    greeting: /^(?:(?:안녕(?:하세요)?|저기요?|야|음)[\s,!.~]*)+/,
    identity: new RegExp(
      `^(?:너는|넌|당신은|너)\\s*(?:누구|뭐)(?:야|예요|에요|세요|니|입니까|인가요)$|^누구(?:세요|야|예요|십니까)$|^자기\\s*소개\\s*(?:해\\s*줘|해\\s*주세요|좀 해\\s*줘|해봐)$|^(?:너|당신)에\\s*대해\\s*(?:알려|말해|소개해)\\s*(?:줘|주세요)$|^(?:이 앱은|이건|이거)\\s*(?:뭐|무슨 앱|어떤 앱)(?:야|예요|에요|이야|인가요|니)$|^누가\\s*(?:너를|당신을|이 앱을)?\\s*(?:만들었어|만들었어요|만들었나요|개발했어|개발했나요)$|^(?:너는|넌|당신은)?\\s*(?:무슨|어떤)\\s*모델(?:이야|이에요|인가요|이니|입니까)$|^(?:너|넌|당신은?)\\s*${OTHER_AI}(?:야|예요|이야|이에요|인가요|니)$|^(?:너|당신)?\\s*이름이\\s*(?:뭐야|뭐예요|뭐에요|뭐니|무엇인가요)$`,
      "i",
    ),
    capabilities: /^(?:너는|넌|당신은)?\s*(?:뭘|뭐|무엇을|무엇)\s*(?:할 수 있어|할 수 있어요|할 수 있나요|할 수 있니|할 수 있습니까)$|^할 수 있는\s*(?:게|것은|건)\s*(?:뭐야|뭐예요|뭐에요|무엇인가요)$|^(?:뭘|무엇을|어떻게)\s*도와\s*(?:줄|드릴|주실)\s*수\s*있(?:어|어요|나요|니)$/,
  },
  "zh-Hant": {
    greeting: /^(?:(?:你好|您好|嗨|哈囉|哈喽|喂|請問|请问)[\s,，!！。]*)+/,
    identity: new RegExp(
      `^(?:你|您)是(?:誰|谁|什麼|什么)(?:呢|啊|呀)?$|^(?:請|请)?(?:介紹|介绍)(?:一下)?(?:你|您)?自己(?:吧)?$|^自我(?:介紹|介绍)(?:一下)?$|^(?:這|这)是(?:什麼|什么)(?:app|應用|应用|程式|程序|軟體|软件)$|^(?:這個|这个)(?:app|應用|应用|程式|程序)是(?:什麼|什么)$|^(?:誰|谁)(?:做|開發|开发|創造|创造|製作|制作)了(?:你|您)$|^(?:你|您)是(?:誰|谁)(?:做|開發|开发|製作|制作|創造|创造)的$|^(?:你|您)是(?:什麼|什么|哪個|哪个)模型$|^(?:你|您)(?:用|使用)(?:什麼|什么|哪個|哪个)模型$|^(?:你|您)是${OTHER_AI}(?:嗎|吗)$|^(?:你|您)叫(?:什麼|什么)(?:名字)?$`,
      "i",
    ),
    capabilities: /^(?:你|您)(?:能|會|会|可以)(?:做|幹|干)(?:什麼|什么)(?:呢)?$|^(?:你|您)(?:能|可以)(?:幫|帮)(?:我)?(?:做)?(?:什麼|什么)(?:呢)?$|^(?:你|您)有(?:什麼|什么)功能$/,
  },
  he: {
    greeting: /^(?:(?:היי|הי|שלום|אהלן|הלו|יו|רגע|תגיד|תגידי|בבקשה)(?=[\s,!.:-]|$)[\s,!.:-]*)+/,
    identity: new RegExp(
      `^(?:מי|מה) (?:אתה|את)(?: בעצם| בדיוק)?$|^(?:ספר|ספרי|תספר|תספרי) לי (?:על עצמך|עלייך|עליך|קצת על עצמך)$|^(?:הצג|הציגי|תציג|תציגי) את עצמך$|^מה (?:זו|זאת|זה) (?:האפליקציה|האפליקצייה)(?: הזאת| הזו)?$|^מה (?:האפליקציה|האפליקצייה) (?:הזאת|הזו)$|^איזו אפליקציה זו$|^מה זה inborn$|^מי (?:יצר|בנה|פיתח|עשה|תכנת|אימן) (?:אותך|את האפליקציה)$|^(?:איזה|באיזה) מודל (?:אתה|את|אתה משתמש|זה)$|^(?:אתה|את) ${OTHER_AI}$|^(?:אתה|את) (?:צ'אט ג'יפיטי|צאט גיפיטי|ג'מיני|בוט|רובוט|בינה מלאכותית)$|^(?:איך קוראים לך|מה השם שלך|מה שמך)$`,
      "i",
    ),
    capabilities: /^מה (?:אתה|את) (?:יודע|יודעת|יכול|יכולה) לעשות$|^(?:במה|איך) (?:אתה|את) (?:יכול|יכולה) לעזור(?: לי)?$|^במה (?:תוכל|תוכלי) לעזור(?: לי)?$|^מה (?:האפליקציה|אתה) עושה$/,
  },
};

const ORDER = Object.keys(PATTERNS) as SelfQuestionLang[];

const normalized = (text: string): string =>
  text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const stripped = (text: string, greeting: RegExp): string =>
  text
    .replace(greeting, "")
    .replace(/[\s?？!！.。…~,，、:;"«»“”]+$/u, "")
    .replace(/^[\s¿¡,，、]+/u, "")
    .trim();

/** Which self-question `text` is and the language it is asked in; the UI locale's patterns are tried first. */
export function selfQuestionMatch(text: string, locale = "en"): { kind: SelfQuestion; lang: SelfQuestionLang } | null {
  const plain = normalized(text);
  if (!plain || plain.length > 80) return null;
  const first = ORDER.find((l) => l === locale || l.split("-")[0] === locale.split("-")[0]);
  for (const lang of first ? [first, ...ORDER.filter((l) => l !== first)] : ORDER) {
    const p = PATTERNS[lang];
    const q = stripped(plain, p.greeting);
    if (!q) continue;
    if (p.identity.test(q)) return { kind: "identity", lang };
    if (p.capabilities.test(q)) return { kind: "capabilities", lang };
  }
  return null;
}

/** "identity" for who/what are you, this app, who made you, what model, are you ChatGPT; "capabilities" for what can you do; null for anything else. */
export function selfQuestion(text: string, locale = "en"): SelfQuestion | null {
  return selfQuestionMatch(text, locale)?.kind ?? null;
}
