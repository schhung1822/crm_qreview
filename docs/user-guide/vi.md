# Hướng dẫn sử dụng

Tài liệu này hướng dẫn bạn dùng phần mềm từ A đến Z: từ lúc mới tạo tài khoản, viết bài chuẩn SEO/GEO, cho tới khi đăng bài lên website. Bạn chưa cần biết gì về kỹ thuật cũng làm theo được.

> Mẹo: dùng ô "Tìm trong hướng dẫn" ở đầu trang để nhảy nhanh tới phần bạn cần.

> Trong lúc dùng web, chỗ nào có biểu tượng (i) bạn bấm vào để đọc giải thích chi tiết của ô đó.

---

## 1. Bắt đầu nhanh (3 bước)

Chỉ cần 3 bước là bạn có bài viết đầu tiên:

1. **Nhập khóa API của AI** - phần mềm dùng AI (Claude, OpenAI, Gemini, DeepSeek) để viết và chấm điểm. Bạn cần dán khóa API của một nhà cung cấp vào mục **Kết nối** (xem phần 3).
2. **Kết nối website** (không bắt buộc ngay) - nếu muốn đăng bài thẳng lên WordPress, Wix, Shopify, Haravan, Sapo hay Google Sheet, hãy thêm kết nối trong mục **Kết nối**.
3. **Viết bài đầu tiên** - vào **Trình soạn thảo**, nhập chủ đề, để AI tạo bản nháp, rồi chỉnh và chấm điểm.

Ở trang **Tổng quan** có sẵn một danh sách kiểm tra (checklist) nhắc bạn hoàn tất bước 1 và 2. Khi làm xong, checklist tự ẩn.

---

## 2. Những khái niệm cơ bản

- **Tổ chức (Biz)**: không gian làm việc của bạn. Mọi bài viết, kết nối, nhân viên đều thuộc một tổ chức. Bạn có thể tạo nhiều tổ chức và chuyển qua lại bằng ô chọn tên tổ chức ở đầu thanh menu bên trái.
- **Bài viết (Article)**: một nội dung bạn soạn. Bài có trạng thái **Nháp** (draft) hoặc **Đã đăng** (published).
- **Điểm SEO / AEO / GEO**: ba thước đo chất lượng bài:
  - **SEO**: mức tối ưu cho công cụ tìm kiếm (Google) - tiêu đề, mô tả, thẻ heading, từ khóa, liên kết.
  - **AEO**: mức tối ưu để lọt vào hộp trả lời (Answer Engine) như Google AI Overviews.
  - **GEO**: mức tối ưu để các AI (ChatGPT, Perplexity, Gemini) trích dẫn bài của bạn.
- **Token**: đơn vị đo lượng chữ AI xử lý. "Token vào" là dữ liệu bạn gửi cho AI, "Token ra" là nội dung AI tạo. Chi phí AI tính theo token; xem chi tiết ở **Báo cáo**.
- **Kết nối (Connection)**: liên kết tới một website/kênh để đăng bài (WordPress, Wix, Shopify, Haravan, Sapo, Google Sheet).

---

## 3. Kết nối: khóa API AI và website

Đây là nơi khai báo mọi thứ để phần mềm hoạt động. Mở mục **Kết nối** ở thanh menu bên trái (nhóm **Hệ thống**).

### 3.1. Thêm khóa API của AI

Phần mềm không kèm sẵn AI - bạn dùng khóa API của chính mình nên chủ động chi phí và hạn mức.

1. Vào **Kết nối** → khu **Khóa API AI**.
2. Chọn nhà cung cấp: **Claude (Anthropic)**, **OpenAI**, **Gemini (Google)** hoặc **DeepSeek**.
3. Dán khóa API (lấy từ trang quản trị của nhà cung cấp đó) và **Lưu**.
4. Bật công tắc để kích hoạt. Bạn có thể thêm nhiều nhà cung cấp và chọn cái dùng chính.

> Mẹo: nếu chưa có khóa, hãy đăng ký tài khoản ở nhà cung cấp AI, tạo API key rồi quay lại dán. Khóa được lưu an toàn và không hiển thị lại đầy đủ sau khi lưu.

### 3.2. Kết nối website để đăng bài

