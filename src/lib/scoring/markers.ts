// Dấu hiệu ngôn ngữ cho chấm điểm SEO/GEO - hỗ trợ 10 ngôn ngữ app dùng.
// Trước đây các regex chỉ VI/EN → bài ngôn ngữ khác bị chấm sai. Module này gom
// pattern theo locale (luôn kèm English vì nội dung kỹ thuật hay lẫn tiếng Anh).

export interface LocaleMarkers {
  quickAnswer: RegExp; // dấu hiệu đoạn "trả lời nhanh"/tóm tắt
  entity: RegExp; // dấu hiệu định nghĩa "X là ..."
  update: RegExp; // dấu hiệu cập nhật
  question: RegExp; // từ để hỏi (cho heading dạng câu hỏi / Q&A)
}

// Ghép pattern + luôn nối thêm tiếng Anh.
const EN_QUICK = 'in short|quick answer|tl;dr|in summary|key takeaway|bottom line';
const EN_ENTITY = 'is an?|are an?|refers to|is defined as|stands for|means';
const EN_UPDATE = 'updated|last updated';
const EN_Q = 'how|what|why|when|which|who|where|should';

const RAW: Record<string, Omit<Record<keyof LocaleMarkers, string>, never>> = {
  vi: {
    quickAnswer: 'trả lời nhanh|tóm tắt|tóm lại|tl;dr|nói ngắn gọn',
    entity: 'là gì|là một|là những|được hiểu là|được định nghĩa|nghĩa là|định nghĩa',
    update: 'cập nhật|mới nhất',
    question: 'tại sao|làm sao|làm thế nào|khi nào|có nên|là gì|cách|bao nhiêu',
  },
  en: { quickAnswer: '', entity: '', update: '', question: '' },
  zh: {
    quickAnswer: '简而言之|总结|要点|快速回答|概括',
    entity: '是什么|是一种|是指|指的是|定义为|定义',
    update: '更新|最新',
    question: '为什么|如何|怎么|什么|何时|是否',
  },
  ja: {
    quickAnswer: '要するに|要約|結論から|まとめ|一言で',
    entity: 'とは|である|を指す|の定義|意味します',
    update: '更新|アップデート|最終更新',
    question: 'なぜ|どうやって|どのように|いつ|何|べき',
  },
  ko: {
    quickAnswer: '요약|결론부터|한마디로|핵심',
    entity: '란|이란|를 의미|을 의미|정의|이다',
    update: '업데이트|갱신|최신',
    question: '왜|어떻게|무엇|언제|어디|해야',
  },
  fr: {
    quickAnswer: 'en bref|en résumé|réponse rapide|pour résumer|en somme',
    entity: "qu'est-ce que|est une?|sont des?|se réfère|désigne|signifie|défini comme",
    update: 'mis à jour|mise à jour|dernière mise à jour',
    question: 'pourquoi|comment|quand|quel|quelle|combien|devrait',
  },
  de: {
    quickAnswer: 'kurz gesagt|zusammenfassung|schnelle antwort|auf den punkt',
    entity: 'ist eine?|sind|bezeichnet|bedeutet|definiert als|versteht man',
    update: 'aktualisiert|aktualisierung|zuletzt aktualisiert',
    question: 'warum|wie|wann|welche|welcher|wie viele|sollte',
  },
  id: {
    quickAnswer: 'singkatnya|ringkasnya|jawaban singkat|kesimpulan',
    entity: 'adalah|merupakan|didefinisikan|berarti|mengacu pada',
    update: 'diperbarui|pembaruan|terbaru',
    question: 'mengapa|bagaimana|kapan|apa|berapa|haruskah',
  },
  hi: {
    quickAnswer: 'संक्षेप में|सारांश|त्वरित उत्तर|मुख्य बात',
    entity: 'क्या है|एक है|को संदर्भित|का अर्थ|परिभाषित',
    update: 'अपडेट|अद्यतन|नवीनतम',
    question: 'क्यों|कैसे|कब|क्या|कितना|चाहिए',
  },
  th: {
    quickAnswer: 'สรุป|กล่าวโดยย่อ|คำตอบสั้น|ใจความสำคัญ',
    entity: 'คืออะไร|คือ|หมายถึง|นิยาม|อ้างถึง',
    update: 'อัปเดต|ปรับปรุง|ล่าสุด',
    question: 'ทำไม|อย่างไร|เมื่อไร|อะไร|เท่าไร|ควร',
  },
};

function build(base: keyof Omit<Record<keyof LocaleMarkers, string>, never>, loc: string): string {
  const en = { quickAnswer: EN_QUICK, entity: EN_ENTITY, update: EN_UPDATE, question: EN_Q }[base];
  const local = RAW[loc]?.[base] ?? '';
  return [local, en].filter(Boolean).join('|');
}

export function markersFor(locale: string): LocaleMarkers {
  const loc = (locale || 'en').split('-')[0].toLowerCase();
  const safe = RAW[loc] ? loc : 'en';
  return {
    quickAnswer: new RegExp(build('quickAnswer', safe), 'i'),
    entity: new RegExp(build('entity', safe), 'i'),
    update: new RegExp(build('update', safe), 'i'),
    question: new RegExp(build('question', safe), 'i'),
  };
}
