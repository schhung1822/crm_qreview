// Test cho Báo cáo Social: chuẩn hóa dữ liệu Apify + tính chỉ số + dựng HTML báo cáo.
import { describe, expect, it } from 'vitest';
import {
  normalizeAd,
  normalizeComment,
  normalizePageInfo,
  normalizePost,
  normalizeReel,
} from '../src/lib/social/apify';
import { computeMetrics, mergePosts } from '../src/lib/social/metrics';
import { buildStyleMarkdown, buildStylePrompt, styleFileName } from '../src/lib/social/style';
import type { SocialStyleProfile } from '../src/lib/social/types';
import { buildSocialReportBody, buildSocialReportHtml, socialReportFileName } from '../src/lib/social/report-html';
import { buildPlan, type SocialPost, type SocialReportRecord } from '../src/lib/social/types';

describe('chuẩn hóa dữ liệu Apify', () => {
  it('normalizePageInfo đọc likes/followers/categories/rating', () => {
    const info = normalizePageInfo(
      [
        {
          title: 'Meta for Business',
          pageUrl: 'https://www.facebook.com/metaforbusinessapac',
          likes: 20488643,
          followers: 20000000,
          categories: ['Internet company'],
          rating: '92% recommend',
          ratingCount: 1609,
          intro: 'Facebook for Business provides the latest news.',
        },
      ],
      'https://www.facebook.com/metaforbusinessapac',
    );
    expect(info?.name).toBe('Meta for Business');
    expect(info?.likes).toBe(20488643);
    expect(info?.followers).toBe(20000000);
    expect(info?.categories).toEqual(['Internet company']);
    expect(info?.rating).toBe('92% recommend (1609)');
  });

  it('normalizePageInfo trả undefined khi dataset rỗng', () => {
    expect(normalizePageInfo([], 'https://facebook.com/x')).toBeUndefined();
  });

  it('normalizePost nhận diện reel qua URL và đọc chỉ số', () => {
    const p = normalizePost({
      postId: '909617861780409',
      url: 'https://www.facebook.com/reel/909617861780409/',
      time: '2026-02-24T10:00:00.000Z',
      text: 'Ikuti training gratis dari ahli di Meta.',
      likes: 198,
      comments: 46,
      viewsCount: 12000,
    });
    expect(p?.type).toBe('reel');
    expect(p?.reactions).toBe(198);
    expect(p?.comments).toBe(46);
    expect(p?.views).toBe(12000);
    expect(p?.time).toBe('2026-02-24T10:00:00.000Z');
  });

  it('normalizePost đọc epoch giây và số dạng chuỗi', () => {
    const p = normalizePost({
      postId: 'x1',
      url: 'https://www.facebook.com/page/posts/x1',
      timestamp: 1750000000,
      likes: '1,234',
      type: 'Photo',
    });
    expect(p?.type).toBe('image');
    expect(p?.reactions).toBe(1234);
    expect(p?.time).toMatch(/^2025-/);
  });

  it('normalizeReel luôn trả type reel', () => {
    const p = normalizeReel({ postId: 'r1', url: 'https://www.facebook.com/watch/123' });
    expect(p?.type).toBe('reel');
  });

  it('normalizeAd đọc snapshot + cards', () => {
    const ad = normalizeAd({
      adArchiveID: '1648915233194940',
      snapshot: {
        body: { text: 'You could reach more people.' },
        cta_text: 'Learn more',
        display_format: 'DCO',
      },
    });
    expect(ad?.id).toBe('1648915233194940');
    expect(ad?.text).toBe('You could reach more people.');
    expect(ad?.cta).toBe('Learn more');
    expect(ad?.format).toBe('DCO');
  });

  it('normalizeComment bỏ bình luận rỗng', () => {
    expect(normalizeComment({ likesCount: 5 })).toBeUndefined();
    const c = normalizeComment({ text: 'Great tips!', likesCount: 5, profileName: 'A' });
    expect(c?.text).toBe('Great tips!');
    expect(c?.likes).toBe(5);
  });
});

function post(over: Partial<SocialPost>): SocialPost {
  return { id: Math.random().toString(36).slice(2), type: 'image', url: 'https://fb.com/p', ...over };
}

describe('computeMetrics', () => {
  it('tính trung bình, phân bổ định dạng, tỷ lệ L/F và tần suất', () => {
    const posts = [
      post({ id: 'a', type: 'image', reactions: 48, comments: 10, time: '2026-03-13T00:00:00Z' }),
      post({ id: 'b', type: 'reel', reactions: 198, comments: 46, time: '2026-02-24T00:00:00Z' }),
      post({ id: 'c', type: 'reel', reactions: 578, comments: 132, time: '2025-12-24T00:00:00Z' }),
    ];
    const m = computeMetrics({
      page: { name: 'P', url: 'u', likes: 20488643, followers: 20000000 },
      posts,
      reels: [],
      ads: [
        { id: '1', cta: 'Learn more', format: 'DCO' },
        { id: '2', cta: 'Subscribe', format: 'DCO' },
      ],
      comments: [],
    });
    expect(m.postCount).toBe(3);
    expect(m.formatDist).toEqual({ image: 1, reel: 2 });
    expect(m.avgReactions).toBeCloseTo((48 + 198 + 578) / 3, 1);
    expect(m.avgComments).toBeCloseTo((10 + 46 + 132) / 3, 1);
    expect(m.lfRatio).toBeCloseTo(102.44, 1);
    expect(m.adFormatDist).toEqual({ dco: 2 });
    expect(m.ctaDist).toEqual({ 'Learn more': 1, Subscribe: 1 });
    expect(m.postsPerDay).toBeGreaterThan(0);
    expect(m.postsPerDay).toBeLessThan(1);
  });

  it('mergePosts khử trùng lặp theo id và xếp mới nhất trước', () => {
    const a = post({ id: 'dup', time: '2026-01-01T00:00:00Z' });
    const merged = mergePosts([a], [post({ id: 'dup' }), post({ id: 'new', time: '2026-06-01T00:00:00Z' })]);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('new');
  });
});

describe('buildPlan', () => {
  const options = {
    postsLimit: 10, reelsLimit: 10, adsLimit: 10, commentsLimit: 30,
    includeReels: true, includeAds: true, includeComments: true,
  };
  it('facebook đủ bước; tiktok/youtube không có bước page riêng; đều có bước transcript', () => {
    const fb = buildPlan({ platform: 'facebook', channels: [{ kind: 'facebook' }], options });
    expect(fb.map((s) => s.action)).toEqual([
      'page', 'posts', 'reels', 'transcript', 'ads', 'comments',
      'analyzeBrand', 'analyzeTactics', 'analyzeSummary',
    ]);
    const tt = buildPlan({ platform: 'tiktok', channels: [{ kind: 'tiktok' }], options });
    expect(tt.map((s) => s.action)).toEqual([
      'posts', 'transcript', 'comments', 'analyzeBrand', 'analyzeTactics', 'analyzeSummary',
    ]);
  });
  it('tổng thể theo keyword: search + transcript mỗi kênh + analyzeCompare khi ≥2 kênh', () => {
    const plan = buildPlan({
      platform: 'overall',
      keyword: 'x',
      channels: [{ kind: 'facebook' }, { kind: 'tiktok' }, { kind: 'youtube' }],
      options,
    });
    expect(plan.map((s) => s.action)).toEqual([
      'search', 'transcript', 'search', 'transcript', 'search', 'transcript',
      'analyzeBrand', 'analyzeTactics', 'analyzeSummary', 'analyzeCompare',
    ]);
    expect(plan[2].ch).toBe(1);
  });
});