1. Vào **Kết nối** → khu **Kết nối website** → **Thêm kết nối**.
2. Chọn nền tảng: **WordPress, Wix, Shopify, Haravan, Sapo**.
3. Làm theo hướng dẫn hiện ngay trong cửa sổ cho từng nền tảng (nhập địa chỉ site, tài khoản/mật khẩu ứng dụng hoặc token).
4. Bấm **Kiểm tra kết nối** để chắc chắn thông tin đúng, rồi **Lưu**.

Sau khi kết nối, bạn có thể đăng hoặc cập nhật bài thẳng từ phần mềm (xem phần 11).

---

## 4. Nghiên cứu từ khóa

Mục **Từ khóa** giúp bạn tìm và nhóm từ khóa trước khi viết, để bài đúng nhu cầu người tìm.

1. Vào **Từ khóa**, nhập một từ khóa gốc (ví dụ: "giày chạy bộ").
2. Phần mềm gợi ý bộ từ khóa liên quan kèm ý định tìm kiếm và các câu hỏi thường gặp (dạng GEO).
3. Chọn các từ khóa phù hợp và lưu lại thành bộ từ khóa để dùng cho bước lập kế hoạch.

> Mẹo: chú ý cột ý định (intent). Từ khóa "mua/giá" hợp bài bán hàng; từ khóa "cách/là gì" hợp bài hướng dẫn.

---

## 5. Lập kế hoạch nội dung

Mục **Kế hoạch** biến bộ từ khóa thành danh sách bài cần viết, có tiêu đề và dàn ý gợi ý.

1. Vào **Kế hoạch**, chọn bộ từ khóa hoặc nhập chủ đề.
2. Phần mềm đề xuất các đầu bài (title) và outline.
3. Duyệt, chỉnh sửa, rồi chuyển từng mục sang **Trình soạn thảo** để viết.

Cách này giúp bạn xây cụm nội dung (topic cluster) có hệ thống thay vì viết rời rạc.

---

## 6. Trình soạn thảo (viết bài)

Mục **Trình soạn thảo** là nơi bạn viết và hoàn thiện bài.

1. Nhập **tiêu đề** và **từ khóa mục tiêu**.
2. Bấm để AI tạo **bản nháp** theo chủ đề. Bạn cũng có thể tự viết hoặc dán nội dung có sẵn.
3. Dùng các công cụ hỗ trợ:
   - **Viết lại / mở rộng / rút gọn** đoạn văn.
   - **Nhân văn hóa (humanize)**: làm câu chữ tự nhiên, bớt giọng máy.
   - **Kiểm tra sự thật (fact-check)**: soát các thông tin dễ sai.
   - **Chèn ảnh minh họa**: sinh ảnh hoặc gợi ý ảnh (xem phần 10).
4. Xem điểm **SEO / AEO / GEO** cập nhật ngay, và làm theo gợi ý để nâng điểm.
5. Bấm **Lưu** - bài vào danh sách **Bài viết** ở trạng thái Nháp.

> Mẹo: viết tiêu đề chứa từ khóa chính, chia bài bằng các heading rõ ràng, và trả lời thẳng câu hỏi ngay đoạn đầu - cả ba đều tốt cho SEO lẫn GEO.

---

## 7. Quản lý bài viết

Mục **Bài viết** liệt kê mọi bài trong tổ chức.

- Lọc theo **trạng thái** (Nháp / Đã đăng) và **ngôn ngữ**.
- Mở một bài để **sửa tiếp**, **chấm điểm lại**, **dịch**, **tối ưu**, hoặc **đăng**.
- Cột điểm giúp bạn thấy nhanh bài nào cần cải thiện.

> Lưu ý: khi bạn sửa một bài đã đăng rồi đăng lại, phần mềm **cập nhật đúng bài cũ trên website** (không tạo bài trùng), miễn là bạn đăng qua cùng một kết nối.

---

## 8. Tối ưu SEO và GEO

Mục **Tối ưu** chấm điểm chi tiết và chỉ ra chính xác chỗ cần sửa.

1. Chọn bài cần tối ưu.
2. Xem bảng điểm theo từng tiêu chí: tiêu đề, mô tả (meta), cấu trúc heading, mật độ từ khóa, liên kết nội bộ, dữ liệu có cấu trúc (schema), khả năng được AI trích dẫn...
3. Mỗi mục "chưa đạt" có gợi ý cụ thể. Áp dụng gợi ý rồi chấm lại cho tới khi điểm cao.

