-- MySQL 8 migration for SEO-GEO Platform.
-- Converted from prisma/migrations/0_init/migration.sql (PostgreSQL).
--
-- Usage:
--   mysql -u <user> -p <database> < migration.sql
--
-- Notes:
-- - This creates the schema only; it does not copy data from PostgreSQL.
-- - The application Prisma datasource currently uses PostgreSQL. To run the app
--   against MySQL, prisma/schema.prisma must also be switched to provider = "mysql"
--   and Prisma Client regenerated.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `User` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `role` TEXT NOT NULL,
  `passwordHash` TEXT NOT NULL,
  `salt` TEXT NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `permissions` JSON NULL,
  `emailVerified` BOOLEAN NULL,
  `firstTouchUtm` JSON NULL,
  `lastTouchUtm` JSON NULL,
  `fbp` VARCHAR(255) NULL,
  `fbc` VARCHAR(255) NULL,
  `ttclid` VARCHAR(255) NULL,
  `ttp` VARCHAR(255) NULL,
  `gclid` VARCHAR(255) NULL,
  `gaClientId` VARCHAR(255) NULL,
  `landingPage` TEXT NULL,
  `referrer` TEXT NULL,
  `signupIp` VARBINARY(16) NULL,
  `signupUserAgent` TEXT NULL,
  `lastIp` VARBINARY(16) NULL,
  `lastUserAgent` TEXT NULL,
  `lastSeenAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_email_key` (`email`),
  KEY `User_createdAt_idx` (`createdAt`),
  KEY `User_lastSeenAt_idx` (`lastSeenAt`),
  KEY `User_fbp_idx` (`fbp`),
  KEY `User_fbc_idx` (`fbc`),
  KEY `User_ttclid_idx` (`ttclid`),
  KEY `User_gclid_idx` (`gclid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `UserConsent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `anonymousId` VARCHAR(191) NULL,
  `sessionId` VARCHAR(191) NULL,
  `analytics` BOOLEAN NOT NULL DEFAULT FALSE,
  `marketing` BOOLEAN NOT NULL DEFAULT FALSE,
  `necessary` BOOLEAN NOT NULL DEFAULT TRUE,
  `source` VARCHAR(191) NULL,
  `ip` VARBINARY(16) NULL,
  `userAgent` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `UserConsent_userId_updatedAt_idx` (`userId`, `updatedAt`),
  KEY `UserConsent_anonymousId_idx` (`anonymousId`),
  KEY `UserConsent_sessionId_idx` (`sessionId`),
  CONSTRAINT `UserConsent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Session` (
  `token` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`token`),
  KEY `Session_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Biz` (
  `id` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `phone` TEXT NULL,
  `email` TEXT NULL,
  `website` TEXT NULL,
  `description` TEXT NULL,
  `suspended` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Biz_ownerId_idx` (`ownerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BizMember` (
  `bizId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `role` TEXT NOT NULL,
  `permissions` JSON NULL,
  PRIMARY KEY (`bizId`, `userId`),
  KEY `BizMember_userId_idx` (`userId`),
  CONSTRAINT `BizMember_bizId_fkey` FOREIGN KEY (`bizId`) REFERENCES `Biz` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BizMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `UserInvite` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL,
  `permissions` JSON NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `invitedBy` VARCHAR(191) NOT NULL,
  `acceptedBy` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `acceptedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UserInvite_tokenHash_key` (`tokenHash`),
  KEY `UserInvite_bizId_status_idx` (`bizId`, `status`),
  KEY `UserInvite_email_status_idx` (`email`, `status`),
  KEY `UserInvite_invitedBy_idx` (`invitedBy`),
  CONSTRAINT `UserInvite_bizId_fkey` FOREIGN KEY (`bizId`) REFERENCES `Biz` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserInvite_invitedBy_fkey` FOREIGN KEY (`invitedBy`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserInvite_acceptedBy_fkey` FOREIGN KEY (`acceptedBy`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `Subscription` (
  `userId` VARCHAR(191) NOT NULL,
  `plan` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `billingCycle` VARCHAR(191) NOT NULL DEFAULT 'monthly',
  `trialEndsAt` DATETIME(3) NULL,
  `currentPeriodEnd` DATETIME(3) NULL,
  `overageArticles` INT NULL,
  `unlimitedArticles` BOOLEAN NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Order` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `userEmail` TEXT NOT NULL,
  `type` TEXT NOT NULL,
  `plan` TEXT NULL,
  `months` INT NULL,
  `overageArticles` INT NULL,
  `currency` TEXT NOT NULL,
  `amount` INT NOT NULL,
  `couponCode` TEXT NULL,
  `discount` INT NOT NULL DEFAULT 0,
  `total` INT NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `payCode` VARCHAR(191) NOT NULL,
  `phone` TEXT NULL,
  `utm` JSON NULL,
  `fbp` VARCHAR(255) NULL,
  `fbc` VARCHAR(255) NULL,
  `ttclid` VARCHAR(255) NULL,
  `ttp` VARCHAR(255) NULL,
  `gclid` VARCHAR(255) NULL,
  `gaClientId` VARCHAR(255) NULL,
  `landingPage` TEXT NULL,
  `referrer` TEXT NULL,
  `ip` VARBINARY(16) NULL,
  `userAgent` TEXT NULL,
  `note` TEXT NULL,
  `activationError` TEXT NULL,
  `paidAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Order_userId_idx` (`userId`),
  KEY `Order_status_idx` (`status`),
  KEY `Order_payCode_idx` (`payCode`),
  KEY `Order_createdAt_idx` (`createdAt`),
  KEY `Order_fbp_idx` (`fbp`),
  KEY `Order_fbc_idx` (`fbc`),
  KEY `Order_ttclid_idx` (`ttclid`),
  KEY `Order_gclid_idx` (`gclid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PaymentTransaction` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `providerTransactionId` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'payment',
  `status` VARCHAR(191) NOT NULL,
  `currency` VARCHAR(16) NOT NULL,
  `amount` INT NOT NULL,
  `matchedAmount` INT NULL,
  `payCode` VARCHAR(191) NULL,
  `bankCode` VARCHAR(191) NULL,
  `bankAccount` VARCHAR(191) NULL,
  `transferContent` TEXT NULL,
  `rawPayload` JSON NULL,
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  KEY `PaymentTransaction_orderId_idx` (`orderId`),
  KEY `PaymentTransaction_provider_status_idx` (`provider`, `status`),
  KEY `PaymentTransaction_providerTransactionId_idx` (`providerTransactionId`),
  KEY `PaymentTransaction_payCode_idx` (`payCode`),
  CONSTRAINT `PaymentTransaction_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SubscriptionEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `fromPlan` VARCHAR(191) NULL,
  `toPlan` VARCHAR(191) NULL,
  `fromStatus` VARCHAR(191) NULL,
  `toStatus` VARCHAR(191) NULL,
  `periodStart` DATETIME(3) NULL,
  `periodEnd` DATETIME(3) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `SubscriptionEvent_userId_createdAt_idx` (`userId`, `createdAt`),
  KEY `SubscriptionEvent_orderId_idx` (`orderId`),
  KEY `SubscriptionEvent_eventType_idx` (`eventType`),
  CONSTRAINT `SubscriptionEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SubscriptionEvent_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `Coupon` (
  `code` VARCHAR(191) NOT NULL,
  `type` TEXT NOT NULL,
  `value` INT NOT NULL,
  `currency` TEXT NULL,
  `maxUses` INT NOT NULL DEFAULT 0,
  `usedCount` INT NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NULL,
  `plans` JSON NULL,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Notification` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `type` TEXT NOT NULL,
  `articleId` TEXT NULL,
  `articleTitle` TEXT NULL,
  `actorName` TEXT NULL,
  `note` TEXT NULL,
  `read` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Notification_bizId_userId_idx` (`bizId`, `userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PlatformConfig` (
  `key` VARCHAR(191) NOT NULL,
  `value` JSON NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Connection` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `provider` TEXT NOT NULL,
  `label` TEXT NOT NULL,
  `baseUrl` TEXT NOT NULL,
  `locale` VARCHAR(191) NOT NULL DEFAULT 'vi',
  `pathStrategy` VARCHAR(191) NOT NULL DEFAULT 'subdir',
  `seoPlugin` TEXT NULL,
  `encrypted` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Connection_bizId_idx` (`bizId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Article` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `slug` VARCHAR(191) NOT NULL DEFAULT '',
  `metaDescription` LONGTEXT NOT NULL,
  `markdown` LONGTEXT NOT NULL,
  `locale` VARCHAR(191) NOT NULL,
  `targetKeyword` TEXT NULL,
  `tags` JSON NULL,
  `categories` JSON NULL,
  `coverImageUrl` TEXT NULL,
  `translationGroupId` TEXT NULL,
  `source` VARCHAR(191) NOT NULL DEFAULT 'new',
  `seoScore` INT NOT NULL DEFAULT 0,
  `aeoScore` INT NOT NULL DEFAULT 0,
  `geoScore` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
  `approved` BOOLEAN NULL,
  `reviewNote` TEXT NULL,
  `submittedBy` TEXT NULL,
  `reviewedBy` TEXT NULL,
  `assignedTo` TEXT NULL,
  `connectionId` TEXT NULL,
  `cmsPostId` TEXT NULL,
  `publishedUrl` TEXT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Article_bizId_idx` (`bizId`),
  KEY `Article_bizId_locale_idx` (`bizId`, `locale`),
  KEY `Article_bizId_status_idx` (`bizId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `KeywordSet` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `seed` TEXT NOT NULL,
  `locale` TEXT NOT NULL,
  `estimated` BOOLEAN NOT NULL DEFAULT FALSE,
  `keywords` JSON NOT NULL,
  `clusters` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `KeywordSet_bizId_idx` (`bizId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ContentPlan` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `keywordSetId` TEXT NOT NULL,
  `locale` TEXT NOT NULL,
  `title` TEXT NOT NULL,
  `seed` TEXT NOT NULL,
  `items` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ContentPlan_bizId_idx` (`bizId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Revision` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `connectionId` TEXT NOT NULL,
  `cmsPostId` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `contentHtml` LONGTEXT NOT NULL,
  `metaDescription` TEXT NULL,
  `snapshotOk` BOOLEAN NOT NULL DEFAULT FALSE,
  `reason` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Revision_bizId_idx` (`bizId`),
  KEY `Revision_bizId_cmsPostId_idx` (`bizId`, `cmsPostId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PublishJob` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `connectionId` TEXT NOT NULL,
  `article` JSON NOT NULL,
  `alternates` JSON NOT NULL,
  `articleId` TEXT NULL,
  `status` VARCHAR(191) NOT NULL,
  `runAt` DATETIME(3) NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `maxAttempts` INT NOT NULL DEFAULT 3,
  `lastError` TEXT NULL,
  `resultPostId` TEXT NULL,
  `resultUrl` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `PublishJob_bizId_idx` (`bizId`),
  KEY `PublishJob_bizId_status_idx` (`bizId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Comment` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `userId` TEXT NOT NULL,
  `userName` TEXT NOT NULL,
  `body` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Comment_bizId_articleId_idx` (`bizId`, `articleId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ApiToken` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `prefix` TEXT NOT NULL,
  `hash` VARCHAR(191) NOT NULL,
  `createdBy` TEXT NOT NULL,
  `lastUsedAt` DATETIME(3) NULL,
  `revoked` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ApiToken_bizId_idx` (`bizId`),
  KEY `ApiToken_hash_idx` (`hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AiUsage` (
  `bizId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `provider` TEXT NOT NULL,
  `model` TEXT NOT NULL,
  `inTokens` INT NOT NULL DEFAULT 0,
  `outTokens` INT NOT NULL DEFAULT 0,
  `calls` INT NOT NULL DEFAULT 0,
  `images` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`bizId`, `key`),
  KEY `AiUsage_bizId_idx` (`bizId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AiUsageSeries` (
  `bizId` VARCHAR(191) NOT NULL,
  `date` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `provider` TEXT NOT NULL,
  `model` TEXT NOT NULL,
  `inTokens` INT NOT NULL DEFAULT 0,
  `outTokens` INT NOT NULL DEFAULT 0,
  `images` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`bizId`, `date`, `key`),
  KEY `AiUsageSeries_bizId_date_idx` (`bizId`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AiUsageByUser` (
  `bizId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `inTokens` INT NOT NULL DEFAULT 0,
  `outTokens` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`bizId`, `userId`),
  KEY `AiUsageByUser_bizId_idx` (`bizId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Citation` (
  `id` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NOT NULL,
  `data` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Citation_bizId_idx` (`bizId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `BizConfig` (
  `bizId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `value` JSON NOT NULL,
  PRIMARY KEY (`bizId`, `key`),
  KEY `BizConfig_bizId_idx` (`bizId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `UserSessionActivity` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `anonymousId` VARCHAR(191) NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `bizId` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endedAt` DATETIME(3) NULL,
  `entryPath` TEXT NULL,
  `landingPage` TEXT NULL,
  `referrer` TEXT NULL,
  `utm` JSON NULL,
  `fbp` VARCHAR(255) NULL,
  `fbc` VARCHAR(255) NULL,
  `ttclid` VARCHAR(255) NULL,
  `ttp` VARCHAR(255) NULL,
  `gclid` VARCHAR(255) NULL,
  `gaClientId` VARCHAR(255) NULL,
  `ip` VARBINARY(16) NULL,
  `userAgent` TEXT NULL,
  `deviceType` VARCHAR(64) NULL,
  `browser` VARCHAR(128) NULL,
  `os` VARCHAR(128) NULL,
  `country` VARCHAR(2) NULL,
  `region` VARCHAR(128) NULL,
  `city` VARCHAR(128) NULL,
  `pageViews` INT NOT NULL DEFAULT 0,
  `events` INT NOT NULL DEFAULT 0,
  `metadata` JSON NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UserSessionActivity_sessionId_key` (`sessionId`),
  KEY `UserSessionActivity_userId_lastSeenAt_idx` (`userId`, `lastSeenAt`),
  KEY `UserSessionActivity_bizId_lastSeenAt_idx` (`bizId`, `lastSeenAt`),
  KEY `UserSessionActivity_anonymousId_idx` (`anonymousId`),
  KEY `UserSessionActivity_fbp_idx` (`fbp`),
  KEY `UserSessionActivity_fbc_idx` (`fbc`),
  KEY `UserSessionActivity_ttclid_idx` (`ttclid`),
  KEY `UserSessionActivity_gclid_idx` (`gclid`),
  CONSTRAINT `UserSessionActivity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `UserSessionActivity_bizId_fkey` FOREIGN KEY (`bizId`) REFERENCES `Biz` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `UserEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `anonymousId` VARCHAR(191) NULL,
  `sessionId` VARCHAR(191) NULL,
  `bizId` VARCHAR(191) NULL,
  `eventName` VARCHAR(128) NOT NULL,
  `eventType` VARCHAR(191) NOT NULL DEFAULT 'interaction',
  `area` VARCHAR(191) NULL,
  `path` VARCHAR(512) NULL,
  `routeName` VARCHAR(191) NULL,
  `entityType` VARCHAR(191) NULL,
  `entityId` VARCHAR(191) NULL,
  `source` VARCHAR(191) NULL,
  `value` DECIMAL(18,4) NULL,
  `currency` VARCHAR(16) NULL,
  `durationMs` INT NULL,
  `success` BOOLEAN NULL,
  `errorCode` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `ip` VARBINARY(16) NULL,
  `userAgent` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `UserEvent_createdAt_idx` (`createdAt`),
  KEY `UserEvent_userId_createdAt_idx` (`userId`, `createdAt`),
  KEY `UserEvent_bizId_createdAt_idx` (`bizId`, `createdAt`),
  KEY `UserEvent_sessionId_createdAt_idx` (`sessionId`, `createdAt`),
  KEY `UserEvent_eventName_createdAt_idx` (`eventName`, `createdAt`),
  KEY `UserEvent_area_createdAt_idx` (`area`, `createdAt`),
  KEY `UserEvent_path_createdAt_idx` (`path`, `createdAt`),
  CONSTRAINT `UserEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `UserEvent_bizId_fkey` FOREIGN KEY (`bizId`) REFERENCES `Biz` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `DailyUsageMetric` (
  `date` DATE NOT NULL,
  `bizId` VARCHAR(64) NOT NULL DEFAULT '',
  `userId` VARCHAR(64) NOT NULL DEFAULT '',
  `area` VARCHAR(96) NOT NULL,
  `eventName` VARCHAR(128) NOT NULL,
  `pathHash` BINARY(16) NOT NULL,
  `path` VARCHAR(512) NULL,
  `count` INT NOT NULL DEFAULT 0,
  `uniqueUsers` INT NOT NULL DEFAULT 0,
  `uniqueSessions` INT NOT NULL DEFAULT 0,
  `totalDurationMs` BIGINT NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`date`, `area`, `eventName`, `pathHash`, `bizId`, `userId`),
  KEY `DailyUsageMetric_bizId_date_idx` (`bizId`, `date`),
  KEY `DailyUsageMetric_userId_date_idx` (`userId`, `date`),
  KEY `DailyUsageMetric_area_date_idx` (`area`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `JsonBlob` (
  `scope` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `data` JSON NOT NULL,
  `version` INT NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`scope`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;








