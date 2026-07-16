# User Guide

This document walks you through the software from A to Z: from creating your account, to writing SEO/GEO-optimized articles, to publishing them on your website. You do not need any technical knowledge to follow along.

> Tip: use the "Search the guide" box at the top of the page to jump quickly to the section you need.

> While using the app, wherever you see an (i) icon, click it to read a detailed explanation of that field.

---

## 1. Quick start (3 steps)

Just 3 steps and you will have your first article:

1. **Enter an AI API key** - the software uses AI (Claude, OpenAI, Gemini, DeepSeek) to write and score content. You need to paste the API key from one provider into **Connections** (see section 3).
2. **Connect a website** (not required right away) - if you want to publish articles straight to WordPress, Wix, Shopify, Haravan, Sapo, or Google Sheet, add a connection under **Connections**.
3. **Write your first article** - go to the **Editor**, enter a topic, let the AI create a draft, then edit and score it.

The **Dashboard** page includes a checklist that reminds you to complete steps 1 and 2. Once you finish, the checklist hides itself automatically.

---

## 2. Basic concepts

- **Organization (Biz)**: your workspace. Every article, connection, and team member belongs to an organization. You can create multiple organizations and switch between them using the organization-name selector at the top of the left-hand menu.
- **Article**: a piece of content you write. An article has a status of **Draft** or **Published**.
- **SEO / AEO / GEO scores**: three measures of an article's quality:
  - **SEO**: how well the article is optimized for search engines (Google) - title, description, heading tags, keywords, links.
  - **AEO**: how well the article is optimized to appear in answer boxes (Answer Engine) such as Google AI Overviews.
  - **GEO**: how well the article is optimized for AI systems (ChatGPT, Perplexity, Gemini) to cite it.
- **Token**: the unit that measures how much text the AI processes. "Input tokens" are the data you send to the AI, and "output tokens" are the content the AI produces. AI cost is calculated per token; see details under **Reports**.
- **Connection**: a link to a website/channel for publishing articles (WordPress, Wix, Shopify, Haravan, Sapo, Google Sheet).

---

## 3. Connections: AI API keys and websites

This is where you set up everything the software needs to work. Open **Connections** in the left-hand menu (under the **System** group).

### 3.1. Add an AI API key

The software does not come with AI built in - you use your own API key, so you stay in control of costs and limits.