**Về liên kết nội bộ**: chỉ nên liên kết tới các bài **đã đăng thật** (có đường dẫn thật). Đừng đặt link tới trang chưa tồn tại.

**Về liên kết ra ngoài**: mọi đường dẫn ra website khác nên mở ở tab mới để người đọc không rời trang của bạn.

---

## 9. Dịch và đa ngôn ngữ

Mục **Dịch** giúp tạo phiên bản ngôn ngữ khác của một bài.

1. Chọn bài gốc và (các) ngôn ngữ đích.
2. Phần mềm không dịch máy móc mà **bản địa hóa**: thích nghi ví dụ, đơn vị, văn phong, rồi tối ưu lại SEO/GEO theo từ khóa bản địa.
3. Kiểm tra lại bản dịch, chỉnh nếu cần, rồi lưu như một bài riêng.

Giao diện phần mềm hỗ trợ nhiều ngôn ngữ; đổi ngôn ngữ hiển thị ở menu tài khoản.

---

## 10. Ảnh: cài đặt và nén

### 10.1. Cài đặt ảnh (Ảnh minh họa)

Mục **Cài đặt ảnh** quy định cách sinh và chèn ảnh cho bài: phong cách, tỉ lệ, chữ thay thế (alt) cho SEO.

### 10.2. Nén ảnh

Mục **Nén ảnh** giúp giảm dung lượng ảnh và đổi định dạng sang **WebP/AVIF** (thân thiện SEO, tải nhanh hơn).

1. Tải ảnh lên.
2. Chọn định dạng và mức nén.
3. Tải ảnh đã tối ưu về. Phần mềm xử lý trực tiếp, không lưu lại ảnh của bạn.

---

## 11. Xuất bản bài viết

### 11.1. Đăng lên CMS (WordPress, Wix, Shopify, Haravan, Sapo)

1. Vào **Xuất bản** (hoặc mở bài rồi chọn đăng).
2. Chọn **kết nối** website đích.
3. Kiểm tra tiêu đề, đường dẫn (slug), mô tả, ảnh bìa.
4. Bấm **Đăng**. Nếu là bài đã đăng trước đó, phần mềm sẽ **cập nhật** đúng bài cũ.

### 11.2. Đăng vào Google Sheet

Ngoài CMS, bạn có thể đẩy bài vào một **Google Sheet** (ví dụ để đội khác xử lý tiếp). Kết nối Google một lần, chọn bảng tính đích, phần mềm ghi từng bài theo dòng và cập nhật theo slug.

### 11.3. Lịch đăng bài

Mục **Lịch** cho phép xếp lịch đăng: chọn ngày giờ cho từng bài để nội dung ra đều đặn thay vì đăng dồn.

---

## 12. Kiểm tra và audit

- **Audit**: quét một trang/bài để chấm sức khỏe SEO và chỉ lỗi cần sửa.
- **Kiểm tra landing (Landing Audit)**: soi riêng trang bán hàng/đích, đánh giá tiêu đề, lời kêu gọi hành động, cấu trúc thuyết phục.

Dùng các mục này để rà lại nội dung đã có (kể cả bài không do phần mềm tạo).

---

## 13. Báo cáo và trích dẫn

- **Báo cáo**: xem lượng token đã dùng, chi phí AI (quy đổi theo tiền tệ của bạn), thống kê theo nhà cung cấp/mô hình và theo nhân viên. Dùng để kiểm soát chi phí.
- **Trích dẫn (Citations)**: gợi ý nguồn uy tín để dẫn trong bài, giúp tăng độ tin cậy và khả năng được AI trích dẫn (GEO).

---

## 14. Công việc và cộng tác

Nếu tổ chức có nhiều người, dùng mục **Việc của tôi** để làm việc nhóm:

- **Giao bài**: chủ/quản lý giao bài cho nhân viên viết.
- **Duyệt bài**: bài phải được người có quyền **duyệt** trước khi đăng. Bài chờ bạn duyệt hiện trong **Việc của tôi**.
- **Bình luận**: trao đổi ngay trên từng bài.

Việc phân quyền (ai được viết, đăng, duyệt, quản lý kết nối...) đặt ở trang **Tổ chức** (xem phần 17).

---

## 15. Bảng tin và thông báo

