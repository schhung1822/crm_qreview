export interface LoginStrings {
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  usps: Array<{ title: string; desc: string }>;
  signInTitle: string;
  createTitle: string;
  createAdminTitle: string;
  forgotTitle: string;
  registerNoteFirst: string;
  registerNote: string;
  forgotHint: string;
  name: string;
  email: string;
  password: string;
  passwordHint: string;
  btnSignIn: string;
  btnCreate: string;
  btnForgot: string;
  forgotSent: string;
  forgotLink: string;
  resetTitle?: string;
  resetHint?: string;
  btnReset?: string;
  resetDone?: string;
  resetInvalid?: string;
  verifySent?: string;
  verifySendFail?: string;
  verifyInvalid?: string;
  errUnverified?: string;
  btnResendVerify?: string;
  rememberPassword: string;
  noAccount: string;
  haveAccount: string;
  toSignIn: string;
  toCreate: string;
  errGeneric: string;
  langLabel: string;
}

export const LOGIN_STRINGS: { vi: LoginStrings } = {
  vi: {
    tagline: 'Nền tảng nội dung SEO · AEO · GEO',
    heroTitle: 'Nội dung chuẩn SEO, viết bằng AI',
    heroSubtitle:
      'Nghiên cứu từ khóa, soạn và tối ưu bài bằng AI, chấm điểm SEO/AEO/GEO rồi đăng tự động lên WordPress, Wix và Shopify.',
    usps: [
      { title: 'Báo cáo Social & sàn TMĐT', desc: 'AI mổ xẻ nội dung, đối thủ và sản phẩm.' },
      { title: 'Phân tích kịch bản video', desc: 'Bóc tách hook, công thức, timeline video viral.' },
      { title: 'Viết bài chuẩn SEO · GEO', desc: 'Google xếp hạng và được AI trích dẫn.' },
      { title: 'Tự động internal link & backlink', desc: 'AI nối bài liên quan — không đi link bừa.' },
      { title: 'Phân tích, kế hoạch, viết bằng AI', desc: 'Cả quy trình nội dung trong một luồng.' },
    ],
    signInTitle: 'Đăng nhập',
    createTitle: 'Tạo tài khoản',
    createAdminTitle: 'Tạo tài khoản quản trị',
    forgotTitle: 'Quên mật khẩu',
    registerNoteFirst: 'Lần đầu khởi tạo - tài khoản này là Chủ sở hữu, toàn quyền.',
    registerNote: 'Tạo tài khoản để sử dụng hệ thống.',
    forgotHint: 'Nhập email tài khoản - hệ thống sẽ gửi liên kết đặt lại mật khẩu về email đó.',
    name: 'Họ tên',
    email: 'Email',
    password: 'Mật khẩu',
    passwordHint: 'Tối thiểu 8 ký tự',
    btnSignIn: 'Đăng nhập',
    btnCreate: 'Tạo & đăng nhập',
    btnForgot: 'Gửi liên kết đặt lại',
    forgotSent: 'Nếu email tồn tại, liên kết đặt lại mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.',
    forgotLink: 'Quên mật khẩu?',
    resetTitle: 'Đặt mật khẩu mới',
    resetHint: 'Nhập mật khẩu mới cho tài khoản của bạn.',
    btnReset: 'Đổi mật khẩu',
    resetDone: 'Đổi mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
    resetInvalid: 'Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại.',
    verifySent: 'Đã gửi liên kết kích hoạt. Vui lòng kiểm tra hộp thư và mục spam.',
    verifySendFail: 'Không gửi được email kích hoạt. Vui lòng thử gửi lại.',
    verifyInvalid: 'Liên kết kích hoạt không hợp lệ hoặc đã hết hạn.',
    errUnverified: 'Tài khoản chưa được kích hoạt. Hãy kiểm tra email hoặc gửi lại liên kết.',
    btnResendVerify: 'Gửi lại email kích hoạt',
    rememberPassword: 'Nhớ mật khẩu?',
    noAccount: 'Chưa có tài khoản?',
    haveAccount: 'Đã có tài khoản?',
    toSignIn: 'Đăng nhập',
    toCreate: 'Tạo tài khoản',
    errGeneric: 'Có lỗi xảy ra',
    langLabel: 'Ngôn ngữ',
  },
};
