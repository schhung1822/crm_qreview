-- Chọn workspace Nextgency đang chứa dữ liệu thật làm nguồn cho ứng dụng single-workspace.
-- Ghi đè dữ liệu runtime toàn cục bằng dữ liệu của workspace này trước khi xóa metadata Biz.
INSERT INTO `JsonBlob` (`scope`, `name`, `data`, `version`, `updatedAt`)
SELECT '_global', `name`, `data`, `version`, `updatedAt`
FROM `JsonBlob`
WHERE `scope` = 'biz_ce1dcb31cc36f98b'
ON DUPLICATE KEY UPDATE
  `data` = VALUES(`data`),
  `version` = VALUES(`version`),
  `updatedAt` = VALUES(`updatedAt`);

-- Bảo toàn cấu hình quan hệ (nếu có) dưới dạng cấu hình toàn cục.
INSERT INTO `PlatformConfig` (`key`, `value`)
SELECT `key`, `value`
FROM `BizConfig`
WHERE `bizId` = 'biz_ce1dcb31cc36f98b'
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- Xóa dữ liệu runtime của các tính năng SaaS đã bỏ.
DELETE FROM `JsonBlob`
WHERE `scope` = '_global'
  AND `name` IN (
    'bizes.json',
    'subscriptions.json',
    'orders.json',
    'coupons.json',
    'notifications.json',
    'announcements.json',
    'news-feed.json',
    'plan-requests.json',
    'social-report-usage.json'
    ,'platform-api-tokens.json'
  );
DELETE FROM `JsonBlob` WHERE `scope` <> '_global';
DELETE FROM `PlatformConfig`
WHERE `key` IN (
  'plans', 'plans.json', 'payment-config', 'payment-config.json',
  'announcements', 'announcements.json', 'news-feed', 'news-feed.json',
  'platform-api-tokens', 'platform-api-tokens.json'
);

-- Chuẩn hóa dữ liệu JSON còn giữ lại về tiếng Việt và bỏ metadata dịch thuật.
UPDATE `JsonBlob` AS b
SET b.`data` = COALESCE((
  SELECT JSON_ARRAYAGG(JSON_REMOVE(x.item, '$.translationGroupId'))
  FROM JSON_TABLE(b.`data`, '$[*]' COLUMNS(item JSON PATH '$')) AS x
), JSON_ARRAY())
WHERE b.`scope` = '_global' AND b.`name` = 'articles.json';

UPDATE `JsonBlob` AS b
SET b.`data` = COALESCE((
  SELECT JSON_ARRAYAGG(JSON_SET(JSON_REMOVE(x.item, '$.pathStrategy'), '$.locale', 'vi'))
  FROM JSON_TABLE(b.`data`, '$[*]' COLUMNS(item JSON PATH '$')) AS x
), JSON_ARRAY())
WHERE b.`scope` = '_global' AND b.`name` = 'connections.json';

UPDATE `JsonBlob` AS b
SET b.`data` = COALESCE((
  SELECT JSON_ARRAYAGG(JSON_SET(x.item, '$.locale', 'vi'))
  FROM JSON_TABLE(b.`data`, '$[*]' COLUMNS(item JSON PATH '$')) AS x
), JSON_ARRAY())
WHERE b.`scope` = '_global'
  AND b.`name` IN ('keywordsets.json', 'plans.json', 'social-reports.json', 'script-analyses.json');

UPDATE `JsonBlob` AS b
SET b.`data` = COALESCE((
  SELECT JSON_ARRAYAGG(JSON_REMOVE(JSON_SET(x.item, '$.article.locale', 'vi'), '$.alternates'))
  FROM JSON_TABLE(b.`data`, '$[*]' COLUMNS(item JSON PATH '$')) AS x
), JSON_ARRAY())
WHERE b.`scope` = '_global' AND b.`name` = 'publish-jobs.json';

-- Chỉ giữ dữ liệu quan hệ thuộc workspace nguồn trước khi bỏ cột tenant.
DELETE FROM `Connection` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `Article` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `KeywordSet` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `ContentPlan` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `Revision` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `PublishJob` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `Comment` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `ApiToken` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `AiUsage` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `AiUsageSeries` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `AiUsageByUser` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';
DELETE FROM `Citation` WHERE `bizId` <> 'biz_ce1dcb31cc36f98b';

-- Gộp rollup analytics theo ngày trước khi bỏ chiều Biz để tránh trùng khóa chính.
CREATE TEMPORARY TABLE `_DailyUsageMetricSingle` AS
SELECT
  `date`,
  `userId`,
  `area`,
  `eventName`,
  `pathHash`,
  MAX(`path`) AS `path`,
  SUM(`count`) AS `count`,
  SUM(`uniqueUsers`) AS `uniqueUsers`,
  SUM(`uniqueSessions`) AS `uniqueSessions`,
  SUM(`totalDurationMs`) AS `totalDurationMs`,
  MAX(`updatedAt`) AS `updatedAt`
FROM `DailyUsageMetric`
GROUP BY `date`, `userId`, `area`, `eventName`, `pathHash`;

DELETE FROM `DailyUsageMetric`;
INSERT INTO `DailyUsageMetric`
  (`date`, `bizId`, `userId`, `area`, `eventName`, `pathHash`, `path`, `count`,
   `uniqueUsers`, `uniqueSessions`, `totalDurationMs`, `updatedAt`)
SELECT
  `date`, '', `userId`, `area`, `eventName`, `pathHash`, `path`, `count`,
  `uniqueUsers`, `uniqueSessions`, `totalDurationMs`, `updatedAt`