- **Chuông thông báo** (góc trên): các cập nhật, thông báo dành cho bạn.
- **Bảng tin**: tin tức và mẹo dùng phần mềm. Tin **mới** có nhãn "Mới"; khi bạn mở đọc một tin, nhãn của tin đó biến mất. Có nút **Đánh dấu tất cả đã đọc** để xóa nhanh.

---

## 16. Gói cước và hạn mức

Mục **Gói cước** cho biết bạn đang ở gói nào, còn bao nhiêu lượt viết bài trong kỳ, và ngày gia hạn.

- Xem hạn mức còn lại và lịch sử.
- Nâng cấp gói khi cần thêm hạn mức hoặc tính năng.
- Nếu tài khoản được cấp thêm lượt (overage) hoặc không giới hạn, thông tin cũng hiển thị tại đây.

---

## 17. Tài khoản, bảo mật và tổ chức

### 17.1. Tài khoản

Mục **Tài khoản** (bấm tên bạn ở đáy menu) cho phép đổi tên hiển thị và **đổi mật khẩu**. Nếu quên mật khẩu, dùng liên kết "Quên mật khẩu" ở trang đăng nhập để đặt lại qua email.

### 17.2. Tổ chức (Biz)

Bấm tên tổ chức ở đầu menu → **quản lý tổ chức**:

- **Nhân viên**: mời người vào tổ chức và phân quyền theo vai trò.
- **Giọng thương hiệu (Brand voice)**: khai báo văn phong để AI viết đúng chất thương hiệu.
- **Token API của tổ chức**: tạo khóa để hệ thống khác gọi API của bạn (dành cho lập trình viên).
- **Chuyển/tạo tổ chức mới**: quản lý nhiều không gian làm việc.

---

## 18. Câu hỏi thường gặp (FAQ)

**Tôi bắt buộc phải có khóa API AI không?**
Có. Các tính năng viết và chấm điểm dùng AI, nên cần ít nhất một khóa API còn hiệu lực trong mục Kết nối.

**Vì sao chưa đăng được bài?**
Kiểm tra: đã thêm kết nối website chưa, thông tin kết nối còn đúng không (bấm Kiểm tra kết nối), và tài khoản có quyền **đăng** không.

**Sửa bài đã đăng rồi đăng lại có tạo bài trùng không?**
Không. Phần mềm cập nhật đúng bài cũ nếu bạn đăng qua cùng kết nối.

**Điểm SEO/GEO thấp thì sửa ở đâu?**
Vào mục **Tối ưu**: mỗi tiêu chí chưa đạt đều có gợi ý cụ thể để bạn sửa rồi chấm lại.

**Chi phí AI tính thế nào?**
Theo token vào/ra của nhà cung cấp bạn dùng. Xem chi tiết ở **Báo cáo**.

**Tôi muốn nhiều người cùng làm?**
Mời họ vào **Tổ chức** và phân quyền. Dùng luồng giao bài - duyệt bài trong **Việc của tôi**.

**Đổi ngôn ngữ giao diện ở đâu?**
Ở menu tài khoản/chọn ngôn ngữ. Nội dung bài viết dịch riêng ở mục **Dịch**.

---

## 19. Báo cáo Social & E-commerce (Facebook, Instagram, Threads, TikTok, YouTube, Nhóm FB, Shopee, TikTok Shop, Lazada)

Phân tích kênh social (của bạn hoặc đối thủ) bằng dữ liệu thật + AI, theo 2 pha:

1. Vào **Quản lý kết nối** → thêm khóa **Thu thập dữ liệu** cho Báo cáo Social (làm theo hướng dẫn tại đó). Mỗi lần thu thập tốn phí theo số kết quả (thường vài cent). Bạn có thể thêm **nhiều khóa Apify** - hệ thống kiểm tra khóa trước khi lưu, và mỗi lần thu thập tự chọn ngẫu nhiên một khóa (khóa lỗi hoặc hết hạn mức sẽ tự chuyển sang khóa khác).
2. Mở **Báo cáo Social** → **Tạo báo cáo** → popup hiện ra để **chọn kênh**: Fanpage Facebook, TikTok, YouTube hoặc **Tổng thể** (nhiều nền tảng). Với Tổng thể có 2 cách: nhập **từ khóa/chủ đề** (hệ thống tự tìm nội dung nổi bật trên từng nền tảng) hoặc nhập **link các kênh** trực tiếp.
3. **Pha 1 - Thu thập dữ liệu thô**: chạy từng bước có tiến trình (thông tin kênh → bài đăng/video → Reels/quảng cáo với Facebook → bình luận) rồi dừng ở **Đã thu thập** - xem ngay dữ liệu thô + chỉ số của từng kênh.
4. **Pha 2 - Phân tích AI**: bấm **Phân tích** → chọn AI và model (hoặc "Tự động") → AI phân tích thương hiệu, chiến thuật, tổng kết; báo cáo Tổng thể có thêm **So sánh giữa các kênh** và đề xuất phân bổ. **Phân tích lại** bằng AI khác không tốn thêm phí thu thập.
5. Danh sách báo cáo lọc được theo kênh; xem trên hệ thống, **Xuất PDF**, **Tải .doc** hoặc **Lưu vào Google Drive** (logo + nguồn theo Thông tin hệ thống).

