// Bộ dịch RIÊNG cho trang onboarding (ngoài [locale], không dùng next-intl). Kế thừa ngôn ngữ
// đã chọn ở trang login (localStorage 'login_locale'). Tự chứa 10 ngôn ngữ như sản phẩm.
import type { Locale } from '@/i18n/config';

export interface OnboardingStrings {
  title: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  submit: string;
  errCreate: string;
  langLabel: string;
}

export const ONBOARDING_STRINGS: Record<Locale, OnboardingStrings> = {
  vi: {
    title: 'Tạo biz đầu tiên của bạn',
    subtitle:
      'Biz là không gian làm việc chứa toàn bộ kết nối, API key, CMS, bài viết, nhân viên và cấu hình email. Bạn có thể tạo thêm biz và mời nhân viên sau.',
    nameLabel: 'Tên biz',
    namePlaceholder: 'Công ty của tôi',
    phone: 'Số điện thoại',
    email: 'Email',
    website: 'Website',
    description: 'Giới thiệu',
    submit: 'Tạo biz & bắt đầu',
    errCreate: 'Không tạo được biz. Vui lòng thử lại.',
    langLabel: 'Ngôn ngữ',
  },
  en: {
    title: 'Create your first biz',
    subtitle:
      'A biz is a workspace that holds all your connections, API keys, CMS, articles, members and email settings. You can create more bizes and invite members later.',
    nameLabel: 'Biz name',
    namePlaceholder: 'My company',
    phone: 'Phone',
    email: 'Email',
    website: 'Website',
    description: 'Introduction',
    submit: 'Create biz & start',
    errCreate: 'Could not create biz. Please try again.',
    langLabel: 'Language',
  },
  zh: {
    title: '创建你的第一个 biz',
    subtitle:
      'biz 是一个工作空间，包含你的所有连接、API 密钥、CMS、文章、成员和邮件设置。你可以稍后创建更多 biz 并邀请成员。',
    nameLabel: 'biz 名称',
    namePlaceholder: '我的公司',
    phone: '电话',
    email: '邮箱',
    website: '网站',
    description: '简介',
    submit: '创建 biz 并开始',
    errCreate: '无法创建 biz。请重试。',
    langLabel: '语言',
  },
  ja: {
    title: '最初の biz を作成',
    subtitle:
      'biz は、すべての接続・APIキー・CMS・記事・メンバー・メール設定を保持するワークスペースです。後で biz を追加したりメンバーを招待できます。',
    nameLabel: 'biz 名',
    namePlaceholder: '私の会社',
    phone: '電話番号',
    email: 'メール',
    website: 'ウェブサイト',
    description: '紹介',
    submit: 'biz を作成して開始',
    errCreate: 'biz を作成できませんでした。もう一度お試しください。',
    langLabel: '言語',
  },
  ko: {
    title: '첫 biz 만들기',
    subtitle:
      'biz는 모든 연결, API 키, CMS, 글, 멤버, 이메일 설정을 담는 워크스페이스입니다. 나중에 biz를 더 만들고 멤버를 초대할 수 있습니다.',
    nameLabel: 'biz 이름',
    namePlaceholder: '내 회사',
    phone: '전화번호',
    email: '이메일',
    website: '웹사이트',
    description: '소개',
    submit: 'biz 만들고 시작',
    errCreate: 'biz를 만들 수 없습니다. 다시 시도해 주세요.',
    langLabel: '언어',
  },
  fr: {
    title: 'Créez votre premier biz',
    subtitle:
      "Un biz est un espace de travail qui contient toutes vos connexions, clés API, CMS, articles, membres et paramètres e-mail. Vous pourrez créer d'autres biz et inviter des membres plus tard.",
    nameLabel: 'Nom du biz',
    namePlaceholder: 'Mon entreprise',
    phone: 'Téléphone',
    email: 'E-mail',
    website: 'Site web',
    description: 'Présentation',
    submit: 'Créer le biz et démarrer',
    errCreate: 'Impossible de créer le biz. Veuillez réessayer.',
    langLabel: 'Langue',
  },
  de: {
    title: 'Erstelle dein erstes Biz',
    subtitle:
      'Ein Biz ist ein Arbeitsbereich mit all deinen Verbindungen, API-Schlüsseln, CMS, Beiträgen, Mitgliedern und E-Mail-Einstellungen. Du kannst später weitere Biz erstellen und Mitglieder einladen.',
    nameLabel: 'Biz-Name',
    namePlaceholder: 'Meine Firma',
    phone: 'Telefon',
    email: 'E-Mail',
    website: 'Website',
    description: 'Vorstellung',
    submit: 'Biz erstellen & starten',
    errCreate: 'Biz konnte nicht erstellt werden. Bitte versuche es erneut.',
    langLabel: 'Sprache',
  },
  id: {
    title: 'Buat biz pertama Anda',
    subtitle:
      'Biz adalah ruang kerja yang menyimpan semua koneksi, kunci API, CMS, artikel, anggota, dan pengaturan email Anda. Anda dapat membuat biz lain dan mengundang anggota nanti.',
    nameLabel: 'Nama biz',
    namePlaceholder: 'Perusahaan saya',
    phone: 'Telepon',
    email: 'Email',
    website: 'Situs web',
    description: 'Perkenalan',
    submit: 'Buat biz & mulai',
    errCreate: 'Tidak dapat membuat biz. Silakan coba lagi.',
    langLabel: 'Bahasa',
  },
  hi: {
    title: 'अपना पहला biz बनाएँ',
    subtitle:
      'biz एक कार्यक्षेत्र है जिसमें आपके सभी कनेक्शन, API कुंजियाँ, CMS, लेख, सदस्य और ईमेल सेटिंग्स होती हैं। आप बाद में और biz बना सकते हैं और सदस्यों को आमंत्रित कर सकते हैं।',
    nameLabel: 'biz नाम',
    namePlaceholder: 'मेरी कंपनी',
    phone: 'फ़ोन',
    email: 'ईमेल',
    website: 'वेबसाइट',
    description: 'परिचय',
    submit: 'biz बनाएँ और शुरू करें',
    errCreate: 'biz नहीं बन सका। कृपया पुनः प्रयास करें।',
    langLabel: 'भाषा',
  },
  th: {
    title: 'สร้าง biz แรกของคุณ',
    subtitle:
      'biz คือพื้นที่ทำงานที่เก็บการเชื่อมต่อ, คีย์ API, CMS, บทความ, สมาชิก และการตั้งค่าอีเมลทั้งหมดของคุณ คุณสามารถสร้าง biz เพิ่มและเชิญสมาชิกได้ภายหลัง',
    nameLabel: 'ชื่อ biz',
    namePlaceholder: 'บริษัทของฉัน',
    phone: 'โทรศัพท์',
    email: 'อีเมล',
    website: 'เว็บไซต์',
    description: 'แนะนำ',
    submit: 'สร้าง biz และเริ่ม',
    errCreate: 'สร้าง biz ไม่สำเร็จ โปรดลองอีกครั้ง',
    langLabel: 'ภาษา',
  },
};
