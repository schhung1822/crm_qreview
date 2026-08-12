import type { EmailTemplate } from './templates';

export type PlatformEmailEvent =
  | 'welcome'
  | 'verifyEmail'
  | 'registered'
  | 'forgotPassword'
  | 'userCreated'
  | 'roleChanged';

export const PLATFORM_EMAIL_EVENTS = [
  'welcome',
  'verifyEmail',
  'registered',
  'forgotPassword',
  'userCreated',
  'roleChanged',
] as const satisfies readonly PlatformEmailEvent[];

export const PLATFORM_EVENT_VARS: Record<PlatformEmailEvent, string[]> = {
  welcome: ['name', 'email', 'appName', 'loginUrl'],
  verifyEmail: ['name', 'email', 'verifyUrl', 'appName', 'loginUrl'],
  registered: ['name', 'email', 'appName', 'loginUrl'],
  forgotPassword: ['name', 'email', 'resetUrl', 'appName', 'loginUrl'],
  userCreated: ['name', 'email', 'password', 'role', 'appName', 'loginUrl'],
  roleChanged: ['name', 'email', 'role', 'appName', 'loginUrl'],
};

const TEMPLATES: Record<PlatformEmailEvent, EmailTemplate> = {
  welcome: {
    subject: 'Chào mừng bạn đến với {appName}',
    body: `Xin chào {name},

Tài khoản của bạn trên {appName} đã sẵn sàng.
Đăng nhập tại: {loginUrl}

Trân trọng,
Đội ngũ {appName}`,
  },
  verifyEmail: {
    subject: 'Kích hoạt tài khoản {appName}',
    body: `Xin chào {name},

Vui lòng mở liên kết sau để xác thực email {email}:
{verifyUrl}

Nếu bạn không tạo tài khoản này, hãy bỏ qua email.`,
  },
  registered: {
    subject: 'Tài khoản {appName} đã được kích hoạt',
    body: `Xin chào {name},

Tài khoản dùng email {email} đã được kích hoạt thành công.
Đăng nhập tại: {loginUrl}`,
  },
  forgotPassword: {
    subject: 'Đặt lại mật khẩu {appName}',
    body: `Xin chào {name},

Mở liên kết sau để đặt lại mật khẩu:
{resetUrl}

Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`,
  },
  userCreated: {
    subject: 'Tài khoản {appName} của bạn đã được tạo',
    body: `Xin chào {name},

Email: {email}
Mật khẩu tạm thời: {password}
Vai trò: {role}
Đăng nhập tại: {loginUrl}

Hãy đổi mật khẩu sau lần đăng nhập đầu tiên.`,
  },
  roleChanged: {
    subject: 'Quyền tài khoản {appName} đã thay đổi',
    body: `Xin chào {name},

Vai trò của tài khoản {email} đã được đổi thành {role}.
Đăng nhập tại: {loginUrl}`,
  },
};

export function defaultPlatformTemplate(event: PlatformEmailEvent): EmailTemplate {
  return TEMPLATES[event];
}