describe('báo cáo NHÓM Facebook (fbgroup)', () => {
  const options = {
    postsLimit: 10, reelsLimit: 10, adsLimit: 10, commentsLimit: 30,
    includeReels: true, includeAds: true, includeComments: true, groupSort: 'top' as const,
  };

  it('buildPlan: bài viết TRƯỚC (lấy ID số) → info nhóm → transcript → bình luận → 3 bước AI riêng', () => {
    const plan = buildPlan({ platform: 'fbgroup', channels: [{ kind: 'fbgroup' }], options });
    expect(plan.map((s) => s.action)).toEqual([
      'posts', 'page', 'transcript', 'comments',
      'analyzeGroupTopics', 'analyzeGroupAudience', 'analyzeGroupSummary',
    ]);
    // Tắt bình luận → bỏ bước comments (vẫn còn topComments inline từ bước posts).
    const noCmt = buildPlan({
      platform: 'fbgroup', channels: [{ kind: 'fbgroup' }],
      options: { ...options, includeComments: false },
    });
    expect(noCmt.map((s) => s.action)).not.toContain('comments');
  });

  it('groupPostsInput: top = TOP_POSTS + giới hạn 6 tháng; new = CHRONOLOGICAL không giới hạn', async () => {
    const { groupPostsInput } = await import('../src/lib/social/apify');
    const top = groupPostsInput('https://www.facebook.com/groups/x', 20, 'top');
    expect(top.viewOption).toBe('TOP_POSTS');
    expect(String(top.onlyPostsNewerThan)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const nw = groupPostsInput('https://www.facebook.com/groups/x', 20, 'new');
    expect(nw.viewOption).toBe('CHRONOLOGICAL');
    expect(nw.onlyPostsNewerThan).toBeUndefined();
  });

  it('normalizeGroupItems: tách bài (kèm tác giả) + bình luận GẮN VỚI BÀI + ID số của nhóm', async () => {
    const { normalizeGroupItems } = await import('../src/lib/social/apify');
    const { posts, comments, groupTitle, groupId } = normalizeGroupItems([
      {
        // Dạng output thật của apify~facebook-groups-scraper (đã xác minh 07-2026):
        // id = base64, legacyId = ID số của BÀI, facebookId = ID số của NHÓM.
        id: 'UzpfSTEwMDA1NDkwMzkzNjk2MTpWSzoyNzUwMDU3NTc4Mjk1NjEwOQ==',
        legacyId: '27500575782956109',
        facebookId: '6540893992684260',
        url: 'https://www.facebook.com/groups/x/permalink/27500575782956109/',
        time: '2026-06-01T00:00:00.000Z',
        text: 'Có ai dùng máy này chưa?',
        user: { id: 'u1', name: 'Người Đăng A' },
        topReactionsCount: 12,
        commentsCount: 34,
        sharesCount: 2,
        groupTitle: 'Nhóm Thử Nghiệm',
        topComments: [
          { text: 'Dùng tốt lắm bạn', profileName: 'Bình Luận B', likesCount: 5 },
          { text: '' }, // rỗng → bỏ
        ],
      },
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe('27500575782956109'); // ID bài = legacyId, KHÔNG phải ID nhóm
    expect(posts[0].author).toBe('Người Đăng A');
    expect(posts[0].reactions).toBe(12);
    expect(groupTitle).toBe('Nhóm Thử Nghiệm');
    expect(groupId).toBe('6540893992684260');
    expect(comments).toHaveLength(1);
    expect(comments[0].postUrl).toBe('https://www.facebook.com/groups/x/permalink/27500575782956109/');
    expect(comments[0].author).toBe('Bình Luận B');
  });

  it('normalizeGroupInfo: decode tên HTML-encode + parse memberInfo dạng chữ + bỏ qua item lỗi', async () => {
    const { normalizeGroupInfo, groupInfoInput } = await import('../src/lib/social/apify');
    expect(groupInfoInput('https://www.facebook.com/groups/x')).toEqual({
      startUrls: ['https://www.facebook.com/groups/x'],
      maxItems: 1,
    });
    // Dạng output thật của scraper-engine~facebook-groups-search-scraper (đã xác minh 07-2026):
    // tên HTML-encode (&#x..;), memberInfo là chuỗi "127,920 total members".
    const info = normalizeGroupInfo(
      [
        { status: 'error' }, // item lỗi → bỏ qua
        {
          id: '6540893992684260',
          name: 'C&#x1ed9;ng &#x111;&#x1ed3;ng n8n',
          url: 'https://www.facebook.com/groups/n8n.automation/',
          visibility: 'Public',
          memberInfo: '127,920 total members',
          postFrequency: '4.6 posts a day',
        },
      ],
      'https://www.facebook.com/groups/x',
    );
    expect(info?.name).toBe('Cộng đồng n8n');
    expect(info?.followers).toBe(127920);
    expect(info?.url).toBe('https://www.facebook.com/groups/n8n.automation/');
    expect(info?.categories).toEqual(['Public']);
    // memberInfo viết tắt "21K members" / "1.3M members" cũng đọc được.
    expect(
      normalizeGroupInfo([{ name: 'G', memberInfo: '21K members' }], 'u')?.followers,
    ).toBe(21000);
    expect(
      normalizeGroupInfo([{ name: 'G', memberInfo: '1.3M members' }], 'u')?.followers,
    ).toBe(1300000);
    // Toàn item lỗi → undefined (runner giữ tên nhóm từ bước bài viết + cảnh báo).
    expect(normalizeGroupInfo([{ status: 'error' }], 'https://x')).toBeUndefined();
  });

  it('computeMetrics: topContributors xếp theo tương tác từ author của bài', () => {
    const m = computeMetrics({
      posts: [
        post({ id: 'a', author: 'A', reactions: 10, comments: 5 }),
        post({ id: 'b', author: 'B', reactions: 100 }),
        post({ id: 'c', author: 'A', reactions: 1 }),
      ],
      reels: [], ads: [], comments: [],
    });
    expect(m.topContributors?.map((c) => c.name)).toEqual(['B', 'A']);
    expect(m.topContributors?.[1]).toEqual({ name: 'A', posts: 2, engagement: 16 });
    // Bài không có author (fanpage) → không có topContributors.
    const m2 = computeMetrics({ posts: [post({ id: 'x' })], reels: [], ads: [], comments: [] });
    expect(m2.topContributors).toBeUndefined();
  });

  it('buildGroupDigest: bình luận lồng vào đúng bài của nó (khớp URL bỏ query/slash)', async () => {
    const { buildGroupDigest } = await import('../src/lib/social/analyze');
    const plan = buildPlan({ platform: 'fbgroup', channels: [{ kind: 'fbgroup' }], options });
    const digest = JSON.parse(
      buildGroupDigest({
        id: 'sr_g', platform: 'fbgroup', title: 'Nhóm X', locale: 'vi', status: 'collected',
        plan, stepIndex: 4, warnings: [], options,
        channels: [{
          kind: 'fbgroup', url: 'https://www.facebook.com/groups/x',
          page: { name: 'Nhóm X', url: 'u', followers: 999 },
          posts: [
            { id: 'p1', type: 'text', url: 'https://www.facebook.com/groups/x/posts/1/', text: 'Bài 1', author: 'A', time: '2026-06-02T00:00:00Z' },
            { id: 'p2', type: 'text', url: 'https://www.facebook.com/groups/x/posts/2/', text: 'Bài 2', time: '2026-06-01T00:00:00Z' },
          ],
          reels: [], ads: [],
          comments: [
            { postUrl: 'https://www.facebook.com/groups/x/posts/1?comment_id=9', text: 'cmt của bài 1' },
            { postUrl: 'https://www.facebook.com/groups/x/posts/2/', text: 'cmt của bài 2' },
          ],
        }],
        analysis: {}, createdAt: '2026-07-11T00:00:00Z', updatedAt: '2026-07-11T00:00:00Z',
      }),
    ) as { group: { members: number }; posts: Array<{ text: string; topComments: Array<{ text: string }> }> };
    expect(digest.group.members).toBe(999);
    const p1 = digest.posts.find((p) => p.text === 'Bài 1')!;
    const p2 = digest.posts.find((p) => p.text === 'Bài 2')!;
    expect(p1.topComments.map((c) => c.text)).toEqual(['cmt của bài 1']);
    expect(p2.topComments.map((c) => c.text)).toEqual(['cmt của bài 2']);
  });

  it('report HTML: thẻ bài nhóm có tác giả + bình luận đi theo bài; chỉ số nhóm có thành viên nổi bật', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({ platform: 'fbgroup', channels: [{ kind: 'fbgroup' }], options });
    const posts: SocialPost[] = [
      { id: 'p1', type: 'text', url: 'https://www.facebook.com/groups/x/posts/1/', text: 'Hỏi mua <b>máy</b>', author: 'Người Đăng A', reactions: 3 },
    ];
    const comments = [{ postUrl: 'https://www.facebook.com/groups/x/posts/1/', text: 'Trả lời <i>hay</i>', likes: 2, author: 'B' }];
    const html = buildSocialReportBody(
      {
        id: 'sr_g2', platform: 'fbgroup', title: 'Nhóm X', locale: 'vi', status: 'collected',
        plan, stepIndex: 4, warnings: [], options,
        channels: [{
          kind: 'fbgroup', url: 'https://www.facebook.com/groups/x',
          page: { name: 'Nhóm X', url: 'u', followers: 500 },
          posts, reels: [], ads: [], comments,
          metrics: computeMetrics({ page: { name: 'Nhóm X', url: 'u', followers: 500 }, posts, reels: [], ads: [], comments }),
        }],
        analysis: {}, createdAt: '2026-07-11T00:00:00Z', updatedAt: '2026-07-11T00:00:00Z',
      },
      L,
    );
    expect(html).toContain('[groupPostsTitle]');
    expect(html).toContain('[metricsTitleGroup]');
    expect(html).toContain('[members]');
    expect(html).toContain('[author]');
    expect(html).toContain('[postComments]');
    expect(html).toContain('[topContributors]');
    expect(html).toContain('Người Đăng A');
    // Nội dung bình luận + bài đều được escape.
    expect(html).toContain('Trả lời &lt;i&gt;hay&lt;/i&gt;');
    expect(html).not.toContain('<i>hay</i>');
    // Không lẫn nhãn fanpage/kênh.
    expect(html).not.toContain('[organicPosts]');
    expect(html).not.toContain('[metricsTitle]');
    expect(html).not.toContain('[videosTitle]');
  });
});

describe('Instagram / Threads / Shopee (3 kênh mới 07-2026)', () => {
  const options = {
    postsLimit: 10, reelsLimit: 10, adsLimit: 10, commentsLimit: 30,
    includeReels: true, includeAds: true, includeComments: true,
  };

  it('buildPlan: Instagram như fanpage (page/posts/reels/comments, KHÔNG transcript riêng); Threads gọn; Shopee riêng', () => {
    const ig = buildPlan({ platform: 'instagram', channels: [{ kind: 'instagram' }], options });
    expect(ig.map((s) => s.action)).toEqual([
      'page', 'posts', 'reels', 'comments', 'analyzeBrand', 'analyzeTactics', 'analyzeSummary',
    ]);
    const th = buildPlan({ platform: 'threads', channels: [{ kind: 'threads' }], options });
    expect(th.map((s) => s.action)).toEqual([
      'posts', 'comments', 'analyzeBrand', 'analyzeTactics', 'analyzeSummary',
    ]);
    const sp = buildPlan({ platform: 'shopee', channels: [{ kind: 'shopee' }], options });
    expect(sp.map((s) => s.action)).toEqual([
      'product', 'reviews', 'analyzeShopeeProduct', 'analyzeShopeeReviews', 'analyzeShopeeSummary',
    ]);
  });

  it('tổng thể keyword giờ gồm 5 kênh; transcript chỉ cho facebook/tiktok/youtube', () => {
    const plan = buildPlan({
      platform: 'overall',
      keyword: 'x',
      channels: [
        { kind: 'facebook' }, { kind: 'instagram' }, { kind: 'threads' },
        { kind: 'tiktok' }, { kind: 'youtube' },
      ],
      options,
    });
    expect(plan.map((s) => s.action)).toEqual([
      'search', 'transcript', // facebook
      'search', // instagram (transcript inline qua includeTranscript của bước reels/search)
      'search', // threads (thuần chữ)
      'search', 'transcript', // tiktok
      'search', 'transcript', // youtube
      'analyzeBrand', 'analyzeTactics', 'analyzeSummary', 'analyzeCompare',
    ]);
  });

  it('normalizeIgPost/Reel: dạng output thật; likesCount=-1 (ẩn like) → bỏ', async () => {
    const { normalizeIgPost, normalizeIgReel, igUsername } = await import('../src/lib/social/apify');
    expect(igUsername('https://www.instagram.com/nike')).toBe('nike');
    expect(igUsername('@noti.vn')).toBe('noti.vn');
    const p = normalizeIgPost({
      id: '3911460208761108739', type: 'Video',
      url: 'https://www.instagram.com/p/DZITFYIR_kD/',
      caption: 'Rip The Script.', likesCount: 1490625, commentsCount: 8276,
      videoViewCount: 27727721, videoPlayCount: 132433419,
      timestamp: '2026-06-03T16:01:11.000Z',
    });
    expect(p?.type).toBe('video');
    expect(p?.reactions).toBe(1490625);
    expect(p?.views).toBe(132433419); // ưu tiên videoPlayCount
    expect(normalizeIgPost({ id: 'x', url: 'u', type: 'Image', likesCount: -1 })?.reactions).toBeUndefined();
    const reel = normalizeIgReel({ id: 'r', url: 'u', type: 'Video', transcript: 'lời thoại reel' });
    expect(reel?.type).toBe('reel');
    expect(reel?.transcript).toBe('lời thoại reel');
  });

  it('normalizeThreadsItems: tách profile + bài, dựng URL @user/post/CODE, shares=repost+quote', async () => {
    const { normalizeThreadsItems } = await import('../src/lib/social/apify');
    const { page, posts } = normalizeThreadsItems([
      { type: 'profile', username: 'zuck', fullName: 'Mark Zuckerberg', biography: 'I build stuff', followerCount: 16946082, url: 'https://www.threads.com/@zuck' },
      {
        type: 'post', postId: '393749', code: 'DakyAavlKLZ', username: 'zuck',
        text: 'Muse Spark 1.1', likeCount: 2629, replyCount: 474, repostCount: 178, quoteCount: 56,
        mediaType: 'text', media: [], date: '2026-07-09T14:00:34.000Z',
        url: 'https://www.threads.com/t/DakyAavlKLZ',
      },
    ]);
    expect(page?.name).toBe('Mark Zuckerberg');
    expect(page?.followers).toBe(16946082);
    expect(posts).toHaveLength(1);
    // URL dựng lại dạng @user/post/CODE (dạng /t/ bị actor replies trả rỗng - đã thử thật).
    expect(posts[0].url).toBe('https://www.threads.net/@zuck/post/DakyAavlKLZ');
    expect(posts[0].type).toBe('text');
    expect(posts[0].shares).toBe(178 + 56);
  });

  it('actor Shopee KHỚP với input schema (detail=xtracto nhận shopId/itemId; reviews=zen nhận startUrls)', async () => {
    // Chốt cặp actor ↔ input: từng dính bug đổi input builder sang schema xtracto nhưng quên
    // đổi actor ID (vẫn zen-studio) → run FAILED vì input không khớp, typecheck không bắt được.
    const { APIFY_ACTORS, shopeeProductInput, shopeeReviewsInput } = await import('../src/lib/social/apify');
    expect(APIFY_ACTORS.shopeeDetail).toBe('xtracto~shopee-product-detail');
    expect(shopeeProductInput('https://shopee.vn/x-i.11.22')).toEqual({
      country: 'vn', shopId: '11', itemId: '22',
    });
    expect(APIFY_ACTORS.shopeeReviews).toBe('zen-studio~shopee-product-reviews-scraper');
    const rv = shopeeReviewsInput('https://shopee.vn/x-i.11.22', 30) as { startUrls: Array<{ url: string }> };
    expect(rv.startUrls).toEqual([{ url: 'https://shopee.vn/product/11/22' }]);
  });

  it('shopeeIds/shopeeCountry + normalizeShopeeProduct dạng output thật của xtracto', async () => {
    const { shopeeIds, shopeeCountry, normalizeShopeeProduct } = await import('../src/lib/social/apify');
    expect(shopeeIds('https://shopee.vn/ten-i.724617386.19548071365')).toEqual({ shopId: '724617386', itemId: '19548071365' });
    expect(shopeeIds('https://shopee.vn/product/1574448654/28488599214')).toEqual({ shopId: '1574448654', itemId: '28488599214' });
    expect(shopeeCountry('https://shopee.vn/x')).toBe('vn');
    expect(shopeeCountry('https://shopee.co.th/x')).toBe('th');
    const p = normalizeShopeeProduct(
      [{
        item_id: 28488599214, shop_id: 1574448654,
        title: 'Tai nghe ngủ X55', description: 'Mô tả dài', currency: 'VND',
        price: 56000, price_min: 56000, price_max: 93000,
        rating_star: 4.74, total_ratings: 8244,
        images: ['https://img/1'], models: [], tier_variations: [],
        shop: { name: 'REZK STORE', rating_star: 4.68, location: 'Tỉnh Bắc Ninh' },
      }],
      'https://shopee.vn/x-i.1574448654.28488599214',
    );
    expect(p?.name).toBe('Tai nghe ngủ X55');
    expect(p?.priceMin).toBe(56000);
    expect(p?.priceMax).toBe(93000);
    expect(p?.ratingStar).toBe(4.74);
    expect(p?.ratingCount).toBe(8244);
    expect(p?.shopName).toBe('REZK STORE');
    // Item cảnh báo "temporarily unavailable" → bỏ qua, không nhả sản phẩm rỗng.
    expect(normalizeShopeeProduct([{ _warning: 'unavailable', itemIds: [1] }], 'u')).toBeUndefined();
  });

  it('normalizeShopeeReview + computeShopeeMetrics: sao khía cạnh, phân loại, phản hồi shop', async () => {
    const { normalizeShopeeReview } = await import('../src/lib/social/apify');
    const { computeShopeeMetrics } = await import('../src/lib/social/metrics');
    const rv = normalizeShopeeReview({
      ratingStar: 5, comment: 'Vải mềm mịn', createdAt: '2023-07-09T11:09:42+00:00',
      author: 'hongloan1989', likeCount: 4,
      detailedRating: { productQuality: 5, sellerService: 5, deliveryService: 5, driverService: null },
      variations: [{ name: 'Đen sọc vai,L' }], images: ['a', 'b'], videos: ['v'], shopReply: null,
    });
    expect(rv?.rating).toBe(5);
    expect(rv?.variant).toBe('Đen sọc vai,L');
    expect(rv?.mediaCount).toBe(3);
    expect(rv?.aspects?.productQuality).toBe('5');
    const m = computeShopeeMetrics([
      rv!,
      { rating: 4, text: 'ổn', variant: 'Đen sọc vai,L', sellerReply: 'Cảm ơn bạn' },
      { rating: 1, text: 'tệ' },
    ]);
    expect(m.ratingAvg).toBeCloseTo(10 / 3, 1);
    expect(m.ratingDist).toEqual({ '5': 1, '4': 1, '1': 1 });
    expect(m.sellerReplies).toBe(1);
    expect(m.withMedia).toBe(1);
    expect(m.topVariants?.[0]).toEqual({ name: 'Đen sọc vai,L', count: 2 });
  });

  it('Instagram/Threads hiện "Bài đăng" (không phải "Video của kênh"), thẻ là "Bài N"', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const mk = (kind: 'instagram' | 'threads') => {
      const plan = buildPlan({ platform: kind, channels: [{ kind }], options });
      return buildSocialReportBody(
        {
          id: 'sr_it', platform: kind, title: 'Kênh X', locale: 'vi', status: 'collected',
          plan, stepIndex: plan.length - 3, warnings: [], options,
          channels: [{
            kind, url: 'u',
            page: { name: 'Kênh X', url: 'u', followers: 100 },
            posts: [post({ id: 'p1', type: kind === 'threads' ? 'text' : 'image', text: 'Bài A', reactions: 5 })],
            reels: [], ads: [], comments: [],
            metrics: computeMetrics({
              page: { name: 'Kênh X', url: 'u', followers: 100 },
              posts: [post({ id: 'p1', reactions: 5 })], reels: [], ads: [], comments: [],
            }),
          }],
          analysis: {}, createdAt: '2026-07-11T00:00:00Z', updatedAt: '2026-07-11T00:00:00Z',
        },
        L,
      );
    };
    for (const kind of ['instagram', 'threads'] as const) {
      const html = mk(kind);
      expect(html).toContain('[organicPosts]'); // mục "Bài đăng", không phải "Video của kênh"
      expect(html).not.toContain('[videosTitle]');
      expect(html).toContain('[post] 1'); // thẻ "Bài N", không phải "Video N"
      expect(html).not.toContain('[videoItem]');
    }
  });

  it('header Shopee thông minh: field bị Shopee chặn (tổng đánh giá/đã bán) → thế bằng ô có dữ liệu, không "n.a"', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({ platform: 'shopee', channels: [{ kind: 'shopee' }], options });
    const html = buildSocialReportBody(
      {
        id: 'sr_sp2', platform: 'shopee', title: 'Ví HAPAS', locale: 'vi', status: 'collected',
        plan, stepIndex: 2, warnings: [], options,
        channels: [{
          kind: 'shopee', url: 'https://shopee.vn/x-i.1.2',
          posts: [], reels: [], ads: [], comments: [],
          // Dạng thật đã gặp: Shopee chặn ratingCount + sold, chỉ có sao/giá/giảm giá/shop.
          product: {
            name: 'Ví HAPAS', url: 'https://shopee.vn/x-i.1.2', currency: 'VND',
            priceMin: 480550, ratingStar: 4.9, discount: '2%', shopRating: 4.8, shopName: 'HAPAS',
          },
          productReviews: [{ rating: 5, text: 'đẹp' }],
          productMetrics: {
            ratingAvg: 5, ratingDist: { '5': 1 }, reviewsCollected: 30,
            withText: 30, withMedia: 3, sellerReplies: 0,
          },
        }],
        analysis: {}, createdAt: '2026-07-12T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z',
      },
      L,
    );
    // Ô 1: sao; ô 2 fallback: "đánh giá đã thu" (không phải tổng - tổng bị chặn); có giá + giảm giá.
    expect(html).toContain('[ratingLabel]');
    expect(html).toContain('[priceLabel]');
    expect(html).toContain('[discountLabel]');
    expect(html).toContain('4.9/5');
    // Không dựng ô rỗng cho field bị chặn.
    expect(html).not.toContain('[reviewsTotal]');
    expect(html).not.toContain('[soldLabel]');
  });

  it('SHOP Shopee: buildPlan + tách ident shop + normalizer listing (URL tự dựng vì actor lệch hàng)', async () => {
    const { shopeeShopIdent, shopeeShopInput, normalizeShopProducts, normalizeShopeeShopInfo, APIFY_ACTORS } =
      await import('../src/lib/social/apify');
    const { computeShopeeShopMetrics } = await import('../src/lib/social/metrics');

    const plan = buildPlan({ platform: 'shopeeshop', channels: [{ kind: 'shopeeshop' }], options });
    expect(plan.map((s) => s.action)).toEqual([
      'shop', 'page', 'reviews', 'analyzeShopCatalog', 'analyzeShopCustomers', 'analyzeShopSummary',
    ]);

    expect(APIFY_ACTORS.shopeeShop).toBe('xtracto~shopee-shop-scraper');
    expect(shopeeShopIdent('https://shopee.vn/kaystore52')).toBe('kaystore52');
    expect(shopeeShopIdent('https://shopee.vn/shop/201171779')).toBe('201171779');
    expect(shopeeShopIdent('@hapas.official')).toBe('hapas.official');
    expect(shopeeShopInput('https://shopee.vn/kaystore52', 20)).toEqual({
      country: 'vn', shop: 'kaystore52', maxProducts: 20,
    });

    // Dạng output thật của shop-scraper: field url bị LỆCH MỘT HÀNG → URL phải TỰ DỰNG
    // từ shop_id + item_id, không dùng url của actor.
    const products = normalizeShopProducts(
      [{
        shop_id: 201171779, item_id: 25664084842, name: 'Túi Xách Nữ Cầm Tay',
        url: 'https://shopee.vn/SLUG-CUA-SAN-PHAM-KHAC-i.201171779.99999', // lệch hàng!
        price: 19000, currency: 'VND', rating: 4.9, discount_pct: 10,
      }],
      'https://shopee.vn/hapas',
    );
    expect(products).toHaveLength(1);
    expect(products[0].url).toBe('https://shopee.vn/product/201171779/25664084842');
    expect(products[0].priceMin).toBe(19000);
    expect(products[0].discount).toBe('10%');

    // Info shop rút từ field shop{} của detail (dạng thật đã xác minh).
    const info = normalizeShopeeShopInfo(
      [{ title: 'x', price_min: 1, shop: { name: 'REZK STORE', username: 'rezk', rating_star: 4.68, follower_count: 1331, item_count: 312, response_rate: 96, location: 'Tỉnh Bắc Ninh', is_shopee_verified: true } }],
      'https://shopee.vn/rezk',
    );
    expect(info?.name).toBe('REZK STORE');
    expect(info?.followers).toBe(1331);
    expect(info?.itemCount).toBe(312);
    expect(info?.responseRate).toBe(96);
    expect(info?.url).toBe('https://shopee.vn/rezk');

    const sm = computeShopeeShopMetrics(products.concat([{ name: 'B', url: 'u', priceMin: 50000, ratingStar: 4.5 }]));
    expect(sm.productsCollected).toBe(2);
    expect(sm.priceMin).toBe(19000);
    expect(sm.priceMax).toBe(50000);
    expect(sm.withDiscount).toBe(1);
    expect(sm.topRated?.[0].rating).toBe(4.9);
  });

  it('report body SHOP: info shop/danh mục/chỉ số/đánh giá gắn sản phẩm', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({ platform: 'shopeeshop', channels: [{ kind: 'shopeeshop' }], options });
    const html = buildSocialReportBody(
      {
        id: 'sr_shop', platform: 'shopeeshop', title: 'HAPAS', locale: 'vi', status: 'collected',
        plan, stepIndex: 3, warnings: [], options,
        channels: [{
          kind: 'shopeeshop', url: 'https://shopee.vn/hapas',
          posts: [], reels: [], ads: [], comments: [],
          shopInfo: { name: 'HAPAS <b>Store</b>', url: 'https://shopee.vn/hapas', rating: 4.8, followers: 12862, itemCount: 312, responseRate: 96 },
          shopProducts: [
            { name: 'Túi A', url: 'u1', priceMin: 19000, currency: 'VND', ratingStar: 4.9 },
            { name: 'Túi B', url: 'u2', priceMin: 990000, currency: 'VND', ratingStar: 5, discount: '5%' },
          ],
          shopMetrics: {
            productsCollected: 2, currency: 'VND', priceMin: 19000, priceMax: 990000,
            priceAvg: 504500, ratingAvg: 4.95, withDiscount: 1,
            topRated: [{ name: 'Túi B', rating: 5 }],
          },
          productReviews: [{ rating: 5, text: 'Đẹp lắm', ofProduct: 'Túi A' }],
          productMetrics: { ratingAvg: 5, ratingDist: { '5': 1 }, reviewsCollected: 1, withText: 1, withMedia: 0, sellerReplies: 0 },
        }],
        analysis: {}, createdAt: '2026-07-12T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z',
      },
      L,
    );
    expect(html).toContain('[shopInfoTitle]');
    expect(html).toContain('[productsTitle]');
    expect(html).toContain('[metricsTitleShop]');
    expect(html).toContain('[reviewsTitle]');
    expect(html).toContain('[ofProduct]'); // đánh giá gắn tên sản phẩm
    expect(html).toContain('[itemCountLabel]');
    expect(html).toContain('[responseRate]');
    expect(html).toContain('HAPAS &lt;b&gt;Store&lt;/b&gt;'); // escape
    expect(html).not.toContain('[organicPosts]');
  });

  it('report body Shopee: mục sản phẩm/đánh giá/chỉ số + không lẫn nhãn kênh social', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({ platform: 'shopee', channels: [{ kind: 'shopee' }], options });
    const html = buildSocialReportBody(
      {
        id: 'sr_sp', platform: 'shopee', title: 'Tai nghe X55', locale: 'vi', status: 'collected',
        plan, stepIndex: 2, warnings: [], options,
        channels: [{
          kind: 'shopee', url: 'https://shopee.vn/x-i.1.2',
          posts: [], reels: [], ads: [], comments: [],
          product: {
            name: 'Tai nghe <b>X55</b>', url: 'https://shopee.vn/x-i.1.2', currency: 'VND',
            priceMin: 56000, priceMax: 93000, ratingStar: 4.74, ratingCount: 8244, sold: 500,
            variants: [{ name: 'Đen', price: 56000 }], shopName: 'REZK', description: 'Mô tả <i>x</i>',
          },
          productReviews: [
            { rating: 5, text: 'Tốt <script>alert(1)</script>', variant: 'Đen', sellerReply: 'Cảm ơn' },
          ],
          productMetrics: {
            ratingAvg: 5, ratingDist: { '5': 1 }, reviewsCollected: 1,
            withText: 1, withMedia: 0, sellerReplies: 1,
            topVariants: [{ name: 'Đen', count: 1 }],
          },
        }],
        analysis: {}, createdAt: '2026-07-11T00:00:00Z', updatedAt: '2026-07-11T00:00:00Z',
      },
      L,
    );
    expect(html).toContain('[productTitle]');
    expect(html).toContain('[reviewsTitle]');
    expect(html).toContain('[metricsTitleProduct]');
    expect(html).toContain('[sellerReply]');
    expect(html).toContain('[variantBought]');
    // Escape đầy đủ (tên sản phẩm, mô tả, đánh giá).
    expect(html).not.toContain('<script>');
    expect(html).toContain('Tai nghe &lt;b&gt;X55&lt;/b&gt;');
    // Không lẫn mục kênh social.
    expect(html).not.toContain('[organicPosts]');
    expect(html).not.toContain('[metricsTitle]');
    expect(html).not.toContain('[videosTitle]');
  });
});

