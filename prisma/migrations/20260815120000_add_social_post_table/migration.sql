-- Bảng riêng cho bài đăng mạng xã hội. Trước đây toàn bộ danh sách nằm trong MỘT hàng
-- JsonBlob('_global','social-posts.json') và bị cắt còn 1000 bản ghi mới nhất.
-- Sau khi chạy migration này, chạy: node scripts/migrate-social-posts.mjs
-- để chuyển dữ liệu cũ sang bảng (script idempotent, chạy lại nhiều lần không nhân đôi).
CREATE TABLE `SocialPost` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `connectionId` TEXT NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `connectionLabel` TEXT NOT NULL,
    `title` TEXT NULL,
    `text` LONGTEXT NOT NULL,
    `mediaType` VARCHAR(191) NOT NULL,
    `mediaUrls` JSON NOT NULL,
    `originalMediaUrls` JSON NULL,
    `imageProcessing` JSON NULL,
    `linkUrl` TEXT NULL,
    `articleSource` TEXT NULL,
    `articleSourceKey` VARCHAR(191) NULL,
    `affiliateLinks` JSON NULL,
    `providerPostId` TEXT NULL,
    `publishedUrl` TEXT NULL,
    `status` VARCHAR(191) NOT NULL,
    `error` TEXT NULL,
    `createdBy` TEXT NULL,
    `source` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SocialPost_createdAt_idx`(`createdAt`),
    INDEX `SocialPost_batchId_idx`(`batchId`),
    INDEX `SocialPost_status_idx`(`status`),
    INDEX `SocialPost_provider_idx`(`provider`),
    INDEX `SocialPost_articleSourceKey_idx`(`articleSourceKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