6. **Style thương hiệu**: trong trang xem báo cáo, bấm **Style thương hiệu** → AI rút hồ sơ phong cách từ bài viết/video (tông giọng, xưng hô, từ ngữ, cấu trúc câu, lập luận, công thức, đặc điểm riêng, câu đặc trưng, nên/tránh) → xem theo mục và **sao chép/tải Markdown** hoặc **sao chép Prompt** để tái sử dụng cho AI khác viết đúng giọng thương hiệu.

7. **Báo cáo Nhóm Facebook**: chọn kênh **Nhóm Facebook** trong popup tạo báo cáo, dán link nhóm **công khai** (facebook.com/groups/...). Hệ thống thu **bài viết kèm bình luận của từng bài** (bình luận đi theo bài để phân tích cùng nhau), thông tin nhóm (số thành viên, mô tả) và chỉ số (tần suất, kiểu bài, thành viên đăng bài nổi bật). AI phân tích theo góc nhìn cộng đồng: **chủ đề nóng**, **insight thành viên** (nhu cầu, nỗi đau, câu hỏi, ngôn ngữ) và **cơ hội content/seeding** kèm ý tưởng bài đăng. Chọn phạm vi bài viết: **Nổi bật** (tương tác cao 6 tháng gần nhất) hoặc **Mới nhất**. Nhóm riêng tư không phân tích được.

7b. **Báo cáo Facebook cá nhân**: chọn kênh **Facebook cá nhân**, dán link nick **công khai** (facebook.com/tennick). Hệ thống phân tích bài công khai của nick: **tương tác**, **chủ đề & nội dung**, **giọng điệu/style** (qua nút **Style thương hiệu**) và **tệp người theo dõi/tương tác** - chân dung, nhu cầu, nỗi đau, câu hỏi, ngôn ngữ - **suy từ người bình luận công khai**. Lưu ý quan trọng: chỉ nick đăng bài **CÔNG KHAI** mới phân tích được (nick riêng tư/khóa không lấy được dữ liệu); **không** lấy được danh sách bạn bè hay nhân khẩu học người theo dõi (Facebook chặn) - "tệp khách hàng" ở đây là người tương tác công khai, không phải bạn bè.

8. **Instagram / Threads / Sản phẩm Shopee**: chọn kênh tương ứng trong popup tạo báo cáo. Instagram nhập link profile hoặc @username (thu bài đăng + Reels kèm **lời thoại** + bình luận); Threads nhập @username (bài đăng + trả lời, chỉ số repost/quote); Shopee dán **link sản phẩm** (dạng ...-i.SHOPID.ITEMID) - hệ thống thu thông tin sản phẩm + đánh giá của khách (kèm sao theo khía cạnh, phân loại đã mua, phản hồi shop) rồi AI phân tích **listing**, **insight người mua** (khen/chê, nhu cầu, ngôn ngữ) và **đề xuất cải thiện + content bán hàng + FAQ**. Instagram và Threads cũng tham gia được báo cáo Tổng thể.

9. **Shop Shopee**: chọn kênh **Shop Shopee**, dán link shop (vd shopee.vn/tenshop) hoặc username. Hệ thống thu **thông tin shop** (sao, follower, tổng sản phẩm, tỷ lệ phản hồi) + **danh mục sản phẩm** (giá, giảm giá, sao) + **đánh giá của top sản phẩm** (đánh giá gắn với từng sản phẩm), rồi AI phân tích **danh mục & chiến lược giá**, **insight khách hàng xuyên sản phẩm** và **tổng kết & đề xuất** (cơ hội, cải thiện, content bán hàng). Đặt tên báo cáo tuỳ chọn như báo cáo sản phẩm.