describe('TikTok Shop (sản phẩm + shop, 07-2026)', () => {
  const options = {
    postsLimit: 10, reelsLimit: 10, adsLimit: 10, commentsLimit: 30,
    includeReels: true, includeAds: true, includeComments: true, ttsRegion: 'VN',
  };

  it('buildPlan: sản phẩm như Shopee; shop lặp bước search theo số trang (10 sản phẩm/trang)', () => {
    const sp = buildPlan({ platform: 'tiktokshop', channels: [{ kind: 'tiktokshop' }], options });
    expect(sp.map((s) => s.action)).toEqual([
      'product', 'reviews', 'analyzeShopeeProduct', 'analyzeShopeeReviews', 'analyzeShopeeSummary',
    ]);
    const shop10 = buildPlan({ platform: 'tiktokshopshop', channels: [{ kind: 'tiktokshopshop' }], options });
    expect(shop10.map((s) => s.action)).toEqual([
      'shop', 'page', 'reviews', 'analyzeShopCatalog', 'analyzeShopCustomers', 'analyzeShopSummary',
    ]);
    const shop40 = buildPlan({
      platform: 'tiktokshopshop', channels: [{ kind: 'tiktokshopshop' }],
      options: { ...options, postsLimit: 40 },
    });
    expect(shop40.filter((s) => s.action === 'shop')).toHaveLength(4);
  });

  it('actor TikTok Shop KHỚP input schema (detail=cunning_soil, reviews=web_wanderer, search=pratikdani)', async () => {
    const { APIFY_ACTORS, ttsDetailInput, ttsReviewsInput, ttsSearchInput, ttsRegion } =
      await import('../src/lib/social/apify');
    expect(APIFY_ACTORS.ttsDetail).toBe('cunning_soil~tiktok-shop-product-scraper-mobile-api');
    expect(ttsDetailInput('1731339426839366442', 'VN')).toEqual({
      productInput: '1731339426839366442', region: 'VN', outputMode: 'full_readable',
    });
    expect(APIFY_ACTORS.ttsReviews).toBe('web_wanderer~tiktok-reviews-scraper');
    expect(ttsReviewsInput(['1', '2'], 'vn', 15)).toEqual({
      region: 'VN', product_ids: ['1', '2'], reviews_limit: 15, include_personal_information: true,
    });
    expect(APIFY_ACTORS.ttsSearch).toBe('pratikdani~tiktok-shop-search-scraper');
    expect(ttsSearchInput('Cỏ Mềm', 'VN', 2)).toEqual({
      country_code: 'VN', keyword: 'Cỏ Mềm', limit: 10, page: 2,
    });
    // Khu vực lạ → về VN (3 actor chỉ nhận vùng trong enum).
    expect(ttsRegion('xx')).toBe('VN');
    expect(ttsRegion('jp')).toBe('JP');
  });

  it('ttsProductId: nhận đủ các dạng link + ID trần, từ chối link không có ID', async () => {
    const { ttsProductId } = await import('../src/lib/social/apify');
    expect(ttsProductId('https://www.tiktok.com/view/product/1731339426839366442')).toBe('1731339426839366442');
    expect(ttsProductId('https://shop.tiktok.com/view/product/1731339426839366442?region=VN')).toBe('1731339426839366442');
    expect(ttsProductId('https://www.tiktok.com/shop/pdp/ten-san-pham/1729384756102938475')).toBe('1729384756102938475');
    // Dạng thật user dán 07-2026: /vn/pdp/ID KHÔNG có slug giữa pdp và ID.
    expect(ttsProductId('https://shop.tiktok.com/vn/pdp/1736156394143975154')).toBe('1736156394143975154');
    expect(ttsProductId('1731339426839366442')).toBe('1731339426839366442');
    expect(ttsProductId('https://www.tiktok.com/@shop')).toBeUndefined();
  });

  it('normalizeTtsProduct: dạng output thật của cunning_soil (giá sku số trần, đã bán, tồn kho)', async () => {
    const { normalizeTtsProduct } = await import('../src/lib/social/apify');
    const p = normalizeTtsProduct(
      [{
        product_info: {
          total_products: 1,
          products: [{
            product_id: '1731339426839366442', status: 1,
            title: '[Combo 2 gói] Bông tẩy trang Alucos',
            category: { name: 'Chăm sóc sắc đẹp', id: '601450' },
            pricing: {
              currency: 'VND', sale_price: '68.000₫', original_price: '145.000₫', discount: '-53%',
              raw: { min_sku_price: '68.000' },
            },
            sales: { sold_count: 543366 },
            inventory: {
              total_stock: 816,
              skus: [{
                sku_id: 's1',
                sku_sale_props: [{ prop_name: 'Thông số', prop_value: '#COMBO 02 GÓI' }],
                stock: 816, price: { real_price: { price_str: '68.000₫', price_val: '68000' } },
              }],
            },
            media: { image_urls: ['https://img/1', 'https://img/2'] },
            seller: { seller_id: '7495390298299337514', name: 'Alucos Việt Nam', rating: '5.0', location: 'Việt Nam' },
            reviews: { product_rating: 4.8, review_count: 12514, review_items: [] },
          }],
        },
      }],
      'https://www.tiktok.com/view/product/1731339426839366442',
    );
    expect(p?.name).toBe('[Combo 2 gói] Bông tẩy trang Alucos');
    expect(p?.url).toBe('https://www.tiktok.com/view/product/1731339426839366442');
    expect(p?.priceMin).toBe(68000); // từ sku price_val số trần, KHÔNG parse chuỗi hiển thị
    expect(p?.discount).toBe('53%'); // bỏ dấu trừ đầu
    expect(p?.sold).toBe(543366);
    expect(p?.stock).toBe(816);
    expect(p?.ratingStar).toBe(4.8);
    expect(p?.ratingCount).toBe(12514);
    expect(p?.variants?.[0].name).toBe('#COMBO 02 GÓI');
    expect(p?.shopName).toBe('Alucos Việt Nam');
    expect(p?.shopRating).toBe(5);
    expect(p?.shopLocation).toBe('Việt Nam');
    expect(normalizeTtsProduct([{}], 'u')).toBeUndefined();
  });

  it('normalizeTtsReview: epoch mili giây dạng CHUỖI + sku_specification + product_id → itemId', async () => {
    const { normalizeTtsReview } = await import('../src/lib/social/apify');
    const rv = normalizeTtsReview({
      review_id: '7661145933530580743', product_id: '1731339426839366442',
      review_rating: 5, review_time: '1783749540455',
      is_verified_purchase: true, reviewer_name: 'F**E',
      review_text: 'bông siêu to, lau êm da',
      review_images: ['https://img/a'], sku_specification: 'COMBO 02 GÓI LUXURY',
    });
    expect(rv?.rating).toBe(5);
    expect(rv?.time?.slice(0, 4)).toBe('2026'); // epoch ms chuỗi phải ra năm đúng
    expect(rv?.variant).toBe('COMBO 02 GÓI LUXURY');
    expect(rv?.mediaCount).toBe(1);
    expect(rv?.itemId).toBe('1731339426839366442');
    expect(normalizeTtsReview({ review_id: 'x' })).toBeUndefined();
  });

  it('normalizeTtsShopItems: lọc theo seller đa số khớp tên (bỏ item lạc), tự dựng URL, parse "12.5K"', async () => {
    const { normalizeTtsShopItems } = await import('../src/lib/social/apify');
    const mk = (id: string, name: string, seller: Record<string, string>) => ({
      product_id: id, product_name: name, real_price: '145307', original_price: '145307',
      product_rating: '4.8', review_count: '12.5K', total_sale_cnt: '951.59K', off: 10,
      cover_url: 'https://img/c', seller,
    });
    const alucos = {
      seller_id: '7495390298299337514', seller_name: 'Alucos Việt Nam',
      total_sale_cnt: '13.31M', total_sale_gmv_amt: '₫609.26B',
    };
    const other = { seller_id: '999', seller_name: 'Heri Store', total_sale_cnt: '1K', total_sale_gmv_amt: '₫1B' };
    const { products, shopInfo } = normalizeTtsShopItems(
      [mk('1', 'Bông A', alucos), mk('2', 'Bông B', alucos), mk('3', 'Đồ lạ', other)],
      'alucos', // tên nhập không dấu vẫn khớp "Alucos Việt Nam"
      'VN',
    );
    expect(products).toHaveLength(2); // item của seller lạ bị loại
    expect(products[0].url).toBe('https://www.tiktok.com/view/product/1');
    expect(products[0].ratingCount).toBe(12500); // "12.5K"
    expect(products[0].sold).toBe(951590); // "951.59K"
    expect(products[0].discount).toBe('10%');
    expect(products[0].currency).toBe('VND');
    expect(shopInfo?.name).toBe('Alucos Việt Nam');
    expect(shopInfo?.totalSold).toBe('13.31M');
    expect(shopInfo?.gmv).toBe('₫609.26B');
    // Sao "0.0" = chưa có đánh giá → không nhả 0.
    const zero = normalizeTtsShopItems(
      [{ ...mk('9', 'Mới', alucos), product_rating: '0.0' }], 'Alucos Việt Nam', 'VN',
    );
    expect(zero.products[0].ratingStar).toBeUndefined();
  });

  it('report body SHOP TikTok Shop: tổng đã bán/GMV hiện ở info + ô đầu trang', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({ platform: 'tiktokshopshop', channels: [{ kind: 'tiktokshopshop' }], options });
    const html = buildSocialReportBody(
      {
        id: 'sr_tts', platform: 'tiktokshopshop', title: 'Alucos Việt Nam', locale: 'vi', status: 'collected',
        plan, stepIndex: 3, warnings: [], options,
        channels: [{
          kind: 'tiktokshopshop', url: 'Alucos Việt Nam',
          posts: [], reels: [], ads: [], comments: [],
          shopInfo: { name: 'Alucos Việt Nam', url: '', rating: 5, location: 'Việt Nam', totalSold: '13.31M', gmv: '₫609.26B' },
          shopProducts: [
            { name: 'Bông A', url: 'https://www.tiktok.com/view/product/1', priceMin: 145307, currency: 'VND', ratingStar: 4.8, sold: 951590 },
          ],
          shopMetrics: {
            productsCollected: 1, currency: 'VND', priceMin: 145307, priceMax: 145307,
            priceAvg: 145307, ratingAvg: 4.8, withDiscount: 0,
          },
          productReviews: [{ rating: 5, text: 'Êm da', ofProduct: 'Bông A' }],
          productMetrics: { ratingAvg: 5, ratingDist: { '5': 1 }, reviewsCollected: 1, withText: 1, withMedia: 0, sellerReplies: 0 },
        }],
        analysis: {}, createdAt: '2026-07-12T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z',
      },
      L,
    );
    expect(html).toContain('[shopInfoTitle]');
    expect(html).toContain('[shopTotalSold]');
    expect(html).toContain('[shopGmv]');
    expect(html).toContain('13.31M');
    expect(html).toContain('[productsTitle]');
    expect(html).toContain('[ofProduct]');
    expect(html).not.toContain('[organicPosts]');
  });
});