FROM `_DailyUsageMetricSingle`;
DROP TEMPORARY TABLE `_DailyUsageMetricSingle`;

-- Gỡ khóa ngoại của các bảng/tính năng sẽ xóa hoặc cột Biz sẽ bỏ.
ALTER TABLE `BizMember` DROP FOREIGN KEY `BizMember_bizId_fkey`;
ALTER TABLE `BizMember` DROP FOREIGN KEY `BizMember_userId_fkey`;
ALTER TABLE `PaymentTransaction` DROP FOREIGN KEY `PaymentTransaction_orderId_fkey`;
ALTER TABLE `SubscriptionEvent` DROP FOREIGN KEY `SubscriptionEvent_orderId_fkey`;
ALTER TABLE `SubscriptionEvent` DROP FOREIGN KEY `SubscriptionEvent_userId_fkey`;
ALTER TABLE `UserEvent` DROP FOREIGN KEY `UserEvent_bizId_fkey`;
ALTER TABLE `UserInvite` DROP FOREIGN KEY `UserInvite_acceptedBy_fkey`;
ALTER TABLE `UserInvite` DROP FOREIGN KEY `UserInvite_bizId_fkey`;
ALTER TABLE `UserInvite` DROP FOREIGN KEY `UserInvite_invitedBy_fkey`;
ALTER TABLE `UserSessionActivity` DROP FOREIGN KEY `UserSessionActivity_bizId_fkey`;

DROP INDEX `AiUsage_bizId_idx` ON `AiUsage`;
DROP INDEX `AiUsageByUser_bizId_idx` ON `AiUsageByUser`;
DROP INDEX `AiUsageSeries_bizId_date_idx` ON `AiUsageSeries`;
DROP INDEX `ApiToken_bizId_idx` ON `ApiToken`;
DROP INDEX `Article_bizId_idx` ON `Article`;
DROP INDEX `Article_bizId_locale_idx` ON `Article`;
DROP INDEX `Article_bizId_status_idx` ON `Article`;
DROP INDEX `Citation_bizId_idx` ON `Citation`;
DROP INDEX `Comment_bizId_articleId_idx` ON `Comment`;
DROP INDEX `Connection_bizId_idx` ON `Connection`;
DROP INDEX `ContentPlan_bizId_idx` ON `ContentPlan`;
DROP INDEX `DailyUsageMetric_bizId_date_idx` ON `DailyUsageMetric`;
DROP INDEX `KeywordSet_bizId_idx` ON `KeywordSet`;
DROP INDEX `PublishJob_bizId_idx` ON `PublishJob`;
DROP INDEX `PublishJob_bizId_status_idx` ON `PublishJob`;
DROP INDEX `Revision_bizId_cmsPostId_idx` ON `Revision`;
DROP INDEX `Revision_bizId_idx` ON `Revision`;
DROP INDEX `UserEvent_bizId_createdAt_idx` ON `UserEvent`;
DROP INDEX `UserSessionActivity_bizId_lastSeenAt_idx` ON `UserSessionActivity`;

ALTER TABLE `AiUsage`
  DROP PRIMARY KEY, DROP COLUMN `bizId`, ADD PRIMARY KEY (`key`);
ALTER TABLE `AiUsageByUser`
  DROP PRIMARY KEY, DROP COLUMN `bizId`, ADD PRIMARY KEY (`userId`);
ALTER TABLE `AiUsageSeries`
  DROP PRIMARY KEY, DROP COLUMN `bizId`, ADD PRIMARY KEY (`date`, `key`);
ALTER TABLE `ApiToken` DROP COLUMN `bizId`;
ALTER TABLE `Article`
  DROP COLUMN `bizId`, DROP COLUMN `locale`, DROP COLUMN `translationGroupId`;
ALTER TABLE `Citation` DROP COLUMN `bizId`;
ALTER TABLE `Comment` DROP COLUMN `bizId`;
ALTER TABLE `Connection`
  DROP COLUMN `bizId`, DROP COLUMN `locale`, DROP COLUMN `pathStrategy`;
ALTER TABLE `ContentPlan` DROP COLUMN `bizId`, DROP COLUMN `locale`;
ALTER TABLE `DailyUsageMetric`
  DROP PRIMARY KEY, DROP COLUMN `bizId`,
  ADD PRIMARY KEY (`date`, `area`, `eventName`, `pathHash`, `userId`);
ALTER TABLE `KeywordSet` DROP COLUMN `bizId`, DROP COLUMN `locale`;
ALTER TABLE `PublishJob` DROP COLUMN `alternates`, DROP COLUMN `bizId`;
ALTER TABLE `Revision` DROP COLUMN `bizId`;
ALTER TABLE `UserEvent` DROP COLUMN `bizId`;
ALTER TABLE `UserSessionActivity` DROP COLUMN `bizId`;

DROP TABLE `BizConfig`;
DROP TABLE `BizMember`;
DROP TABLE `Notification`;
DROP TABLE `Coupon`;
DROP TABLE `PaymentTransaction`;
DROP TABLE `SubscriptionEvent`;
DROP TABLE `Order`;
DROP TABLE `PlanRequest`;
DROP TABLE `Subscription`;
DROP TABLE `UserInvite`;
DROP TABLE `Biz`;

CREATE INDEX `AiUsageSeries_date_idx` ON `AiUsageSeries`(`date`);
CREATE INDEX `Article_status_idx` ON `Article`(`status`);
CREATE INDEX `Comment_articleId_idx` ON `Comment`(`articleId`);
CREATE INDEX `PublishJob_status_idx` ON `PublishJob`(`status`);
CREATE INDEX `Revision_cmsPostId_idx` ON `Revision`(`cmsPostId`);