1. Go to **Connections** → the **AI API Keys** area.
2. Choose a provider: **Claude (Anthropic)**, **OpenAI**, **Gemini (Google)**, or **DeepSeek**.
3. Paste the API key (obtained from that provider's admin page) and click **Save**.
4. Toggle the switch to activate it. You can add multiple providers and choose which one to use as your primary.

> Tip: if you do not have a key yet, sign up for an account with an AI provider, create an API key, then come back and paste it. The key is stored securely and is not shown in full again after saving.

### 3.2. Connect a website to publish

1. Go to **Connections** → the **Website Connections** area → **Add connection**.
2. Choose a platform: **WordPress, Wix, Shopify, Haravan, Sapo**.
3. Follow the instructions shown in the window for each platform (enter the site address, account/application password, or token).
4. Click **Test connection** to make sure the details are correct, then click **Save**.

Once connected, you can publish or update articles directly from the software (see section 11).

---

## 4. Keyword research

The **Keywords** section helps you find and group keywords before writing, so your article matches what searchers are looking for.

1. Go to **Keywords** and enter a seed keyword (for example, "running shoes").
2. The software suggests a set of related keywords along with search intent and frequently asked questions (GEO-style).
3. Select the keywords that fit and save them as a keyword set to use in the planning step.

> Tip: pay attention to the intent column. Keywords like "buy/price" suit sales articles; keywords like "how to/what is" suit how-to articles.

---

## 5. Content planning

The **Plan** section turns a keyword set into a list of articles to write, complete with suggested titles and outlines.

1. Go to **Plan** and choose a keyword set or enter a topic.
2. The software proposes titles and outlines.
3. Review, edit, then move each item to the **Editor** to write it.

This approach helps you build a systematic topic cluster instead of writing in a scattered way.

---

## 6. Editor (writing articles)

The **Editor** section is where you write and finish your article.

1. Enter a **title** and a **target keyword**.
2. Click to have the AI create a **draft** based on the topic. You can also write it yourself or paste in existing content.
3. Use the supporting tools:
   - **Rewrite / expand / shorten** a paragraph.
   - **Humanize**: make the wording sound natural and less robotic.
   - **Fact-check**: review information that is prone to being wrong.
   - **Insert illustrative images**: generate images or suggest images (see section 10).
4. Watch the **SEO / AEO / GEO** scores update in real time, and follow the suggestions to raise them.
5. Click **Save** - the article goes into the **Articles** list with a Draft status.

> Tip: put your main keyword in the title, break the article up with clear headings, and answer the question directly in the opening paragraph - all three are good for both SEO and GEO.

---

## 7. Managing articles

The **Articles** section lists every article in your organization.

- Filter by **status** (Draft / Published) and by **language**.
- Open an article to **keep editing**, **re-score**, **translate**, **optimize**, or **publish** it.
- The score column lets you quickly see which articles need improvement.

> Note: when you edit a published article and publish it again, the software **updates the correct original article on the website** (it does not create a duplicate), as long as you publish through the same connection.

---

## 8. SEO and GEO optimization

The **Optimize** section scores in detail and points out exactly what needs fixing.

1. Select the article to optimize.
2. View the score breakdown by criterion: title, description (meta), heading structure, keyword density, internal links, structured data (schema), likelihood of being cited by AI, and more.
3. Each item that "does not pass" comes with a specific suggestion. Apply the suggestion, then re-score until the score is high.

**About internal links**: only link to articles that are **actually published** (with a real URL). Do not add links to pages that do not exist yet.

**About external links**: any link to another website should open in a new tab so readers do not leave your page.

---

## 9. Translation and multilingual content

The **Translations** section helps you create versions of an article in other languages.

1. Choose the source article and the target language(s).
2. The software does not translate mechanically but **localizes**: it adapts examples, units, and tone, then re-optimizes SEO/GEO for local keywords.
3. Review the translation, edit if needed, then save it as a separate article.

The software interface supports multiple languages; change the display language from the account menu.

---

## 10. Images: settings and compression

### 10.1. Image Settings (illustrative images)

The **Image Settings** section defines how images are generated and inserted into articles: style, aspect ratio, and alt text for SEO.

### 10.2. Image Compress

The **Image Compress** section helps you reduce image file size and convert to **WebP/AVIF** (SEO-friendly and faster to load).

1. Upload an image.
2. Choose the format and compression level.
3. Download the optimized image. The software processes it on the fly and does not store your image.

---

## 11. Publishing articles

### 11.1. Publish to a CMS (WordPress, Wix, Shopify, Haravan, Sapo)

1. Go to **Publish** (or open an article and choose to publish).
2. Choose the target website **connection**.
3. Check the title, URL (slug), description, and cover image.
4. Click **Publish**. If it is an article you published before, the software will **update** the correct original article.

### 11.2. Publish to Google Sheet

Besides a CMS, you can push articles into a **Google Sheet** (for example, for another team to process further). Connect Google once, choose the target spreadsheet, and the software writes each article as a row and updates it by slug.

### 11.3. Publishing schedule

The **Calendar** section lets you schedule publishing: choose a date and time for each article so content goes out steadily instead of all at once.

---

## 12. Checks and audits

- **Audit**: scan a page/article to score its SEO health and point out the errors to fix.
- **Landing Audit**: examine a sales/landing page specifically, evaluating the headline, call to action, and persuasive structure.

Use these sections to review existing content (including articles not created by the software).

---

## 13. Reports and citations

- **Reports**: view the tokens used, AI cost (converted to your currency), statistics by provider/model and by team member. Use this to control costs.
- **Citations**: suggests reputable sources to reference in your article, helping increase credibility and the likelihood of being cited by AI (GEO).

---

## 14. Tasks and collaboration

If your organization has multiple people, use the **My Tasks** section to work as a team:

- **Assign articles**: owners/managers assign articles to team members to write.
- **Review articles**: an article must be **approved** by someone with permission before it is published. Articles awaiting your review appear in **My Tasks**.
- **Comments**: discuss directly on each article.

Permissions (who can write, publish, approve, manage connections, etc.) are set on the **Organization** page (see section 17).

---

## 15. News feed and notifications

- **Notification bell** (top corner): updates and notifications for you.
- **News feed**: news and tips for using the software. **New** items carry a "New" label; once you open and read an item, its label disappears. There is a **Mark all as read** button to clear them quickly.

---

## 16. Plan and limits

The **Billing / Plan** section shows which plan you are on, how many article-writing credits remain in the period, and the renewal date.

- View your remaining limits and history.
- Upgrade your plan when you need more limits or features.
- If your account is granted extra credits (overage) or unlimited use, that information is shown here too.

---

## 17. Account, security, and organization

### 17.1. Account

The **Account** section (click your name at the bottom of the menu) lets you change your display name and **change your password**. If you forget your password, use the "Forgot password" link on the login page to reset it via email.

### 17.2. Organization (Biz)

Click the organization name at the top of the menu → **manage organization**:

- **Members**: invite people into the organization and assign permissions by role.
- **Brand voice**: define your writing style so the AI writes in your brand's tone.
- **Organization API token**: create a key so other systems can call your API (for developers).
- **Switch/create a new organization**: manage multiple workspaces.

---

## 18. Frequently asked questions (FAQ)

**Do I have to have an AI API key?**
Yes. The writing and scoring features use AI, so you need at least one valid API key under Connections.

**Why can't I publish an article yet?**
Check: have you added a website connection, are the connection details still correct (click Test connection), and does your account have **publish** permission?

**If I edit a published article and publish it again, will it create a duplicate?**
No. The software updates the correct original article if you publish through the same connection.

**Where do I fix a low SEO/GEO score?**
Go to **Optimize**: each criterion that does not pass comes with a specific suggestion for you to fix and then re-score.

**How is AI cost calculated?**
By the input/output tokens of the provider you use. See details under **Reports**.

**I want multiple people to work together?**
Invite them into the **Organization** and assign permissions. Use the assign-then-review workflow in **My Tasks**.

**Where do I change the interface language?**
In the account menu / language selector. Article content is translated separately under **Translations**.

---

## 19. Social & E-commerce Report (Facebook, Instagram, Threads, TikTok, YouTube, FB Groups, Shopee, TikTok Shop, Lazada)

Analyze social channels (yours or a competitor's) with real data + AI, in 2 phases:

1. Go to **Connections** → add the **Data collection** key for Social Report (follow the instructions there). Each collection run costs credits based on results (usually a few cents). You can add **multiple Apify keys** - each key is tested before saving, and every collection run randomly picks one key (a failed or exhausted key auto-switches to another).
2. Open **Social Report** → **Create report** → a popup lets you **pick the channel**: Facebook page, TikTok, YouTube, or **Overall** (multi-platform). Overall has 2 modes: enter a **keyword/topic** (the system auto-finds top content per platform) or enter **channel links** directly.
3. **Phase 1 - Collect raw data**: runs step by step with progress (channel info → posts/videos → Reels/ads for Facebook → comments), then stops at **Data collected** - view raw data + per-channel metrics immediately.
4. **Phase 2 - AI analysis**: click **Analyze** → pick AI and model (or "Auto") → the AI analyzes brand, tactics and summary; the Overall report adds **Channel comparison** and allocation advice. **Re-analyze** with another AI at no extra collection cost.
5. The report list can be filtered by channel; view in the system, **Export PDF**, **Download .doc**, or **Save to Google Drive** (logo + source from System info).

6. **Brand style**: on the report page, click **Brand style** → the AI extracts a style profile from the posts/videos (tone of voice, addressing, vocabulary, sentence patterns, argumentation, formulas, signature traits, signature phrases, do/avoid) → review by section and **copy/download Markdown** or **copy a reusable Prompt** so another AI can write in this brand voice.

7. **Facebook Group report**: pick **Facebook Group** in the create popup and paste a **public** group link (facebook.com/groups/...). The system collects **posts with each post's comments** (comments stay attached to their post so they're analyzed together), group info (member count, description) and metrics (frequency, post types, top contributors). The AI analyzes from a community angle: **hot topics**, **member insights** (needs, pain points, questions, language) and **content/seeding opportunities** with post ideas. Choose the post scope: **Top** (highest engagement, last 6 months) or **Newest**. Private groups cannot be analyzed.

7b. **Personal Facebook report**: pick **Personal Facebook** and paste a **public** profile link (facebook.com/username). The system analyzes the profile's public posts: **engagement**, **content & topics**, **tone/style** (via the **Brand Style** button) and the **follower/interactor base** - profile, needs, pain points, questions, language - **inferred from public commenters**. Important: only profiles that post **publicly** can be analyzed (private/locked profiles return no data); the **friends list** and follower demographics are **not** available (Facebook blocks them) - the "customer base" here means public interactors, not friends.

8. **Instagram / Threads / Shopee product**: pick the channel in the create popup. Instagram takes a profile link or @username (posts + Reels with **transcripts** + comments); Threads takes @username (posts + replies, repost/quote metrics); Shopee takes a **product link** (...-i.SHOPID.ITEMID) - the system collects product info + customer reviews (with per-aspect stars, variant purchased, seller replies), then AI analyzes the **listing**, **buyer insights** (praises/complaints, needs, language) and **improvement suggestions + sales content + FAQ**. Instagram and Threads can also join the Overall report.

9. **Shopee Shop**: pick **Shopee Shop**, paste the shop link (e.g. shopee.vn/shopname) or username. The system collects **shop info** (stars, followers, total products, response rate) + **product catalog** (price, discount, rating) + **reviews of top products** (each review tied to its product), then AI analyzes **catalog & pricing strategy**, **cross-product customer insights** and **summary & suggestions** (opportunities, improvements, sales content). Optional custom report name like the product report.

10. **TikTok Shop**: the **TikTok Shop** card (and the **Shopee** card) combines both types - clicking asks whether to report on a **product** or a **whole shop**. Product: paste the product link (or a vt.tiktok.com share link / product ID) → collects price, discount, **sold count**, stock, variants + customer reviews → AI analyzes the listing, buyer insights and suggests **sales videos**. Shop: enter the **shop name** exactly as on TikTok Shop (TikTok has no public shop URL) → the system finds the shop's top products + total sold/estimated revenue + reviews of top products (tied to each product) → AI analyzes catalog & pricing, customer insights and summary. Pick the right **region** (default VN).

11. **Lazada**: the **Lazada** card combines both types like Shopee/TikTok Shop. Product: paste the FULL product link with the name in the path (or an s.lazada.vn share link) → collects price, discount, **sold count**, seller + customer reviews in one run → AI analyzes the listing, buyer insights and summary. Shop: paste the shop link (lazada.vn/shop/shopname) → collects the catalog + reviews tied to each product → AI analyzes catalog & pricing, customers and summary.

12. **E-commerce overview** (market research): the **Overview** card now asks for **Social** (existing flow) or **E-commerce**. For E-commerce: enter a **product/niche keyword** + region → the system collects top **best-selling** products on Shopee, TikTok Shop and Lazada → AI analyzes the **market picture** (demand, pricing per marketplace), **top cross-marketplace competitors** and a **summary + market-entry plan** (priority marketplace, suggested pricing, differentiation). Use it for market/competitor research before selling.

13. **Visual charts**: every report opens with a **Charts** section - social channels: performance over posting time, top posts, formats, weekday (FB groups add top contributors); products: rating distribution, top variants; shops: best sellers, price distribution, ratings (TikTok Shop adds a **7 vs 30-day sales pace** chart, green/red by up/down); overviews: channel/marketplace comparison charts. Charts are preserved in PDF/.doc/Drive exports.

14. **Coming soon**: the **Zalo** and **Messenger** channels are in development - they appear in the channel picker with a "Coming soon" tag and can't be selected yet. They'll be enabled when ready.

Plan limits: the number of Social Reports per month and the available channels depend on the account owner's plan; the Free plan can only analyze Facebook pages. See the **Billing** page for your current limits. On the Free plan, page reports show only the first part (up to the target audience) and cannot be exported to PDF/DOC/Drive - upgrade to unlock the full analysis and exports.

Tip: posts are referenced "Post 1..N" per channel (with the platform name when multiple channels); if a run fails midway, click **Retry** to continue from the failed step.

---

## 20. Video script analysis

The **Script analysis** section (left menu) breaks down a viral video/reel so you can learn its formula and apply it to your own content.

1. Paste a **video link** (TikTok, YouTube, or Facebook), pick an **AI** and **model** (or leave "Auto"), then click **Analyze**.
2. The system detects the platform → pulls the transcript → the AI dissects it: **summary**, **content type**, **audience**, **opening hook** (and why it works), **formula/structure**, **second-by-second timeline**, **tone**, **pacing**, **strengths**, **improvements**, and **takeaways to apply**.
3. Results appear right on the page with the **video embedded** next to the timeline so you can read and watch at once. Each part is a click-to-open block.
4. Every analysis is saved under **History** below; click **Open** to reopen or **Delete**.
5. If one **fails**, you can **re-select AI + model** and analyze again (it reuses the transcript already fetched — no re-download).

> Requires a **data-collection** key (Apify), like the Social Report, to fetch the transcript. Access depends on your plan.

To share an analysis externally, see **Public sharing** (section 21).

---

## 21. Public sharing (share link, password, cover image)

Both **Social Reports** and **Script analyses** can generate a **public share link** — viewers just open the link to see the content as a read-only web page, **no sign-in needed**. (Public content still follows the owner's plan.)

**Create a link:** open a finished report/analysis → the **Public sharing** area → click **Create share link**. The system prepares:
- A **blog-style short link** (e.g. `.../bao-cao-...` or `.../kich-ban-...`) to post on social media — this is the link to copy and share.
- Once a link exists, this area **collapses automatically**; click **Expand** to edit.

**Cover image (Open Graph):** so that pasting the link on Facebook/Zalo shows a nice preview with image + title + description.
- **Generate with AI**: enter an image description (optional), pick the image AI/model, click **Generate AI cover**.
- Or **Upload image** from your device — the system compresses and reformats it to be light and social-friendly.
- Leave empty = use the default image (channel avatar/logo).

**Password lock:** to restrict viewers → set a **password**. Anyone opening the link must enter the correct password to see the content (the cover image/title still show when shared). You can **change the password** or **Remove lock** (make it public again) anytime.

**Manage links:** the **Social Report** (and **Script analysis**) has a **Share links** tab listing every link created: **Copy**, **Open**, **Edit** title/description/image, set/remove **password**, **Revoke** (temporarily disable), or **Delete**. Once revoked/deleted, the old link no longer works.

---

## 22. Image library

The **Image library** section (left menu) collects every image created by AI or uploaded across the system.

- **View** all images in a grid.
- **Rename** or **Delete** an image.
- **Select multiple** images to delete in bulk — when deleting many, you must type **DELETE** to confirm (to prevent accidents).

---

## 23. Need more help?

- Review the relevant section in this guide (use the search box at the top of the page).
- For new accounts, you can reopen the **quick introduction** using the "Review the guide" button on the Dashboard page.
- If you are still stuck, contact your system administrator.