describe('Lazada + Tổng thể E-commerce (07-2026)', () => {
  const options = {
    postsLimit: 10, reelsLimit: 10, adsLimit: 10, commentsLimit: 30,
    includeReels: true, includeAds: true, includeComments: true, ttsRegion: 'VN',
  };

  it('buildPlan: lazada/lazadashop 1 bước thu (đánh giá inline); ecom = search/sàn + 3 AI thị trường', () => {
    const lz = buildPlan({ platform: 'lazada', channels: [{ kind: 'lazada' }], options });
    expect(lz.map((s) => s.action)).toEqual([
      'product', 'analyzeShopeeProduct', 'analyzeShopeeReviews', 'analyzeShopeeSummary',
    ]);
    const lzs = buildPlan({ platform: 'lazadashop', channels: [{ kind: 'lazadashop' }], options });
    expect(lzs.map((s) => s.action)).toEqual([
      'shop', 'analyzeShopCatalog', 'analyzeShopCustomers', 'analyzeShopSummary',
    ]);
    const ecom = buildPlan({
      platform: 'ecom',
      keyword: 'nước tẩy trang',
      channels: [{ kind: 'shopee' }, { kind: 'tiktokshop' }, { kind: 'lazada' }],
      options,
    });
    expect(ecom.map((s) => s.action)).toEqual([
      'search', 'search', 'search', 'analyzeEcomMarket', 'analyzeEcomCompetitors', 'analyzeEcomSummary',
    ]);
    // TikTok Shop tối đa 10 kết quả/lượt → postsLimit 20 = 2 bước search cho kênh đó.
    const ecom20 = buildPlan({
      platform: 'ecom',
      keyword: 'x',
      channels: [{ kind: 'shopee' }, { kind: 'tiktokshop' }, { kind: 'lazada' }],
      options: { ...options, postsLimit: 20 },
    });
    expect(ecom20.filter((s) => s.action === 'search')).toHaveLength(4);
  });

  it('actor Lazada/search Shopee KHỚP input schema (fatihtahta limit tối thiểu 10; xtracto fetchDetail)', async () => {
    const { APIFY_ACTORS, lzProductInput, lzShopInput, lzEcomSearchInput, shopeeSearchInput } =
      await import('../src/lib/social/apify');
    expect(APIFY_ACTORS.lazada).toBe('fatihtahta~lazada-scraper');
    expect(lzProductInput('combo 2 tay trang', 'vn', 30)).toEqual({
      queries: ['combo 2 tay trang'], country: 'vn', limit: 10, sort: 'best',
      getReviews: true, maxReviews: 30,
    });
    // limit của actor TỐI THIỂU 10 (limit<10 bị từ chối - đã dính thực tế).
    const shop = lzShopInput('https://www.lazada.vn/shop/cocoon-vietnam', 8, 5) as { limit: number };
    expect(shop.limit).toBe(10);
    expect(lzEcomSearchInput('tẩy trang', 'vn', 10)).toEqual({
      queries: ['tẩy trang'], country: 'vn', limit: 10, sort: 'best', getReviews: false,
    });
    expect(APIFY_ACTORS.shopeeSearch).toBe('xtracto~shopee-search');
    expect(shopeeSearchInput('tẩy trang', 'vn', 12)).toEqual({
      country: 'vn', mode: 'keyword', keyword: 'tẩy trang', sort: 'sales',
      maxProducts: 12, fetchDetail: true,
    });
  });

  it('lazadaProductId/SlugKeyword/Country: link đầy đủ có slug; pdp-i KHÔNG có slug → undefined', async () => {
    const { lazadaProductId, lazadaSlugKeyword, lazadaCountry } = await import('../src/lib/social/apify');
    const url = 'https://www.lazada.vn/products/combo-2-bigsize-nuoc-tay-trang-i3199369524.html';
    expect(lazadaProductId(url)).toBe('3199369524');
    expect(lazadaProductId('https://www.lazada.vn/products/x-i123456-s789.html')).toBe('123456');
    expect(lazadaSlugKeyword(url)).toBe('combo 2 bigsize nuoc tay trang');
    // Dạng canonical pdp-iID.html không có slug → không rút được từ khóa.
    expect(lazadaSlugKeyword('https://www.lazada.vn/products/pdp-i3199369524.html')).toBeUndefined();
    expect(lazadaCountry('https://www.lazada.vn/x')).toBe('vn');
    expect(lazadaCountry('https://www.lazada.co.th/x')).toBe('th');
  });

  it('buildPlan: taobao = product + reviews + 3 AI e-commerce; KHÔNG tham gia tổng thể e-commerce', async () => {
    const tb = buildPlan({ platform: 'taobao', channels: [{ kind: 'taobao' }], options });
    expect(tb.map((s) => s.action)).toEqual([
      'product', 'reviews', 'analyzeShopeeProduct', 'analyzeShopeeReviews', 'analyzeShopeeSummary',
    ]);
    // Tổng thể e-commerce chỉ gồm 3 sàn Shopee/TikTok Shop/Lazada - Taobao đứng riêng.
    const { ECOM_SEARCH_KINDS, ECOM_KINDS } = await import('../src/lib/social/types');
    expect(ECOM_SEARCH_KINDS).not.toContain('taobao');
    expect(ECOM_KINDS).toContain('taobao'); // vẫn là kind e-commerce (chỉ số/gate/render dùng chung)
  });

  it('buildPlan: taobao theo TÊN có bước search trước; taobaoshop = page + shop + 3 reviews + 3 AI shop', () => {
    const byName = buildPlan({
      platform: 'taobao',
      keyword: 'tai nghe bluetooth',
      channels: [{ kind: 'taobao' }],
      options,
    });
    expect(byName.map((s) => s.action)).toEqual([
      'search', 'product', 'reviews', 'analyzeShopeeProduct', 'analyzeShopeeReviews', 'analyzeShopeeSummary',
    ]);
    const shop = buildPlan({ platform: 'taobaoshop', channels: [{ kind: 'taobaoshop' }], options });
    expect(shop.map((s) => s.action)).toEqual([
      'page', 'shop', 'reviews', 'reviews', 'reviews',
      'analyzeShopCatalog', 'analyzeShopCustomers', 'analyzeShopSummary',
    ]);
  });

  it('taobaoUserIdFromUrl + input search/shopCatalog + chọn seller khớp tên shop', async () => {
    const {
      taobaoUserIdFromUrl, taobaoSearchInput, taobaoShopCatalogInput,
      normalizeTaobaoSearchItems, pickTaobaoSeller,
    } = await import('../src/lib/social/apify');
    expect(
      taobaoUserIdFromUrl('https://store.taobao.com/shop/view_shop.htm?user_number_id=123456789'),
    ).toBe('123456789');
    expect(taobaoUserIdFromUrl('https://shop104050320.taobao.com/')).toBeUndefined();
    expect(taobaoSearchInput('降噪蓝牙耳机', 1)).toEqual({
      operation: 'keywordSearch', keyword: '降噪蓝牙耳机', sort: '_sale', maxPages: 1,
    });
    // ~30 sản phẩm/trang → postsLimit 40 = 2 trang.
    expect(taobaoShopCatalogInput('123', 2)).toEqual({
      operation: 'shopCatalog', userId: '123', catalogVersion: 'v1', sort: '_sale', maxPages: 2,
    });

    const rows = normalizeTaobaoSearchItems([
      { itemId: '111', title: '小米耳机 Pro', priceYuan: 199, shopId: 1, shopName: '小米官方旗舰店', userId: '901', orderCount30Day: 500 },
      { itemId: '222', title: '小米耳机 Lite', priceYuan: 99, shopId: 1, shopName: '小米官方旗舰店', userId: '901' },
      { itemId: '333', title: '耳机套', priceYuan: 9, shopId: 2, shopName: '别的小店', userId: '902' },
      { status: 'error' },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].product.currency).toBe('CNY');
    expect(rows[0].product.sold30d).toBe(500);
    expect(rows[0].userId).toBe('901');
    // Khớp theo tên shop (bỏ dấu/thường hóa) → chọn đúng seller, không lấy shop khác.
    const seller = pickTaobaoSeller(rows, '小米官方旗舰店');
    expect(seller?.shopName).toBe('小米官方旗舰店');
    expect(seller?.userId).toBe('901');
    // Không khớp tên nào → rơi về seller xuất hiện nhiều nhất.
    expect(pickTaobaoSeller(rows, 'khong-ton-tai')?.userId).toBe('901');
  });

  it('taobaoItemId + input actor Taobao (sian.agency): detail v9, reviews maxPages theo limit', async () => {
    const { APIFY_ACTORS, taobaoItemId, taobaoDetailInput, taobaoReviewsInput } =
      await import('../src/lib/social/apify');
    expect(APIFY_ACTORS.taobao).toBe('sian.agency~taobao-tmall-product-scraper');
    expect(taobaoItemId('https://item.taobao.com/item.htm?id=744983869996')).toBe('744983869996');
    expect(taobaoItemId('https://detail.tmall.com/item.htm?spm=a21n57&id=683250696645&skuId=1')).toBe('683250696645');
    expect(taobaoItemId('https://world.taobao.com/item/744983869996.htm')).toBe('744983869996');
    expect(taobaoItemId('744983869996')).toBe('744983869996');
    expect(taobaoItemId('https://shopee.vn/x-i.1.2')).toBeUndefined();
    expect(taobaoDetailInput('744983869996')).toEqual({
      operation: 'productDetail', itemId: '744983869996', detailVersion: 'v9',
    });
    // 20 đánh giá/trang → 30 cần 2 trang; trần 5 trang (100 đánh giá).
    expect(taobaoReviewsInput('744983869996', 30)).toEqual({
      operation: 'productReviews', itemId: '744983869996', orderType: 'feedbackdate', maxPages: 2,
    });
    expect((taobaoReviewsInput('1', 100) as { maxPages: number }).maxPages).toBe(5);
  });

  it('normalizeTaobaoProduct/Review: row productDetail + productReviews của sian.agency', async () => {
    const { normalizeTaobaoProduct, normalizeTaobaoReview } = await import('../src/lib/social/apify');
    const p = normalizeTaobaoProduct(
      [
        {
          _operation: 'productDetail',
          itemId: '744983869996',
          title: '无线蓝牙耳机 降噪',
          priceYuan: 129,
          promotionPriceYuan: 99,
          priceRange: '99-159',
          discountPct: 23,
          sellCount: '2000+',
          commentCount: 512,
          itemGradeAvg: 4.8,
          skus: [
            { propName: '星空黑', price: 99, quantity: 120 },
            { propName: '云雾白', price: 109, quantity: 80 },
          ],
          imageUrls: ['https://img.alicdn.com/a.jpg'],
          attributes: [{ name: '品牌', value: 'XYZ' }],
          shopId: 104050320,
          shopName: 'XYZ官方旗舰店',
          location: '广东深圳',
        },
      ],
      'https://item.taobao.com/item.htm?id=744983869996',
    );
    expect(p?.name).toBe('无线蓝牙耳机 降噪');
    expect(p?.itemId).toBe('744983869996');
    expect(p?.currency).toBe('CNY');
    expect(p?.priceMin).toBe(99);
    expect(p?.priceMax).toBe(159);
    expect(p?.discount).toBe('23%');
    expect(p?.ratingStar).toBe(4.8);
    expect(p?.sold).toBe(2000); // "2000+" → 2000
    expect(p?.stock).toBe(200); // tổng quantity các SKU
    expect(p?.variants?.map((v) => v.name)).toEqual(['星空黑', '云雾白']);
    expect(p?.attributes).toEqual({ 品牌: 'XYZ' });
    expect(p?.shopName).toBe('XYZ官方旗舰店');

    const rv = normalizeTaobaoReview({
      _operation: 'productReviews',
      _sourceItemId: '744983869996',
      reviewContent: '音质很好，降噪效果明显',
      reviewAppend: '用了一个月依然很好',
      reviewDate: '2026-03-14',
      reviewRatingStars: 5,
      reviewSkuLabel: '颜色分类: 星空黑',
      reviewPhotos: ['https://img.alicdn.com/r.jpg'],
      reviewUsefulCount: 3,
      reviewerNick: '小***明',
    });
    expect(rv?.rating).toBe(5);
    expect(rv?.text).toBe('音质很好，降噪效果明显 | 用了一个月依然很好');
    expect(rv?.variant).toBe('颜色分类: 星空黑');
    expect(rv?.time?.slice(0, 10)).toBe('2026-03-14');
    expect(rv?.mediaCount).toBe(1);
    expect(rv?.itemId).toBe('744983869996');
    // Row không có cả sao lẫn chữ → bỏ.
    expect(normalizeTaobaoReview({ _operation: 'productReviews' })).toBeUndefined();
  });

  it('normalizeLzItems: dạng record thật (product + review), parse "11.1K sold"/"42% Off"', async () => {
    const { normalizeLzItems, lazadaShopInfoFromProducts } = await import('../src/lib/social/apify');
    const { products, reviews } = normalizeLzItems(
      [
        {
          record_type: 'product', product_id: '3199369524',
          product_url: 'https://www.lazada.vn/products/pdp-i3199369524.html',
          product_name: 'Combo 2 - Bigsize Winter Melon Makeup Remover 500ml',
          pricing: { current_price: '348000', display_price: '₫348,000', original_price: '598000', discount: '42% Off' },
          inventory: { in_stock: true, item_sold: '11.1K sold' },
          ratings: { rating_score: '4.973102785782901', review_count: '2082' },
          vendor: { seller_name: 'Cocoon Vietnam', seller_id: '200160567712', location: 'Vietnam' },
          media: { primary_image: 'https://img/1.jpg' },
        },
        {
          record_type: 'review', product_id: '3199369524',
          review: {
            review_id: 464227032969524, buyer_name: 'Mr H', rating: 5,
            review_time: '2 weeks ago',
            review_content_list: [{ attribute: '', content: 'Đã nhận hàng, tẩy trang sạch da' }],
            like_count: 2, media: [{ mediaType: 2 }, { mediaType: 1 }],
          },
        },
      ],
      'vn',
    );
    expect(products).toHaveLength(1);
    expect(products[0].priceMin).toBe(348000);
    expect(products[0].discount).toBe('42%'); // bỏ chữ "Off"
    expect(products[0].sold).toBe(11100); // "11.1K sold"
    expect(products[0].ratingStar).toBe(4.97); // làm tròn 2 chữ số
    expect(products[0].ratingCount).toBe(2082);
    expect(products[0].shopName).toBe('Cocoon Vietnam');
    expect(products[0].currency).toBe('VND');
    expect(reviews).toHaveLength(1);
    expect(reviews[0].author).toBe('Mr H');
    expect(reviews[0].text).toContain('tẩy trang sạch da');
    expect(reviews[0].mediaCount).toBe(2);
    expect(reviews[0].itemId).toBe('3199369524'); // gắn đánh giá về đúng sản phẩm
    const info = lazadaShopInfoFromProducts(products, 'https://www.lazada.vn/shop/cocoon-vietnam');
    expect(info?.name).toBe('Cocoon Vietnam');
    expect(info?.url).toBe('https://www.lazada.vn/shop/cocoon-vietnam');
  });

  it('normalizeShopeeSearchItems: item detail (fetchDetail) → sản phẩm kèm TÊN SHOP + URL tự dựng', async () => {
    const { normalizeShopeeSearchItems } = await import('../src/lib/social/apify');
    const out = normalizeShopeeSearchItems(
      [{
        shop_id: 1604461326, item_id: 999888, title: 'Nước tẩy trang X', currency: 'VND',
        price: 39700, price_min: 39700, discount_pct: 50, rating_star: 4.9,
        shop: { name: 'Gia Đình Xinh 10', location: 'Thành phố Hồ Chí Minh', rating_star: 4.77 },
      }],
      'vn',
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://shopee.vn/product/1604461326/999888');
    expect(out[0].shopName).toBe('Gia Đình Xinh 10');
    expect(out[0].priceMin).toBe(39700);
  });

  it('normalizeTtsSearchProducts: giữ MỌI seller (khác chế độ danh mục shop có lọc)', async () => {
    const { normalizeTtsSearchProducts } = await import('../src/lib/social/apify');
    const mk = (id: string, seller: string) => ({
      product_id: id, product_name: 'SP ' + id, real_price: '100000', product_rating: '4.5',
      review_count: '10', total_sale_cnt: '1K', seller: { seller_id: 's' + id, seller_name: seller },
    });
    const out = normalizeTtsSearchProducts([mk('1', 'Shop A'), mk('2', 'Shop B')], 'VN');
    expect(out).toHaveLength(2);
    expect(out[0].shopName).toBe('Shop A');
    expect(out[1].shopName).toBe('Shop B');
  });

  it('report body ECOM: mục danh mục có tiền tố tên sàn + phân tích thị trường', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({
      platform: 'ecom', keyword: 'tẩy trang',
      channels: [{ kind: 'shopee' }, { kind: 'tiktokshop' }, { kind: 'lazada' }], options,
    });
    const mkCh = (kind: 'shopee' | 'tiktokshop' | 'lazada') => ({
      kind, url: '', posts: [], reels: [], ads: [], comments: [],
      shopProducts: [{
        name: `SP ${kind}`, url: 'u', priceMin: 100000, currency: 'VND', ratingStar: 4.5,
        shopName: 'Shop X',
        // Lazada/TikTok Shop có đã bán; TikTok Shop kèm nhịp 7/30 ngày (biểu đồ tăng/giảm).
        ...(kind === 'shopee' ? {} : { sold: 5000 }),
        ...(kind === 'tiktokshop' ? { sold7d: 700, sold30d: 1500 } : {}),
      }],
      shopMetrics: { productsCollected: 1, currency: 'VND', priceMin: 100000, priceMax: 100000, priceAvg: 100000, ratingAvg: 4.5, withDiscount: 0 },
    });
    const html = buildSocialReportBody(
      {
        id: 'sr_ecom', platform: 'ecom', title: 'tẩy trang', keyword: 'tẩy trang', locale: 'vi',
        status: 'done', plan, stepIndex: plan.length, warnings: [], options,
        channels: [mkCh('shopee'), mkCh('tiktokshop'), mkCh('lazada')],
        analysis: {
          ecomMarket: { overview: 'Thị trường sôi động', platforms: [{ name: 'Shopee', desc: 'x' }], pricing: 'Giá phổ biến 100k', demand: [{ name: 'Combo', desc: 'y' }] },
          ecomCompetitors: { overview: 'Phân mảnh', competitors: [{ name: 'Shop X', desc: 'z' }], strategies: [{ name: 'Giá rẻ', desc: 'w' }] },
          ecomSummary: { summary: 'Đáng vào', opportunities: [{ name: 'Khoảng trống', desc: 'a' }], risks: [{ name: 'Đối thủ mạnh', desc: 'b' }], entryPlan: 'Vào TikTok Shop trước', contentIdeas: [] },
        },
        createdAt: '2026-07-12T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z',
      },
      L,
    );
    // Biểu đồ thị trường đứng đầu: giá TB / top đã bán / đánh giá TB / nhịp 7 vs 30 ngày.
    expect(html).toContain('[ecomChartsTitle]');
    expect(html).toContain('[chartPriceAvg]');
    expect(html).toContain('[chartTopSold]');
    expect(html).toContain('[chartRatingAvg]');
    expect(html).toContain('[chartTrend]');
    // Nhịp bán: (700/7)/(1500/30)=2 → +100%; Shopee không có sold → có ghi chú.
    expect(html).toContain('+100%');
    expect(html).toContain('[chartSoldNote]');
    // Biểu đồ dựng bằng BẢNG (Word-safe) - không flex/svg trong khối chart.
    expect(html).not.toContain('<svg class="chart');
    // Mỗi sàn 1 cụm mục có tiền tố tên sàn.
    expect(html).toContain('Shopee - [productsTitle]');
    expect(html).toContain('TikTok Shop - [productsTitle]');
    expect(html).toContain('Lazada - [productsTitle]');
    // Các mục phân tích thị trường.
    expect(html).toContain('[ecomOverview]');
    expect(html).toContain('[ecomPlatforms]');
    expect(html).toContain('[ecomPricing]');
    expect(html).toContain('[ecomCompetitors]');
    expect(html).toContain('[ecomOppRisks]');
    expect(html).toContain('[ecomEntryPlan]');
    expect(html).toContain('Vào TikTok Shop trước');
    expect(html).not.toContain('[organicPosts]');
  });

  it('report body TỔNG THỂ SOCIAL: có biểu đồ follower/tương tác theo kênh', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({
      platform: 'overall', keyword: 'x',
      channels: [{ kind: 'facebook' }, { kind: 'tiktok' }], options,
    });
    const html = buildSocialReportBody(
      {
        id: 'sr_ov', platform: 'overall', title: 'x', keyword: 'x', locale: 'vi',
        status: 'collected', plan, stepIndex: plan.length, warnings: [], options,
        channels: [
          {
            kind: 'facebook', url: '', posts: [], reels: [], ads: [], comments: [],
            page: { name: 'Page A', url: 'u', followers: 1000 },
            metrics: { postCount: 5, formatDist: {}, weekdayDist: {}, adFormatDist: {}, ctaDist: {}, commentCount: 0, avgReactions: 50 },
          },
          {
            kind: 'tiktok', url: '', posts: [], reels: [], ads: [], comments: [],
            page: { name: 'Kênh B', url: 'u', followers: 8000 },
            metrics: { postCount: 5, formatDist: {}, weekdayDist: {}, adFormatDist: {}, ctaDist: {}, commentCount: 0, avgReactions: 200, avgViews: 9000 },
          },
        ],
        analysis: {}, createdAt: '2026-07-12T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z',
      },
      L,
    );
    expect(html).toContain('[socialChartsTitle]');
    expect(html).toContain('[chartFollowers]');
    expect(html).toContain('[chartEngagement]');
    expect(html).toContain('[chartViews]');
    expect(html).toContain('Page A');
  });

  it('báo cáo ĐƠN KÊNH social: biểu đồ thời gian đăng / top bài / định dạng / thứ trong tuần', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({ platform: 'facebook', channels: [{ kind: 'facebook' }], options });
    const mkPost = (id: string, day: string, reactions: number, type = 'image') => ({
      id, type: type as 'image', url: `https://fb.com/${id}`, time: `2026-07-${day}T10:00:00Z`,
      reactions, comments: 5, shares: 1,
    });
    const html = buildSocialReportBody(
      {
        id: 'sr_fb', platform: 'facebook', title: 'Page A', locale: 'vi', status: 'collected',
        plan, stepIndex: plan.length, warnings: [], options,
        channels: [{
          kind: 'facebook', url: 'https://fb.com/a', reels: [], ads: [], comments: [],
          posts: [mkPost('p1', '01', 100), mkPost('p2', '05', 300, 'video'), mkPost('p3', '09', 50)],
          page: { name: 'Page A', url: 'u', followers: 1000 },
          metrics: {
            postCount: 3, formatDist: { image: 2, video: 1 }, weekdayDist: { '3': 2, '6': 1 },
            adFormatDist: {}, ctaDist: {}, commentCount: 0, avgReactions: 150,
          },
        }],
        analysis: {}, createdAt: '2026-07-12T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z',
      },
      L,
    );
    expect(html).toContain('[channelChartsTitle]');
    expect(html).toContain('[chartTimeline]');
    expect(html).toContain('[chartTopPosts]');
    expect(html).toContain('[formatDist]');
    expect(html).toContain('[chartWeekday]');
  });

  it('báo cáo SHOP e-commerce: biểu đồ top bán chạy + phân bổ giá + phân bổ sao + nhịp 7/30 (tts)', () => {
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const plan = buildPlan({ platform: 'tiktokshopshop', channels: [{ kind: 'tiktokshopshop' }], options });
    const mkP = (i: number, price: number, sold: number) => ({
      name: `SP ${i}`, url: `u${i}`, itemId: String(i), priceMin: price, currency: 'VND',
      ratingStar: 4.5, sold, sold7d: 70, sold30d: 600,
    });
    const html = buildSocialReportBody(
      {
        id: 'sr_tshop', platform: 'tiktokshopshop', title: 'Shop X', locale: 'vi', status: 'collected',
        plan, stepIndex: plan.length, warnings: [], options,
        channels: [{
          kind: 'tiktokshopshop', url: 'Shop X', posts: [], reels: [], ads: [], comments: [],
          shopProducts: [mkP(1, 50000, 900), mkP(2, 120000, 500), mkP(3, 200000, 300), mkP(4, 350000, 100)],
          shopMetrics: { productsCollected: 4, currency: 'VND', priceMin: 50000, priceMax: 350000, priceAvg: 180000, ratingAvg: 4.5, withDiscount: 0 },
          productReviews: [{ rating: 5, text: 'a' }, { rating: 2, text: 'b' }],
          productMetrics: { ratingAvg: 3.5, ratingDist: { '5': 1, '2': 1 }, reviewsCollected: 2, withText: 2, withMedia: 0, sellerReplies: 0 },
        }],
        analysis: {}, createdAt: '2026-07-12T00:00:00Z', updatedAt: '2026-07-12T00:00:00Z',
      },
      L,
    );
    expect(html).toContain('[channelChartsTitle]');
    expect(html).toContain('[chartTopSold]');
    expect(html).toContain('[chartPriceBuckets]');
    expect(html).toContain('[ratingDist]');
    expect(html).toContain('[chartTrend]');
    // Nhịp bán: (70/7)/(600/30)=0.5 → -50% (thanh đỏ theo theme).
    expect(html).toContain('-50%');
    // Số liệu PHẢI có đơn vị; phân bổ sao dạng DONUT ở trang xem.
    expect(html).toContain('[unitSold]');
    expect(html).toContain('[unitProducts]');
    expect(html).toContain('[unitReviews]');
    expect(html).toContain('conic-gradient');
  });
});

