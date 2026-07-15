// Sự kiện + nội dung email NỀN TẢNG (SaaS) theo trạng thái khách hàng. Dùng chung EmailTemplate +
// renderTemplate của hệ email theo-biz. {bien} được thay khi gửi.
import type { EmailTemplate } from './templates';

export type PlatformEmailEvent =
  | 'welcome' // tài khoản mới
  | 'paymentPending' // đơn chờ thanh toán (kèm QR + thông tin CK)
  | 'paymentReceived' // đã nhận thanh toán / kích hoạt gói
  | 'trialEnding' // dùng thử sắp hết hạn
  | 'subscriptionCanceled' // gói kết thúc/hủy
  // ── Sự kiện TÀI KHOẢN / TRUY CẬP (trước ở email theo-biz, nay dùng chung nền tảng) ──
  | 'verifyEmail' // xác thực email đăng ký (gửi LINK kích hoạt tài khoản, có hạn)
  | 'registered' // tự đăng ký thành công (gửi SAU khi kích hoạt nếu có bước xác thực)
  | 'forgotPassword' // quên mật khẩu (gửi LINK đặt lại mật khẩu, có hạn)
  | 'userCreated' // admin tạo tài khoản cho nhân viên
  | 'roleChanged'; // đổi vai trò/quyền

// LƯU Ý: tuple `as const` để z.enum() dùng lại được (route admin) - thêm sự kiện mới nhớ thêm cả
// EVENTS + EVENT_VARS ở src/components/admin/PlatformEmailAdmin.tsx và key i18n emailEvent_<ev>.
export const PLATFORM_EMAIL_EVENTS = [
  'welcome',
  'paymentPending',
  'paymentReceived',
  'trialEnding',
  'subscriptionCanceled',
  'verifyEmail',
  'registered',
  'forgotPassword',
  'userCreated',
  'roleChanged',
] as const satisfies readonly PlatformEmailEvent[];

// Biến khả dụng cho từng sự kiện (hiển thị gợi ý ở UI).
export const PLATFORM_EVENT_VARS: Record<PlatformEmailEvent, string[]> = {
  welcome: ['name', 'email', 'appName', 'loginUrl'],
  paymentPending: [
    'name',
    'plan',
    'amount',
    'currency',
    'bankCode',
    'bankAccount',
    'accountHolder',
    'content',
    'qrUrl',
    'orderId',
    'appName',
  ],
  paymentReceived: ['name', 'plan', 'amount', 'currency', 'orderId', 'appName', 'loginUrl'],
  trialEnding: ['name', 'daysLeft', 'appName', 'loginUrl'],
  subscriptionCanceled: ['name', 'plan', 'appName', 'loginUrl'],
  verifyEmail: ['name', 'email', 'verifyUrl', 'appName', 'loginUrl'],
  registered: ['name', 'email', 'appName', 'loginUrl'],
  forgotPassword: ['name', 'email', 'resetUrl', 'appName', 'loginUrl'],
  userCreated: ['name', 'email', 'password', 'role', 'appName', 'loginUrl'],
  roleChanged: ['name', 'email', 'role', 'appName', 'loginUrl'],
};

