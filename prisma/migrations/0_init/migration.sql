-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "Biz" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "description" TEXT,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Biz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BizMember" (
    "bizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" JSONB,

    CONSTRAINT "BizMember_pkey" PRIMARY KEY ("bizId","userId")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "overageArticles" INTEGER,
    "unlimitedArticles" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plan" TEXT,
    "months" INTEGER,
    "overageArticles" INTEGER,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "couponCode" TEXT,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "payCode" TEXT NOT NULL,
    "phone" TEXT,
    "utm" JSONB,
    "note" TEXT,
    "activationError" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "currency" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "plans" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "articleId" TEXT,
    "articleTitle" TEXT,
    "actorName" TEXT,
    "note" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "pathStrategy" TEXT NOT NULL DEFAULT 'subdir',
    "seoPlugin" TEXT,
    "encrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT '',
    "metaDescription" TEXT NOT NULL DEFAULT '',
    "markdown" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL,
    "targetKeyword" TEXT,
    "tags" JSONB,
    "categories" JSONB,
    "coverImageUrl" TEXT,
    "translationGroupId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'new',
    "seoScore" INTEGER NOT NULL DEFAULT 0,
    "aeoScore" INTEGER NOT NULL DEFAULT 0,
    "geoScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "approved" BOOLEAN,
    "reviewNote" TEXT,
    "submittedBy" TEXT,
    "reviewedBy" TEXT,
    "assignedTo" TEXT,
    "connectionId" TEXT,
    "cmsPostId" TEXT,
    "publishedUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordSet" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "keywords" JSONB NOT NULL,
    "clusters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPlan" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "keywordSetId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "cmsPostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "metaDescription" TEXT,
    "snapshotOk" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishJob" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "article" JSONB NOT NULL,
    "alternates" JSONB NOT NULL,
    "articleId" TEXT,
    "status" TEXT NOT NULL,
    "runAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "resultPostId" TEXT,
    "resultUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "bizId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inTokens" INTEGER NOT NULL DEFAULT 0,
    "outTokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "images" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("bizId","key")
);

-- CreateTable
CREATE TABLE "AiUsageSeries" (
    "bizId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inTokens" INTEGER NOT NULL DEFAULT 0,
    "outTokens" INTEGER NOT NULL DEFAULT 0,
    "images" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsageSeries_pkey" PRIMARY KEY ("bizId","date","key")
);

-- CreateTable
CREATE TABLE "AiUsageByUser" (
    "bizId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inTokens" INTEGER NOT NULL DEFAULT 0,
    "outTokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsageByUser_pkey" PRIMARY KEY ("bizId","userId")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "bizId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BizConfig" (
    "bizId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "BizConfig_pkey" PRIMARY KEY ("bizId","key")
);

-- CreateTable
CREATE TABLE "JsonBlob" (
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JsonBlob_pkey" PRIMARY KEY ("scope","name")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Biz_ownerId_idx" ON "Biz"("ownerId");

-- CreateIndex
CREATE INDEX "BizMember_userId_idx" ON "BizMember"("userId");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_payCode_idx" ON "Order"("payCode");

-- CreateIndex
CREATE INDEX "Notification_bizId_userId_idx" ON "Notification"("bizId", "userId");

-- CreateIndex
CREATE INDEX "Connection_bizId_idx" ON "Connection"("bizId");

-- CreateIndex
CREATE INDEX "Article_bizId_idx" ON "Article"("bizId");

-- CreateIndex
CREATE INDEX "Article_bizId_locale_idx" ON "Article"("bizId", "locale");

-- CreateIndex
CREATE INDEX "Article_bizId_status_idx" ON "Article"("bizId", "status");

-- CreateIndex
CREATE INDEX "KeywordSet_bizId_idx" ON "KeywordSet"("bizId");

-- CreateIndex
CREATE INDEX "ContentPlan_bizId_idx" ON "ContentPlan"("bizId");

-- CreateIndex
CREATE INDEX "Revision_bizId_idx" ON "Revision"("bizId");

-- CreateIndex
CREATE INDEX "Revision_bizId_cmsPostId_idx" ON "Revision"("bizId", "cmsPostId");

-- CreateIndex
CREATE INDEX "PublishJob_bizId_idx" ON "PublishJob"("bizId");

-- CreateIndex
CREATE INDEX "PublishJob_bizId_status_idx" ON "PublishJob"("bizId", "status");

-- CreateIndex
CREATE INDEX "Comment_bizId_articleId_idx" ON "Comment"("bizId", "articleId");

-- CreateIndex
CREATE INDEX "ApiToken_bizId_idx" ON "ApiToken"("bizId");

-- CreateIndex
CREATE INDEX "ApiToken_hash_idx" ON "ApiToken"("hash");

-- CreateIndex
CREATE INDEX "AiUsage_bizId_idx" ON "AiUsage"("bizId");

-- CreateIndex
CREATE INDEX "AiUsageSeries_bizId_date_idx" ON "AiUsageSeries"("bizId", "date");

-- CreateIndex
CREATE INDEX "AiUsageByUser_bizId_idx" ON "AiUsageByUser"("bizId");

-- CreateIndex
CREATE INDEX "Citation_bizId_idx" ON "Citation"("bizId");

-- CreateIndex
CREATE INDEX "BizConfig_bizId_idx" ON "BizConfig"("bizId");

-- AddForeignKey
ALTER TABLE "BizMember" ADD CONSTRAINT "BizMember_bizId_fkey" FOREIGN KEY ("bizId") REFERENCES "Biz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BizMember" ADD CONSTRAINT "BizMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