describe('buildSocialReportHtml', () => {
  const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
  const options = {
    postsLimit: 10, reelsLimit: 10, adsLimit: 10, commentsLimit: 30,
    includeReels: true, includeAds: true, includeComments: true,
  };
  const plan = buildPlan({ platform: 'facebook', channels: [{ kind: 'facebook' }], options });
  const report: SocialReportRecord = {
    id: 'sr_test',
    platform: 'facebook',
    title: 'Trang <b>Thử</b>',
    locale: 'vi',
    status: 'done',
    plan,
    stepIndex: plan.length,
    warnings: [],
    options,
    channels: [
      {
        kind: 'facebook',
        url: 'https://www.facebook.com/x',
        page: { name: 'Trang <b>Thử</b>', url: 'u', likes: 10, followers: 20 },
        posts: [post({ id: 'p1', text: 'Nội dung <script>alert(1)</script>', reactions: 5 })],
        reels: [],
        ads: [{ id: 'ad1', text: 'Ad text', cta: 'Learn more' }],
        comments: [],
        metrics: computeMetrics({
          page: { name: 'T', url: 'u', likes: 10, followers: 20 },
          posts: [post({ id: 'p1', reactions: 5 })],
          reels: [], ads: [], comments: [],
        }),
      },
    ],
    metrics: computeMetrics({
      page: { name: 'T', url: 'u', likes: 10, followers: 20 },
      posts: [post({ id: 'p1', reactions: 5 })],
      reels: [], ads: [], comments: [],
    }),
    analysis: {
      brand: {
        positioning: 'Định vị — thử',
        voice: 'Giọng',
        targetAudience: 'SMEs',
        contentPillars: [{ name: 'Giáo dục', desc: 'Chia sẻ', effectiveness: 'Tốt', posts: 'Bài 1' }],
        contentFormulas: [],
      },
      summary: {
        summary: 'Tóm tắt',
        strengths: [{ name: 'Mạnh', desc: 'Dẫn chứng' }],
        weaknesses: [],
        avoid: [],
        learnFrom: [],
        contentIdeas: [{ title: 'Ý tưởng', desc: 'Mô tả', reason: 'Lý do' }],
      },
    },
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
  };

  it('escape mọi nội dung (không lọt HTML thô từ dữ liệu)', () => {
    const html = buildSocialReportBody(report, L);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Thử&lt;/b&gt;');
  });

  it('document hoàn chỉnh có head + body và đủ các mục', () => {
    const html = buildSocialReportHtml(report, L);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('[organicPosts]');
    expect(html).toContain('[adsTitle]');
    expect(html).toContain('[positioning]');
    expect(html).toContain('[strategySummary]');
    expect(html).toContain('[contentIdeas]');
  });

  it('socialReportFileName bỏ dấu tiếng Việt, an toàn', () => {
    expect(socialReportFileName(report, 'doc')).toBe('social-report-trang-b-thu-b.doc');
  });

  it('chế độ thu gọn: mỗi mục là <details> đóng mặc định; bản xuất thì không có', () => {
    const collapsed = buildSocialReportBody(report, L, { collapsible: true });
    expect(collapsed).toContain('<details class="sr-sec">');
    expect(collapsed).not.toContain('<details open');
    expect(collapsed).toContain('[organicPosts]');
    expect(collapsed).toContain('[adsTitle]');
    // Bản xuất (mặc định) mở hết - không dùng details.
    const expanded = buildSocialReportBody(report, L);
    expect(expanded).not.toContain('<details');
  });

  it('bản .doc/Drive dùng bố cục tương thích Word: bảng thay flex, không SVG/gradient', () => {
    // Word/Google Docs không hỗ trợ flexbox/gradient/SVG → bản xuất .doc (không print)
    // phải dựng thẻ chỉ số + hero bằng <table>, bỏ icon SVG. Đây là fix cho lỗi
    // "file doc trên Drive bị vỡ bố cục".
    const doc = buildSocialReportHtml(report, L);
    expect(doc).not.toContain('display:flex');
    expect(doc).not.toContain('<svg');
    expect(doc).not.toContain('linear-gradient');
    expect(doc).not.toContain('conic-gradient'); // donut chart phải rơi về cột ngang dạng bảng
    expect(doc).toContain('<table'); // thẻ chỉ số + hero dạng bảng
    expect(doc).toContain(`background-color:#005bd3`); // hero nền đặc màu nhấn
    // Bản IN (print) chạy trong trình duyệt → giữ bố cục đầy đủ (flex + gradient + icon).
    const print = buildSocialReportHtml(report, L, { print: true });
    expect(print).toContain('display:flex');
    expect(print).toContain('linear-gradient');
    expect(print).toContain('<svg');
    // Trang xem trong app cũng giữ nguyên bố cục đầy đủ.
    const view = buildSocialReportBody(report, L, { collapsible: true });
    expect(view).toContain('display:flex');
    expect(view).toContain('<svg');
  });

  it('bản xuất gắn logo + dòng nguồn thương hiệu (escape URL)', () => {
    const html = buildSocialReportHtml(report, L, {
      brand: {
        logo: 'https://noti.vn/logo.png?a=1&b="2"',
        sourceText: 'by: noti.vn',
        sourceUrl: 'https://noti.vn',
      },
    });
    expect(html).toContain('https://noti.vn/logo.png?a=1&amp;b=&quot;2&quot;');
    expect(html).toContain('by: noti.vn');
    expect(html).toContain('href="https://noti.vn"');
    // Không truyền brand → không có khối logo/nguồn.
    const plain = buildSocialReportHtml(report, L);
    expect(plain).not.toContain('noti.vn');
  });

  it('chế độ in (PDF): tắt header/footer trình duyệt + logo/nguồn lặp mọi trang', () => {
    const html = buildSocialReportHtml(report, L, {
      brand: { logo: 'https://noti.vn/logo.png', sourceText: 'by: noti.vn' },
      print: true,
    });
    // margin 0 → trình duyệt không vẽ được ngày giờ/title/số trang ở lề.
    expect(html).toContain('@page{margin:0}');
    // Thanh fixed lặp trên mọi trang + thead/tfoot giữ chỗ.
    expect(html).toContain('class="pr-head"');
    expect(html).toContain('class="pr-foot"');
    expect(html).toContain('<thead><tr><td><div class="pr-hspace">');
    expect(html).toContain('<tfoot><tr><td><div class="pr-fspace">');
    // Bản .doc (không print) thì KHÔNG có @page margin 0 (giữ lề Word).
    const doc = buildSocialReportHtml(report, L, { brand: { sourceText: 'x' } });
    expect(doc).not.toContain('@page');
  });

  it('bố cục theo nền tảng: YouTube không có ô chia sẻ, có subscriber/tổng view; TikTok có Tim', () => {
    const mk = (kind: 'tiktok' | 'youtube'): SocialReportRecord => ({
      ...report,
      platform: kind,
      channels: [
        {
          kind,
          url: 'u',
          page: { name: 'Kênh X', url: 'u', followers: 1000, likes: kind === 'tiktok' ? 5000 : undefined },
          posts: [post({ id: 'v1', type: 'video', views: 999, reactions: 50, comments: 3, shares: 7 })],
          reels: [],
          ads: [],
          comments: [],
          metrics: computeMetrics({
            page: { name: 'Kênh X', url: 'u', followers: 1000 },
            posts: [post({ id: 'v1', type: 'video', views: 999, reactions: 50, comments: 3 })],
            reels: [], ads: [], comments: [],
          }),
        },
      ],
    });
    const yt = buildSocialReportBody(mk('youtube'), L);
    expect(yt).toContain('[subscribers]');
    expect(yt).toContain('[totalViews]');
    expect(yt).toContain('[ytLikes]');
    expect(yt).not.toContain('[shares]'); // YouTube không có chỉ số chia sẻ
    expect(yt).not.toContain('[rating]'); // và không có ô đánh giá kiểu Facebook
    const tt = buildSocialReportBody(mk('tiktok'), L);
    expect(tt).toContain('[hearts]');
    expect(tt).toContain('[shares]');
    expect(tt).not.toContain('[lfRatio]');
    // Nhãn theo kênh: "Chỉ số kênh" + "Video của kênh" + thẻ "Video N" (không phải fanpage/Bài).
    for (const html of [yt, tt]) {
      expect(html).toContain('[metricsTitleChannel]');
      expect(html).toContain('[videosTitle]');
      expect(html).toContain('[videoItem] 1');
      expect(html).not.toContain('[metricsTitle]');
      expect(html).not.toContain('[organicPosts]');
      expect(html).not.toContain('[post] 1');
    }
  });

  it('tổng thể: header có hàng chỉ số riêng từng kênh + mục chỉ số tổng hợp', () => {
    const overall: SocialReportRecord = {
      ...report,
      platform: 'overall',
      title: 'chủ đề x',
      keyword: 'chủ đề x',
      channels: [
        report.channels[0],
        {
          kind: 'tiktok', url: '', posts: [post({ id: 'v2', type: 'video', views: 10 })],
          reels: [], ads: [], comments: [],
          metrics: computeMetrics({ posts: [post({ id: 'v2', type: 'video', views: 10 })], reels: [], ads: [], comments: [] }),
        },
      ],
    };
    const html = buildSocialReportBody(overall, L);
    expect(html).toContain('[totalMetricsTitle]');
    expect(html).toContain('[keywordLabel]');
    expect(html).toContain('TikTok'); // tiền tố kênh trong tiêu đề mục + hàng chỉ số
  });

  it('theme màu tùy chỉnh áp vào tiêu đề mục và khối SWOT', () => {
    const html = buildSocialReportHtml(report, L, {
      theme: { accent: '#ff0066', strength: '#00aa55' },
    });
    expect(html).toContain('#ff0066');
    expect(html).toContain('#00aa55');
    expect(html).not.toContain('#005bd3'); // accent mặc định đã bị thay
    // Build sau KHÔNG truyền theme → trở về mặc định (theme không "dính" giữa các lần build).
    const plain = buildSocialReportHtml(report, L);
    expect(plain).toContain('#005bd3');
    expect(plain).not.toContain('#ff0066');
  });
});

