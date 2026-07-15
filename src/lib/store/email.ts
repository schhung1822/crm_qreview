// Kiểu cấu hình SMTP DÙNG CHUNG. (Email theo-biz đã GỠ: toàn hệ thống dùng 1 SMTP + nội dung email
// cấu hình ở "Email nền tảng" trong Quản trị nền tảng - xem store/platform-email.ts.)
// Giữ file này chỉ để export type SmtpConfig cho mailer + platform-email.
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean; // true = TLS ngầm (465); false = STARTTLS (587)
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

// Cấu hình gửi email qua Gmail OAuth2 (thay cho SMTP). Gửi qua SMTP XOAUTH2 của Google bằng
// refreshToken (nodemailer tự đổi ra access token mỗi lần gửi). refreshToken lấy qua luồng consent.
export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  senderEmail: string; // địa chỉ Gmail dùng để gửi (cũng là 'from')
  fromName: string;
  refreshToken?: string; // có sau khi "Kết nối Google" thành công; thiếu = chưa gửi được
}

// Phương thức gửi email nền tảng đang chọn.
export type MailTransport = 'smtp' | 'gmail_oauth2';
