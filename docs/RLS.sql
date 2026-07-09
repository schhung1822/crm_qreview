-- Row-Level Security (RLS) cho các bảng THUỘC BIZ — lưới an toàn chống rò dữ liệu chéo tenant.
-- Chạy SAU `prisma migrate deploy` và SAU script di trú:  psql "$DATABASE_URL" -f docs/RLS.sql
--
-- Cơ chế: lớp repo Prisma đặt biến phiên đầu mỗi giao dịch:
--     SELECT set_config('app.current_biz', '<bizId>', true);   -- true = chỉ trong transaction
-- Mọi truy vấn sau đó chỉ thấy hàng có bizId khớp. Nếu quên WHERE bizId ở tầng ứng dụng, DB vẫn chặn.
--
-- LƯU Ý:
--  - Vai trò DB mà app dùng KHÔNG được là superuser/owner bảng (họ BỎ QUA RLS). Tạo role riêng:
--        CREATE ROLE app_rw LOGIN PASSWORD '...';
--        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
--    và đặt DATABASE_URL dùng role đó.
--  - Superadmin cần thao tác xuyên biz → dùng kết nối riêng bằng role bỏ qua RLS (owner), HOẶC
--    set app.current_biz phù hợp cho từng biz khi lặp.
--  - Nếu current_setting rỗng (thao tác ngoài ngữ cảnh biz, vd migration): policy USING trả false
--    → không thấy hàng nào. Dùng role owner để chạy migration/script.

-- Bật RLS + policy cho từng bảng thuộc biz.
DO $$
DECLARE
  t text;
  biz_tables text[] := ARRAY[
    'Connection', 'Article', 'KeywordSet', 'ContentPlan', 'Revision', 'PublishJob',
    'Comment', 'ApiToken', 'AiUsage', 'AiUsageSeries', 'AiUsageByUser', 'Citation',
    'BizConfig', 'Notification'
  ];
BEGIN
  FOREACH t IN ARRAY biz_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    -- Xóa policy cũ (idempotent) rồi tạo lại.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_biz_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("bizId" = current_setting(''app.current_biz'', true)) '
      || 'WITH CHECK ("bizId" = current_setting(''app.current_biz'', true));',
      t || '_biz_isolation', t
    );
  END LOOP;
END $$;

-- Bảng TOÀN CỤC (User, Session, Biz, BizMember, Subscription, Order, Coupon, PlatformConfig)
-- KHÔNG bật RLS — cô lập ở tầng ứng dụng (đọc theo userId/ownerId). Không có khái niệm bizId.