describe('xuất style thương hiệu (Markdown + Prompt)', () => {
  const SL = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
  const profile: SocialStyleProfile = {
    summary: 'Giọng trẻ trung, số liệu cụ thể.',
    toneOfVoice: 'Thân mật, hài hước nhẹ.',
    addressing: 'Xưng "mình", gọi "bạn".',
    vocabulary: 'Hay dùng "chốt đơn", emoji tên lửa.',
    sentencePatterns: 'Câu ngắn, nhiều câu hỏi tu từ.',
    argumentation: 'Nỗi đau trước, số liệu sau.',
    contentFormulas: 'Hook câu hỏi - 3 gạch đầu dòng - CTA.',
    storytelling: 'Kể chuyện khách hàng thật.',
    signatureTraits: 'Luôn kết bằng câu hỏi mở.',
    signaturePhrases: ['Chốt đơn ngay hôm nay!', 'Bạn đã thử chưa?'],
    doList: ['Dùng câu ngắn'],
    dontList: ['Không dùng từ đao to búa lớn'],
  };

  it('Markdown: đủ mục theo thứ tự + danh sách gạch đầu dòng', () => {
    const md = buildStyleMarkdown(profile, SL, 'Thương hiệu X');
    expect(md.startsWith('# [title]: Thương hiệu X')).toBe(true);
    for (const k of ['[toneOfVoice]', '[addressing]', '[vocabulary]', '[argumentation]',
      '[contentFormulas]', '[signatureTraits]', '[signaturePhrases]', '[doList]', '[dontList]']) {
      expect(md).toContain(`## ${k}`);
    }
    expect(md).toContain('- "Chốt đơn ngay hôm nay!"');
    expect(md).toContain('- Dùng câu ngắn');
    // Thứ tự: tông giọng đứng trước công thức.
    expect(md.indexOf('[toneOfVoice]')).toBeLessThan(md.indexOf('[contentFormulas]'));
  });

  it('Prompt: mở đầu bằng promptIntro, kết bằng promptOutro, chứa đủ nội dung', () => {
    // Proxy không spread được (mất get-trap) → tạo proxy mới có override promptIntro.
    const labels = new Proxy({ promptIntro: 'INTRO Thương hiệu X' } as Record<string, string>, {
      get: (t, k) => t[k as string] ?? `[${String(k)}]`,
    });
    const pr = buildStylePrompt(profile, labels, 'Thương hiệu X');
    expect(pr.startsWith('INTRO Thương hiệu X')).toBe(true);
    expect(pr.trimEnd().endsWith('[promptOutro]')).toBe(true);
    expect(pr).toContain('[toneOfVoice]: Thân mật, hài hước nhẹ.');
    expect(pr).toContain('- "Bạn đã thử chưa?"');
  });

  it('mục rỗng bị bỏ qua, không để heading trống', () => {
    const md = buildStyleMarkdown({ ...profile, storytelling: '', doList: [] }, SL, 'X');
    expect(md).not.toContain('[storytelling]');
    expect(md).not.toContain('## [doList]');
  });

  it('styleFileName bỏ dấu an toàn', () => {
    expect(styleFileName('Thương hiệu X')).toBe('brand-style-thuong-hieu-x.md');
  });
});