const T: Record<PlatformEmailEvent, EmailTemplate> = {
  welcome: {
    subject: 'Chào mừng bạn đến với {appName}',
    body: `Xin chào {name},

Cảm ơn bạn đã đăng ký {appName}. Tài khoản của bạn đã sẵn sàng sử dụng.

Đăng nhập tại: {loginUrl}

Đội ngũ {appName}`,
  },
  paymentPending: {
    subject: 'Hướng dẫn thanh toán đơn {orderId} - {appName}',
    body: `Xin chào {name},

Đơn mua gói {plan} của bạn đang chờ thanh toán.
Số tiền: {amount} {currency}

Vui lòng chuyển khoản tới:
- Ngân hàng: {bankCode}
- Số tài khoản: {bankAccount}
- Chủ tài khoản: {accountHolder}
- Nội dung: {content}

Quét mã QR để thanh toán nhanh: {qrUrl}

Đơn sẽ được kích hoạt TỰ ĐỘNG ngay sau khi chúng tôi nhận được thanh toán.

Đội ngũ {appName}`,
  },
  paymentReceived: {
    subject: 'Đã nhận thanh toán - {appName}',
    body: `Xin chào {name},

Chúng tôi đã nhận thanh toán cho gói {plan}.
Số tiền: {amount} {currency}
Mã đơn: {orderId}

Gói của bạn đã được kích hoạt. Cảm ơn bạn!

Đăng nhập: {loginUrl}

Đội ngũ {appName}`,
  },
  trialEnding: {
    subject: 'Bản dùng thử sắp hết hạn - {appName}',
    body: `Xin chào {name},

Bản dùng thử của bạn sẽ hết hạn sau {daysLeft} ngày. Nâng cấp để tiếp tục dùng đầy đủ tính năng.

{loginUrl}

Đội ngũ {appName}`,
  },
  subscriptionCanceled: {
    subject: 'Gói của bạn đã kết thúc - {appName}',
    body: `Xin chào {name},

Gói {plan} của bạn đã kết thúc. Bạn có thể nâng cấp lại bất cứ lúc nào.

{loginUrl}

Đội ngũ {appName}`,
  },
  verifyEmail: {
    subject: 'Kích hoạt tài khoản {appName} của bạn',
    body: `Xin chào {name},

Cảm ơn bạn đã đăng ký {appName} với email {email}.
Bấm vào liên kết dưới đây để kích hoạt tài khoản (liên kết có hiệu lực trong 24 giờ):

    {verifyUrl}

Bạn cần kích hoạt tài khoản trước khi đăng nhập. Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.

Trân trọng,
Đội ngũ {appName}`,
  },
  registered: {
    subject: 'Chào mừng bạn đến với {appName}',
    body: `Xin chào {name},

Tài khoản của bạn trên {appName} đã được tạo thành công và sẵn sàng sử dụng.

Email đăng nhập: {email}
Đăng nhập tại: {loginUrl}

Chúc bạn làm việc hiệu quả!
Đội ngũ {appName}`,
  },
  forgotPassword: {
    subject: 'Đặt lại mật khẩu tài khoản {appName}',
    body: `Xin chào {name},

Chúng tôi vừa nhận được yêu cầu đặt lại mật khẩu cho tài khoản {email}.
Bấm vào liên kết dưới đây để đặt mật khẩu mới (liên kết có hiệu lực trong 30 phút):

    {resetUrl}

Vì lý do bảo mật, chúng tôi KHÔNG gửi mật khẩu qua email - bạn sẽ tự đặt mật khẩu mới ở trang trên.

Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email - mật khẩu của bạn KHÔNG bị thay đổi.

Trân trọng,
Đội ngũ {appName}`,
  },
  userCreated: {
    subject: 'Tài khoản {appName} của bạn đã sẵn sàng',
    body: `Xin chào {name},

Quản trị viên đã tạo cho bạn một tài khoản trên {appName}. Thông tin đăng nhập:

Email: {email}
Mật khẩu: {password}
Vai trò: {role}

Đăng nhập tại: {loginUrl}
Vì lý do bảo mật, vui lòng đổi mật khẩu sau lần đăng nhập đầu tiên.

Trân trọng,
Đội ngũ {appName}`,
  },
  roleChanged: {
    subject: 'Quyền truy cập của bạn trên {appName} đã thay đổi',
    body: `Xin chào {name},

Vai trò của tài khoản {email} vừa được cập nhật thành: {role}.

Quyền truy cập mới có hiệu lực trong lần đăng nhập tiếp theo tại {loginUrl}.

Nếu bạn có thắc mắc, vui lòng liên hệ quản trị viên.

Trân trọng,
Đội ngũ {appName}`,
  },
};

export function defaultPlatformTemplate(event: PlatformEmailEvent): EmailTemplate {
  return { ...T[event] };
}
