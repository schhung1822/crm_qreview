export interface GateStr {
  badge: string;
  protTitle: string;
  protNote: string;
  action: string;
  prompt: string;
  pwLabel: string;
  pwPlaceholder: string;
  errWrong: string;
  errRate: string;
  metaLocked: string;
}

export const GATE: Record<'vi', GateStr> = {
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
    metaLocked: 'Nội dung được bảo vệ bằng mật khẩu.',
  },
};

export function pickGateLocale(_locale?: string): 'vi' {
  return 'vi';
}