describe('transcript video (phụ đề → lời thoại)', () => {
  it('parseSubtitles: WebVTT bỏ header/timestamp/tag, khử lặp liên tiếp', async () => {
    const { parseSubtitles } = await import('../src/lib/social/subtitles');
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
Xin chào <c.colorE5E5E5>các bạn</c>

00:00:02.000 --> 00:00:04.000
Xin chào các bạn

00:00:04.000 --> 00:00:06.000
Hôm nay mình review sản phẩm mới`;
    expect(parseSubtitles(vtt)).toBe('Xin chào các bạn Hôm nay mình review sản phẩm mới');
  });

  it('parseSubtitles: SRT bỏ số thứ tự; JSON captions đọc mảng text', async () => {
    const { parseSubtitles } = await import('../src/lib/social/subtitles');
    const srt = `1
00:00:00,320 --> 00:00:04,960
Ever feel like

2
00:00:05,000 --> 00:00:08,000
your content is invisible?`;
    expect(parseSubtitles(srt)).toBe('Ever feel like your content is invisible?');
    expect(parseSubtitles('{"captions":[{"text":"câu một"},{"text":"câu hai"}]}')).toBe('câu một câu hai');
    expect(parseSubtitles('')).toBe('');
  });

  it('TikTok: lấy transcriptUrl từ subtitleLinks, ưu tiên đúng ngôn ngữ rồi bản gốc (không MT)', async () => {
    const { normalizeTiktokVideos } = await import('../src/lib/social/apify');
    const item = {
      id: 'v1',
      webVideoUrl: 'https://www.tiktok.com/@a/video/1',
      videoMeta: {
        subtitleLinks: [
          { language: 'eng-US', downloadLink: 'https://cdn/en.vtt', source: 'MT' },
          { language: 'vie-VN', downloadLink: 'https://cdn/vi.vtt', source: 'ASR' },
        ],
      },
    };
    expect(normalizeTiktokVideos([item], 'vi').posts[0].transcriptUrl).toBe('https://cdn/vi.vtt');
    // Không khớp ngôn ngữ → ưu tiên bản KHÔNG phải machine-translation.
    expect(normalizeTiktokVideos([item], 'ja').posts[0].transcriptUrl).toBe('https://cdn/vi.vtt');
  });

  it('YouTube: phụ đề SRT inline nằm ở transcript (thô, runner sẽ parse)', async () => {
    const { normalizeYoutubeVideos } = await import('../src/lib/social/apify');
    const item = {
      id: 'y1',
      url: 'https://www.youtube.com/watch?v=1',
      title: 'T',
      subtitles: [{ language: 'en', srt: '1\n00:00:0,3 --> 00:00:4,9\nHello world' }],
    };
    expect(normalizeYoutubeVideos([item]).posts[0].transcript).toContain('Hello world');
  });

  it('Facebook Reels: captions_url trong playback_video thành transcriptUrl', async () => {
    const { normalizeReel } = await import('../src/lib/social/apify');
    const p = normalizeReel({
      postId: 'r9',
      url: 'https://www.facebook.com/reel/9',
      playback_video: { captions_url: 'https://scontent.fbcdn.net/x.srt?oe=1' },
    });
    expect(p?.transcriptUrl).toBe('https://scontent.fbcdn.net/x.srt?oe=1');
  });
});

describe('actor transcript chuyên dụng (bước transcript)', () => {
  it('transcriptInput đúng schema từng actor', async () => {
    const { transcriptInput } = await import('../src/lib/social/apify');
    expect(transcriptInput('youtube', ['u1', 'u2'])).toEqual({ videoUrls: ['u1', 'u2'] });
    expect(transcriptInput('tiktok', ['u1'])).toEqual({
      postURLs: ['u1'],
      downloadSubtitlesOptions: 'DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES',
    });
    expect(transcriptInput('facebook', ['u1'])).toEqual({ bulkUrls: [{ url: 'u1' }] });
  });

  it('normalizeTranscriptItems: YouTube text inline, TikTok link file, Facebook transcript STT', async () => {
    const { normalizeTranscriptItems } = await import('../src/lib/social/apify');
    const yt = normalizeTranscriptItems('youtube', [
      { url: 'https://youtube.com/watch?v=1', transcript_only_text: 'hello world' },
      { url: 'https://youtube.com/watch?v=2', transcript: [{ text: 'a' }, { text: 'b' }] },
    ]);
    expect(yt[0]).toEqual({ url: 'https://youtube.com/watch?v=1', text: 'hello world' });
    expect(yt[1].text).toBe('a b');

    const tt = normalizeTranscriptItems('tiktok', [
      { webVideoUrl: 'https://tiktok.com/@a/video/1', videoMeta: { transcriptionLink: 'https://kvs/t.txt' } },
    ]);
    expect(tt[0]).toEqual({ url: 'https://tiktok.com/@a/video/1', fileUrl: 'https://kvs/t.txt' });

    const fb = normalizeTranscriptItems('facebook', [
      { facebookUrl: 'https://facebook.com/reel/9', transcript: 'xin chào cả nhà' },
    ]);
    expect(fb[0]).toEqual({ url: 'https://facebook.com/reel/9', text: 'xin chào cả nhà' });
  });
});

describe('link ngoài trong báo cáo mở tab mới', () => {
  it('URL bài đăng và link nguồn thương hiệu có target=_blank + rel noopener', async () => {
    const { buildSocialReportHtml } = await import('../src/lib/social/report-html');
    const { buildPlan } = await import('../src/lib/social/types');
    const { computeMetrics } = await import('../src/lib/social/metrics');
    const options = {
      postsLimit: 10, reelsLimit: 10, adsLimit: 10, commentsLimit: 30,
      includeReels: true, includeAds: true, includeComments: true,
    };
    const plan = buildPlan({ platform: 'facebook', channels: [{ kind: 'facebook' }], options });
    const L = new Proxy({} as Record<string, string>, { get: (_t, k) => `[${String(k)}]` });
    const html = buildSocialReportHtml(
      {
        id: 'sr_l', platform: 'facebook', title: 'T', locale: 'vi', status: 'done',
        plan, stepIndex: plan.length, warnings: [], options,
        channels: [{
          kind: 'facebook', url: 'u',
          posts: [{ id: 'p1', type: 'image', url: 'https://www.facebook.com/x/posts/1' }],
          reels: [], ads: [], comments: [],
          metrics: computeMetrics({ posts: [], reels: [], ads: [], comments: [] }),
        }],
        analysis: {}, createdAt: '2026-07-11T00:00:00Z', updatedAt: '2026-07-11T00:00:00Z',
      },
      L,
      { brand: { sourceText: 'by noti', sourceUrl: 'https://noti.vn' } },
    );
    // Mọi thẻ <a> trong báo cáo đều phải mở tab mới.
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
  });
});

describe('search theo keyword: giữ top tương tác', () => {
  it('topByEngagement xếp theo reaction+comment+share, view tính 1%', async () => {
    const { topByEngagement, engagementScore } = await import('../src/lib/social/metrics');
    const a = post({ id: 'a', reactions: 100 }); // 100 điểm
    const b = post({ id: 'b', views: 50000 }); // 500 điểm (view/100)
    const c = post({ id: 'c', reactions: 10, comments: 5, shares: 5 }); // 20 điểm
    expect(engagementScore(b)).toBe(500);
    expect(topByEngagement([a, b, c], 2).map((p) => p.id)).toEqual(['b', 'a']);
    // Không phá mảng gốc
    expect([a, b, c].map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('fbSearchInput: pool nghiêng về bài tương tác cao', () => {
  it('dùng ranking liên quan (recent_posts=false) + giới hạn 12 tháng', async () => {
    const { fbSearchInput } = await import('../src/lib/social/apify');
    const input = fbSearchInput('mỹ phẩm', 30) as Record<string, unknown>;
    expect(input.recent_posts).toBe(false);
    expect(input.search_type).toBe('posts');
    expect(input.max_results).toBe(30);
    // start_date = ngày (YYYY-MM-DD) khoảng 1 năm trước.
    expect(String(input.start_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.now() - new Date(String(input.start_date)).getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });
});

describe('filterByKeyword: chỉ giữ bài thật sự khớp từ khóa', () => {
  it('khớp không phân biệt dấu/hoa thường, đủ token hoặc nguyên cụm; loại bài lạc đề', async () => {
    const { filterByKeyword } = await import('../src/lib/social/metrics');
    const posts = [
      post({ id: 'a', text: 'Review MỸ PHẨM thuần chay mới nhất' }), // nguyên cụm (khác dấu/hoa)
      post({ id: 'b', text: 'My pham gia re cho sinh vien' }), // không dấu vẫn khớp
      post({ id: 'c', text: 'Tuyển dụng nhân viên bán hàng' }), // lạc đề → loại
      post({ id: 'd', text: 'Phẩm chất của mỹ nhân' }), // đủ token "my"+"pham" rời rạc → vẫn khớp token
      post({ id: 'e', text: undefined }), // không có text → loại
    ];
    const out = filterByKeyword(posts, 'mỹ phẩm').map((p) => p.id);
    expect(out).toContain('a');
    expect(out).toContain('b');
    expect(out).not.toContain('c');
    expect(out).not.toContain('e');
  });

  it('từ khóa rỗng → giữ nguyên', async () => {
    const { filterByKeyword } = await import('../src/lib/social/metrics');
    const posts = [post({ id: 'a', text: 'x' })];
    expect(filterByKeyword(posts, '  ')).toHaveLength(1);
  });
});
