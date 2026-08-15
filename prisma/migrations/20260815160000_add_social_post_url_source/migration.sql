-- Link bài viết nguồn tham khảo. Chỉ hiển thị nội bộ ở trang Bài đăng mạng xã hội,
-- KHÔNG gửi lên mạng xã hội.
--
-- LƯU Ý: cột này đã được thêm tay trên DB crm_qreview trước khi có migration này, nên ở đó
-- migration được đánh dấu applied bằng:
--   npx prisma migrate resolve --applied 20260815160000_add_social_post_url_source
-- Các môi trường khác chạy `prisma migrate deploy` như bình thường.
ALTER TABLE `SocialPost` ADD COLUMN `urlSource` TEXT NULL;
