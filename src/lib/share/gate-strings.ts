// Chuỗi màn NHẬP MẬT KHẨU chia sẻ (self-contained — trang công khai ngoài [locale], không có
// next-intl provider). Dùng chung cho /share (báo cáo social) và /share/video (phân tích kịch bản).
import { locales } from '@/i18n/config';

export interface GateStr {
  badge: string; // nhãn tag
  protTitle: string; // tiêu đề bảng thương hiệu
  protNote: string; // dòng trấn an
  action: string; // tiêu đề biểu mẫu + chữ trên nút
  prompt: string; // hướng dẫn nhập
  pwLabel: string; // nhãn ô mật khẩu
  pwPlaceholder: string; // placeholder ô mật khẩu
  errWrong: string; // sai mật khẩu
  errRate: string; // thử quá nhiều lần
  metaLocked: string; // mô tả OG khi khóa
}

export const GATE: Record<string, GateStr> = {
  vi: {
    badge: 'Bảo mật',
    protTitle: 'Nội dung được bảo vệ',
    protNote: 'Nội dung này chỉ dành cho người được cấp mật khẩu truy cập.',
    action: 'Xem nội dung',
    prompt: 'Nhập mật khẩu được cung cấp để tiếp tục.',
    pwLabel: 'Mật khẩu',
    pwPlaceholder: 'Nhập mật khẩu',
    errWrong: 'Mật khẩu không đúng. Vui lòng thử lại.',
    errRate: 'Thử quá nhiều lần. Đợi một phút rồi thử lại.',
    metaLocked: 'Nội dung được bảo vệ bằng mật khẩu — cần mật khẩu để xem.',
  },
  en: {
    badge: 'Protected',
    protTitle: 'Content is protected',
    protNote: 'This content is only available to people with the access password.',
    action: 'View content',
    prompt: 'Enter the password you were given to continue.',
    pwLabel: 'Password',
    pwPlaceholder: 'Enter password',
    errWrong: 'Incorrect password. Please try again.',
    errRate: 'Too many attempts. Wait a minute and try again.',
    metaLocked: 'This content is password-protected — a password is required to view it.',
  },
  zh: {
    badge: '受保护',
    protTitle: '内容受保护',
    protNote: '此内容仅向持有访问密码的人开放。',
    action: '查看内容',
    prompt: '请输入您获得的密码以继续。',
    pwLabel: '密码',
    pwPlaceholder: '输入密码',
    errWrong: '密码不正确，请重试。',
    errRate: '尝试次数过多，请稍等一分钟后重试。',
    metaLocked: '此内容受密码保护 — 需要密码才能查看。',
  },
  ja: {
    badge: '保護中',
    protTitle: 'コンテンツは保護されています',
    protNote: 'このコンテンツはアクセスパスワードをお持ちの方のみ閲覧できます。',
    action: 'コンテンツを見る',
    prompt: '続行するには、提供されたパスワードを入力してください。',
    pwLabel: 'パスワード',
    pwPlaceholder: 'パスワードを入力',
    errWrong: 'パスワードが正しくありません。もう一度お試しください。',
    errRate: '試行回数が多すぎます。1分ほど待ってから再度お試しください。',
    metaLocked: 'このコンテンツはパスワードで保護されています — 閲覧にはパスワードが必要です。',
  },
  ko: {
    badge: '보호됨',
    protTitle: '콘텐츠가 보호되어 있습니다',
    protNote: '이 콘텐츠는 접근 비밀번호를 가진 사람만 볼 수 있습니다.',
    action: '콘텐츠 보기',
    prompt: '계속하려면 제공받은 비밀번호를 입력하세요.',
    pwLabel: '비밀번호',
    pwPlaceholder: '비밀번호 입력',
    errWrong: '비밀번호가 올바르지 않습니다. 다시 시도하세요.',
    errRate: '시도 횟수가 너무 많습니다. 잠시 후 다시 시도하세요.',
    metaLocked: '이 콘텐츠는 비밀번호로 보호되어 있습니다 — 보려면 비밀번호가 필요합니다.',
  },
  fr: {
    badge: 'Protégé',
    protTitle: 'Contenu protégé',
    protNote: "Ce contenu n'est accessible qu'aux personnes disposant du mot de passe.",
    action: 'Voir le contenu',
    prompt: 'Saisissez le mot de passe qui vous a été fourni pour continuer.',
    pwLabel: 'Mot de passe',
    pwPlaceholder: 'Saisir le mot de passe',
    errWrong: 'Mot de passe incorrect. Veuillez réessayer.',
    errRate: 'Trop de tentatives. Attendez une minute puis réessayez.',
    metaLocked: 'Ce contenu est protégé par mot de passe — un mot de passe est requis pour le consulter.',
  },
  de: {
    badge: 'Geschützt',
    protTitle: 'Inhalt ist geschützt',
    protNote: 'Dieser Inhalt ist nur für Personen mit dem Zugangspasswort verfügbar.',
    action: 'Inhalt ansehen',
    prompt: 'Geben Sie das erhaltene Passwort ein, um fortzufahren.',
    pwLabel: 'Passwort',
    pwPlaceholder: 'Passwort eingeben',
    errWrong: 'Falsches Passwort. Bitte erneut versuchen.',
    errRate: 'Zu viele Versuche. Warten Sie eine Minute und versuchen Sie es erneut.',
    metaLocked: 'Dieser Inhalt ist passwortgeschützt — zum Ansehen ist ein Passwort erforderlich.',
  },
  id: {
    badge: 'Terlindungi',
    protTitle: 'Konten dilindungi',
    protNote: 'Konten ini hanya tersedia bagi orang yang memiliki kata sandi akses.',
    action: 'Lihat konten',
    prompt: 'Masukkan kata sandi yang diberikan untuk melanjutkan.',
    pwLabel: 'Kata sandi',
    pwPlaceholder: 'Masukkan kata sandi',
    errWrong: 'Kata sandi salah. Silakan coba lagi.',
    errRate: 'Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi.',
    metaLocked: 'Konten ini dilindungi kata sandi — kata sandi diperlukan untuk melihatnya.',
  },
  hi: {
    badge: 'सुरक्षित',
    protTitle: 'सामग्री सुरक्षित है',
    protNote: 'यह सामग्री केवल उन लोगों के लिए उपलब्ध है जिनके पास एक्सेस पासवर्ड है।',
    action: 'सामग्री देखें',
    prompt: 'जारी रखने के लिए आपको दिया गया पासवर्ड दर्ज करें।',
    pwLabel: 'पासवर्ड',
    pwPlaceholder: 'पासवर्ड दर्ज करें',
    errWrong: 'गलत पासवर्ड। कृपया पुनः प्रयास करें।',
    errRate: 'बहुत अधिक प्रयास। एक मिनट रुकें और फिर से प्रयास करें।',
    metaLocked: 'यह सामग्री पासवर्ड से सुरक्षित है — इसे देखने के लिए पासवर्ड आवश्यक है।',
  },
  th: {
    badge: 'ได้รับการป้องกัน',
    protTitle: 'เนื้อหาได้รับการป้องกัน',
    protNote: 'เนื้อหานี้เปิดให้เฉพาะผู้ที่มีรหัสผ่านเข้าถึงเท่านั้น',
    action: 'ดูเนื้อหา',
    prompt: 'กรอกรหัสผ่านที่ได้รับเพื่อดำเนินการต่อ',
    pwLabel: 'รหัสผ่าน',
    pwPlaceholder: 'กรอกรหัสผ่าน',
    errWrong: 'รหัสผ่านไม่ถูกต้อง โปรดลองอีกครั้ง',
    errRate: 'พยายามมากเกินไป โปรดรอสักครู่แล้วลองใหม่',
    metaLocked: 'เนื้อหานี้ได้รับการป้องกันด้วยรหัสผ่าน — ต้องใช้รหัสผ่านเพื่อดู',
  },
};

// Chọn locale an toàn (fallback 'vi') cho map tự chứa ở trên.
export function pickGateLocale(loc: string): string {
  return (locales as readonly string[]).includes(loc) ? loc : 'vi';
}