10. **TikTok Shop**: card **TikTok Shop** (và card **Shopee**) gộp cả 2 loại - bấm vào sẽ hỏi tạo báo cáo cho **sản phẩm** hay **cả shop**. Sản phẩm: dán link sản phẩm (hoặc link chia sẻ vt.tiktok.com / ID sản phẩm) → thu giá, % giảm, **đã bán**, tồn kho, biến thể + đánh giá của khách → AI phân tích listing, insight người mua và đề xuất **video bán hàng**. Shop: nhập **tên shop** đúng như trên TikTok Shop (TikTok không có link shop công khai) → hệ thống tìm sản phẩm nổi bật của shop + tổng đã bán/doanh số ước tính + đánh giá top sản phẩm (gắn theo từng sản phẩm) → AI phân tích danh mục & giá, insight khách hàng và tổng kết. Nhớ chọn đúng **khu vực** (mặc định VN).

11. **Lazada**: card **Lazada** gộp 2 loại như Shopee/TikTok Shop. Sản phẩm: dán link sản phẩm ĐẦY ĐỦ có tên trong đường dẫn (hoặc link chia sẻ s.lazada.vn) → thu giá, % giảm, **đã bán**, seller + đánh giá của khách trong 1 lần chạy → AI phân tích listing, insight người mua, tổng kết. Shop: dán link shop (lazada.vn/shop/tenshop) → thu danh mục + đánh giá gắn theo từng sản phẩm → AI phân tích danh mục & giá, khách hàng, tổng kết.

12. **Tổng thể E-commerce** (nghiên cứu thị trường): card **Tổng thể** giờ hỏi chọn **Social** (luồng cũ) hay **E-commerce**. Với E-commerce: nhập **từ khóa sản phẩm/ngách** + khu vực → hệ thống lấy top sản phẩm **bán chạy** trên cả Shopee, TikTok Shop và Lazada → AI phân tích **bức tranh thị trường** (nhu cầu, mặt bằng giá từng sàn), **đối thủ nổi bật xuyên sàn** và **tổng kết + kế hoạch gia nhập** (sàn ưu tiên, giá đề xuất, cách khác biệt hóa). Dùng để nghiên cứu thị trường/đối thủ trước khi kinh doanh.

13. **Biểu đồ trực quan**: mọi báo cáo đều mở đầu bằng mục **Biểu đồ** - kênh social: hiệu quả theo thời gian đăng, top bài, định dạng, thứ trong tuần (nhóm FB thêm thành viên đăng nhiều nhất); sản phẩm: phân bổ số sao, phân loại được mua nhiều; shop: top bán chạy, phân bổ giá, phân bổ sao (TikTok Shop thêm **nhịp bán 7 vs 30 ngày** xanh/đỏ theo tăng/giảm); tổng thể: bộ biểu đồ so sánh kênh/sàn. Biểu đồ giữ nguyên khi xuất PDF/.doc/Drive.

14. **Sắp ra mắt**: các kênh **Zalo** và **Messenger** đang được phát triển - trong danh sách chọn kênh chúng hiện nhãn "Coming soon" và chưa bấm được. Hệ thống sẽ mở khi sẵn sàng.

Lưu ý gói cước: số lượt tạo Báo cáo Social mỗi tháng và phạm vi kênh phụ thuộc gói của chủ tài khoản; gói Free chỉ tạo được báo cáo fanpage Facebook. Xem trang **Gói cước** để biết hạn mức hiện tại. Với gói Free, báo cáo fanpage chỉ xem được phần đầu (đến chân dung khách hàng mục tiêu) và không xuất được file PDF/DOC/Drive - nâng cấp gói để mở khóa phân tích đầy đủ và xuất file.

Mẹo: bài được tham chiếu "Bài 1..N" theo từng kênh (kèm tên nền tảng khi nhiều kênh); lỗi giữa chừng bấm **Thử lại** chạy tiếp từ bước dở.

---

## 20. Phân tích kịch bản video

Mục **Phân tích kịch bản** (menu trái) bóc tách một video/reel đang viral để bạn học công thức rồi áp dụng cho nội dung của mình.

1. Dán **link video** (TikTok, YouTube hoặc Facebook), chọn **AI** và **model** (hoặc để "Tự động"), rồi bấm **Phân tích**.
2. Hệ thống tự nhận nền tảng → lấy lời thoại (transcript) → AI mổ xẻ: **tóm tắt**, **dạng nội dung**, **đối tượng**, **hook mở đầu** (và vì sao hiệu quả), **công thức/cấu trúc**, **timeline theo giây**, **tông giọng**, **nhịp độ**, **điểm mạnh**, **điểm cần cải thiện** và **bài học áp dụng**.
3. Kết quả hiện ngay trong trang, kèm **video nhúng** cạnh timeline để vừa đọc vừa xem. Mỗi mục là khối bấm-để-mở.
4. Mọi bản phân tích lưu ở **Lịch sử** ngay dưới; bấm **Xem** để mở lại hoặc **Xóa**.
5. Nếu một bản bị **lỗi**, bạn **chọn lại AI + model** rồi phân tích lại (tái dùng lời thoại đã lấy, không tải lại từ đầu).

> Cần khóa **Thu thập dữ liệu** (Apify) giống Báo cáo Social để lấy được lời thoại. Quyền dùng tính năng phụ thuộc gói cước.

Muốn chia sẻ bản phân tích ra ngoài: xem phần **Chia sẻ công khai** (phần 21).

---

## 21. Chia sẻ công khai (link chia sẻ, mật khẩu, ảnh bìa)

Cả **Báo cáo Social** lẫn **Phân tích kịch bản** đều tạo được **link chia sẻ công khai** — người xem mở link là thấy nội dung dạng trang web chỉ-xem, **không cần đăng nhập**. (Nội dung công khai vẫn tuân theo gói cước của chủ.)

**Tạo link:** mở một báo cáo/bản phân tích đã xong → khu **Chia sẻ công khai** → bấm **Tạo link chia sẻ**. Hệ thống tạo sẵn:
- **Link rút gọn dạng blog** (ví dụ `.../bao-cao-...` hoặc `.../kich-ban-...`) để đăng lên mạng xã hội — đây là link nên copy đi chia sẻ.
- Khi đã có link, khu này **tự thu gọn**; bấm **Mở rộng** để chỉnh.

**Ảnh bìa khi chia sẻ (Open Graph):** để khi dán link lên Facebook/Zalo hiện đẹp có ảnh + tiêu đề + mô tả.
- **Tạo bằng AI**: nhập mô tả ảnh (tuỳ chọn), chọn AI/model tạo ảnh, bấm **Tạo ảnh bìa AI**.
- Hoặc **Tải ảnh lên** từ máy — hệ thống tự nén và đổi định dạng cho nhẹ, hợp mạng xã hội.
- Bỏ trống = dùng ảnh mặc định (avatar kênh/logo).

**Khóa bằng mật khẩu:** muốn giới hạn người xem → đặt **mật khẩu**. Người mở link phải nhập đúng mật khẩu mới xem được nội dung (ảnh bìa/tiêu đề vẫn hiện để chia sẻ). Bạn có thể **đổi mật khẩu** hoặc **Bỏ khóa** (chuyển lại công khai) bất cứ lúc nào.

**Quản lý link:** trong **Báo cáo Social** (và **Phân tích kịch bản**) có tab **Link chia sẻ** liệt kê mọi link đã tạo: **Copy**, **Mở**, **Sửa** tiêu đề/mô tả/ảnh, đặt/gỡ **mật khẩu**, **Thu hồi** (tạm tắt) hoặc **Xóa**. Thu hồi/xóa xong, link cũ sẽ không xem được nữa.

---

## 22. Thư viện ảnh

Mục **Thư viện ảnh** (menu trái) gom mọi ảnh do AI tạo hoặc bạn tải lên trong hệ thống.

- **Xem** toàn bộ ảnh ở dạng lưới.
- **Đổi tên** hoặc **Xóa** một ảnh.
- **Chọn nhiều** ảnh để xóa hàng loạt — khi xóa nhiều, phải gõ chữ **DELETE** để xác nhận (tránh xóa nhầm).

---

## 23. Cần trợ giúp thêm?

- Xem lại phần liên quan trong hướng dẫn này (dùng ô tìm kiếm ở đầu trang).
- Với tài khoản mới, bạn có thể mở lại phần **giới thiệu nhanh** bằng nút "Xem lại hướng dẫn" trên trang Tổng quan.
- Nếu vẫn vướng, liên hệ người quản trị hệ thống của bạn.
