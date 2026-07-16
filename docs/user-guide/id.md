# Panduan Penggunaan

Dokumen ini memandu Anda menggunakan perangkat lunak dari A sampai Z: mulai dari saat baru membuat akun, menulis artikel yang optimal untuk SEO/GEO, hingga menerbitkan artikel ke situs web. Anda tidak perlu tahu apa pun tentang teknis untuk bisa mengikutinya.

> Tips: gunakan kotak "Cari di panduan" di bagian atas halaman untuk langsung melompat ke bagian yang Anda butuhkan.

> Saat menggunakan aplikasi, di mana pun ada ikon (i), klik untuk membaca penjelasan detail kolom tersebut.

---

## 1. Mulai cepat (3 langkah)

Cukup 3 langkah dan Anda sudah punya artikel pertama:

1. **Masukkan kunci API AI** - perangkat lunak menggunakan AI (Claude, OpenAI, Gemini, DeepSeek) untuk menulis dan memberi skor. Anda perlu menempelkan kunci API dari salah satu penyedia ke menu **Koneksi** (lihat bagian 3).
2. **Hubungkan situs web** (belum wajib sekarang) - jika ingin menerbitkan artikel langsung ke WordPress, Wix, Shopify, Haravan, Sapo, atau Google Sheet, tambahkan koneksi di menu **Koneksi**.
3. **Tulis artikel pertama** - buka **Editor**, masukkan topik, biarkan AI membuat draf, lalu edit dan beri skor.

Di halaman **Ringkasan** tersedia daftar periksa (checklist) yang mengingatkan Anda menyelesaikan langkah 1 dan 2. Setelah selesai, checklist akan tersembunyi otomatis.

---

## 2. Konsep-konsep dasar

- **Organisasi (Biz)**: ruang kerja Anda. Semua artikel, koneksi, dan staf berada di dalam satu organisasi. Anda bisa membuat banyak organisasi dan berpindah di antaranya melalui kotak pemilih nama organisasi di bagian atas menu sebelah kiri.
- **Artikel (Article)**: sebuah konten yang Anda susun. Artikel memiliki status **Draf** (draft) atau **Terbit** (published).
- **Skor SEO / AEO / GEO**: tiga ukuran kualitas artikel:
  - **SEO**: tingkat optimasi untuk mesin pencari (Google) - judul, deskripsi, tag heading, kata kunci, tautan.
  - **AEO**: tingkat optimasi agar masuk ke kotak jawaban (Answer Engine) seperti Google AI Overviews.
  - **GEO**: tingkat optimasi agar AI (ChatGPT, Perplexity, Gemini) mengutip artikel Anda.
- **Token**: satuan pengukur jumlah teks yang diproses AI. "Token masuk" adalah data yang Anda kirim ke AI, "Token keluar" adalah konten yang dibuat AI. Biaya AI dihitung berdasarkan token; lihat detailnya di **Laporan**.
- **Koneksi (Connection)**: tautan ke sebuah situs web/kanal untuk menerbitkan artikel (WordPress, Wix, Shopify, Haravan, Sapo, Google Sheet).

---

## 3. Koneksi: kunci API AI dan situs web

Di sinilah Anda mendeklarasikan semua hal agar perangkat lunak berfungsi. Buka menu **Koneksi** di menu sebelah kiri (grup **Sistem**).

### 3.1. Menambahkan kunci API AI

Perangkat lunak tidak menyertakan AI bawaan - Anda menggunakan kunci API milik Anda sendiri sehingga bisa mengendalikan biaya dan kuota.

1. Buka **Koneksi** → area **Kunci API AI**.
2. Pilih penyedia: **Claude (Anthropic)**, **OpenAI**, **Gemini (Google)**, atau **DeepSeek**.
3. Tempel kunci API (diambil dari halaman admin penyedia tersebut) lalu **Simpan**.
4. Aktifkan sakelar untuk mengaktifkannya. Anda bisa menambahkan banyak penyedia dan memilih yang digunakan sebagai utama.

> Tips: jika belum punya kunci, daftarkan akun di penyedia AI, buat API key, lalu kembali dan tempel. Kunci disimpan dengan aman dan tidak ditampilkan lengkap lagi setelah disimpan.

### 3.2. Menghubungkan situs web untuk menerbitkan artikel

1. Buka **Koneksi** → area **Koneksi situs web** → **Tambah koneksi**.
2. Pilih platform: **WordPress, Wix, Shopify, Haravan, Sapo**.
3. Ikuti petunjuk yang muncul langsung di jendela untuk setiap platform (masukkan alamat situs, akun/kata sandi aplikasi atau token).
4. Klik **Uji koneksi** untuk memastikan informasi sudah benar, lalu **Simpan**.

Setelah terhubung, Anda bisa menerbitkan atau memperbarui artikel langsung dari perangkat lunak (lihat bagian 11).

---

## 4. Riset kata kunci

Menu **Kata kunci** membantu Anda menemukan dan mengelompokkan kata kunci sebelum menulis, agar artikel sesuai kebutuhan pencari.

1. Buka **Kata kunci**, masukkan satu kata kunci utama (misalnya: "sepatu lari").
2. Perangkat lunak menyarankan sekumpulan kata kunci terkait beserta niat pencarian dan pertanyaan yang sering diajukan (bentuk GEO).
3. Pilih kata kunci yang sesuai dan simpan sebagai sekumpulan kata kunci untuk digunakan pada tahap perencanaan.

> Tips: perhatikan kolom niat (intent). Kata kunci "beli/harga" cocok untuk artikel jualan; kata kunci "cara/apa itu" cocok untuk artikel panduan.

---

## 5. Perencanaan konten

Menu **Rencana** mengubah sekumpulan kata kunci menjadi daftar artikel yang perlu ditulis, lengkap dengan judul dan kerangka yang disarankan.

1. Buka **Rencana**, pilih sekumpulan kata kunci atau masukkan topik.
2. Perangkat lunak mengusulkan judul-judul (title) dan kerangka (outline).
3. Tinjau, edit, lalu pindahkan setiap item ke **Editor** untuk ditulis.

Cara ini membantu Anda membangun klaster konten (topic cluster) secara sistematis alih-alih menulis secara terpisah-pisah.

---

## 6. Editor (menulis artikel)

Menu **Editor** adalah tempat Anda menulis dan menyempurnakan artikel.

1. Masukkan **judul** dan **kata kunci target**.
2. Klik untuk membuat **draf** dengan AI sesuai topik. Anda juga bisa menulis sendiri atau menempel konten yang sudah ada.
3. Gunakan alat bantu:
   - **Tulis ulang / perluas / ringkas** paragraf.
   - **Humanize (humanize)**: membuat kalimat lebih alami, mengurangi nada seperti mesin.
   - **Periksa fakta (fact-check)**: mengecek informasi yang mudah keliru.
   - **Sisipkan gambar ilustrasi**: menghasilkan gambar atau menyarankan gambar (lihat bagian 10).
4. Lihat skor **SEO / AEO / GEO** yang diperbarui langsung, dan ikuti sarannya untuk menaikkan skor.
5. Klik **Simpan** - artikel masuk ke daftar **Artikel** dengan status Draf.

> Tips: buat judul yang memuat kata kunci utama, bagi artikel dengan heading yang jelas, dan jawab langsung pertanyaan di paragraf pertama - ketiganya baik untuk SEO maupun GEO.

---

## 7. Mengelola artikel

Menu **Artikel** menampilkan semua artikel dalam organisasi.

- Saring berdasarkan **status** (Draf / Terbit) dan **bahasa**.
- Buka sebuah artikel untuk **lanjut edit**, **beri skor ulang**, **terjemahkan**, **optimalkan**, atau **terbitkan**.
- Kolom skor membantu Anda cepat melihat artikel mana yang perlu diperbaiki.

> Catatan: ketika Anda mengedit artikel yang sudah terbit lalu menerbitkannya lagi, perangkat lunak akan **memperbarui artikel lama yang benar di situs web** (tidak membuat artikel ganda), selama Anda menerbitkan melalui koneksi yang sama.

---

## 8. Optimasi SEO dan GEO

Menu **Optimalkan** memberi skor rinci dan menunjukkan dengan tepat bagian yang perlu diperbaiki.

1. Pilih artikel yang akan dioptimalkan.
2. Lihat tabel skor per kriteria: judul, deskripsi (meta), struktur heading, kepadatan kata kunci, tautan internal, data terstruktur (schema), kemungkinan dikutip oleh AI...
3. Setiap item "belum tercapai" memiliki saran spesifik. Terapkan saran lalu beri skor lagi hingga skornya tinggi.

**Tentang tautan internal**: sebaiknya hanya menautkan ke artikel yang **benar-benar sudah terbit** (memiliki tautan nyata). Jangan memasang tautan ke halaman yang belum ada.

**Tentang tautan keluar**: setiap tautan ke situs web lain sebaiknya dibuka di tab baru agar pembaca tidak meninggalkan halaman Anda.

---

## 9. Terjemahan dan multibahasa

Menu **Terjemahan** membantu membuat versi bahasa lain dari sebuah artikel.

1. Pilih artikel asli dan bahasa (atau bahasa-bahasa) target.
2. Perangkat lunak tidak menerjemahkan secara kaku melainkan **melokalkan**: menyesuaikan contoh, satuan, gaya bahasa, lalu mengoptimalkan ulang SEO/GEO sesuai kata kunci lokal.
3. Periksa kembali hasil terjemahan, edit bila perlu, lalu simpan sebagai artikel tersendiri.

Antarmuka perangkat lunak mendukung banyak bahasa; ubah bahasa tampilan di menu akun.

---

## 10. Gambar: pengaturan dan kompresi

### 10.1. Pengaturan Gambar (Gambar ilustrasi)

Menu **Pengaturan Gambar** menentukan cara menghasilkan dan menyisipkan gambar untuk artikel: gaya, rasio, teks alternatif (alt) untuk SEO.

### 10.2. Kompres Gambar

Menu **Kompres Gambar** membantu mengurangi ukuran gambar dan mengubah format menjadi **WebP/AVIF** (ramah SEO, memuat lebih cepat).

1. Unggah gambar.
2. Pilih format dan tingkat kompresi.
3. Unduh gambar yang sudah dioptimalkan. Perangkat lunak memprosesnya secara langsung, tanpa menyimpan gambar Anda.

---

## 11. Menerbitkan artikel

### 11.1. Menerbitkan ke CMS (WordPress, Wix, Shopify, Haravan, Sapo)

1. Buka **Terbitkan** (atau buka artikel lalu pilih terbitkan).
2. Pilih **koneksi** situs web tujuan.
3. Periksa judul, tautan (slug), deskripsi, dan gambar sampul.
4. Klik **Terbitkan**. Jika artikel sudah pernah diterbitkan sebelumnya, perangkat lunak akan **memperbarui** artikel lama yang benar.

### 11.2. Menerbitkan ke Google Sheet

Selain CMS, Anda bisa mendorong artikel ke sebuah **Google Sheet** (misalnya agar tim lain memprosesnya lebih lanjut). Hubungkan Google sekali, pilih spreadsheet tujuan, perangkat lunak menulis setiap artikel per baris dan memperbaruinya berdasarkan slug.

### 11.3. Jadwal penerbitan

Menu **Kalender** memungkinkan Anda menjadwalkan penerbitan: pilih tanggal dan waktu untuk setiap artikel agar konten terbit secara teratur alih-alih diterbitkan sekaligus.

---

## 12. Pemeriksaan dan audit

- **Audit**: memindai sebuah halaman/artikel untuk menilai kesehatan SEO dan menunjukkan kesalahan yang perlu diperbaiki.
- **Periksa landing (Landing Audit)**: meninjau khusus halaman jualan/tujuan, menilai judul, ajakan bertindak, dan struktur persuasif.

Gunakan menu-menu ini untuk meninjau ulang konten yang sudah ada (termasuk artikel yang bukan dibuat oleh perangkat lunak).

---

## 13. Laporan dan kutipan

- **Laporan**: melihat jumlah token yang telah digunakan, biaya AI (dikonversi ke mata uang Anda), statistik per penyedia/model dan per staf. Digunakan untuk mengontrol biaya.
- **Kutipan (Citations)**: menyarankan sumber tepercaya untuk dikutip dalam artikel, guna meningkatkan kredibilitas dan kemungkinan dikutip oleh AI (GEO).

---

## 14. Pekerjaan dan kolaborasi

Jika organisasi memiliki banyak orang, gunakan menu **Tugas Saya** untuk bekerja secara tim:

- **Menugaskan artikel**: pemilik/manajer menugaskan artikel kepada staf untuk ditulis.
- **Menyetujui artikel**: artikel harus disetujui oleh orang yang berwenang **menyetujui** sebelum diterbitkan. Artikel yang menunggu persetujuan Anda muncul di **Tugas Saya**.
- **Komentar**: berdiskusi langsung pada setiap artikel.

Pengaturan hak akses (siapa yang boleh menulis, menerbitkan, menyetujui, mengelola koneksi...) diatur di halaman **Organisasi** (lihat bagian 17).

---

## 15. Kabar dan notifikasi

- **Lonceng notifikasi** (pojok atas): pembaruan dan pemberitahuan yang ditujukan untuk Anda.
- **Kabar**: berita dan tips menggunakan perangkat lunak. Kabar **baru** diberi label "Baru"; ketika Anda membuka dan membaca sebuah kabar, label kabar itu akan hilang. Tersedia tombol **Tandai semua sudah dibaca** untuk menghapusnya dengan cepat.

---

## 16. Paket dan kuota

Menu **Paket** menunjukkan Anda sedang berada di paket mana, berapa sisa jatah penulisan artikel dalam periode ini, dan tanggal perpanjangan.

- Lihat sisa kuota dan riwayat.
- Tingkatkan paket bila perlu kuota atau fitur tambahan.
- Jika akun diberi jatah tambahan (overage) atau tanpa batas, informasinya juga ditampilkan di sini.

---

## 17. Akun, keamanan, dan organisasi

### 17.1. Akun

Menu **Akun** (klik nama Anda di bagian bawah menu) memungkinkan Anda mengubah nama tampilan dan **mengubah kata sandi**. Jika lupa kata sandi, gunakan tautan "Lupa kata sandi" di halaman masuk untuk mengaturnya ulang melalui email.

### 17.2. Organisasi (Biz)

Klik nama organisasi di bagian atas menu → **kelola organisasi**:

- **Staf**: undang orang ke organisasi dan atur hak akses menurut peran.
- **Suara merek (Brand voice)**: deklarasikan gaya bahasa agar AI menulis sesuai karakter merek.
- **Token API organisasi**: buat kunci agar sistem lain dapat memanggil API Anda (untuk pengembang).
- **Beralih/membuat organisasi baru**: mengelola banyak ruang kerja.

---

## 18. Pertanyaan yang sering diajukan (FAQ)

**Apakah saya wajib memiliki kunci API AI?**
Ya. Fitur menulis dan memberi skor menggunakan AI, sehingga diperlukan setidaknya satu kunci API yang masih berlaku di menu Koneksi.

**Mengapa artikel belum bisa diterbitkan?**
Periksa: apakah koneksi situs web sudah ditambahkan, apakah informasi koneksi masih benar (klik Uji koneksi), dan apakah akun memiliki hak **menerbitkan**.

**Apakah mengedit artikel yang sudah terbit lalu menerbitkannya lagi akan membuat artikel ganda?**
Tidak. Perangkat lunak memperbarui artikel lama yang benar jika Anda menerbitkan melalui koneksi yang sama.

**Jika skor SEO/GEO rendah, di mana saya memperbaikinya?**
Buka menu **Optimalkan**: setiap kriteria yang belum tercapai memiliki saran spesifik agar Anda bisa memperbaikinya lalu memberi skor lagi.

**Bagaimana biaya AI dihitung?**
Berdasarkan token masuk/keluar dari penyedia yang Anda gunakan. Lihat detailnya di **Laporan**.

**Saya ingin banyak orang bekerja bersama?**
Undang mereka ke **Organisasi** dan atur hak aksesnya. Gunakan alur menugaskan artikel - menyetujui artikel di **Tugas Saya**.

**Di mana mengubah bahasa antarmuka?**
Di menu akun/pilih bahasa. Konten artikel diterjemahkan tersendiri di menu **Terjemahan**.

---

## 19. Laporan Sosial & E-commerce (Facebook, Instagram, Threads, TikTok, YouTube, Grup FB, Shopee, TikTok Shop, Lazada)

Analisis kanal sosial (milik Anda atau kompetitor) dengan data nyata + AI, dalam 2 fase:

1. Buka **Koneksi** → tambahkan kunci **Pengumpulan data** untuk Laporan Sosial (ikuti petunjuk di sana). Setiap pengumpulan memakai kredit sesuai hasil (biasanya beberapa sen). Anda bisa menambahkan **beberapa kunci Apify** - setiap kunci diuji sebelum disimpan, dan setiap pengumpulan memilih satu kunci secara acak (kunci yang gagal atau habis kuota otomatis beralih ke kunci lain).
2. Buka **Laporan Sosial** → **Buat laporan** → popup untuk **memilih kanal**: halaman Facebook, TikTok, YouTube, atau **Keseluruhan** (multi-platform). Keseluruhan punya 2 mode: masukkan **kata kunci/topik** (sistem otomatis mencari konten teratas per platform) atau masukkan **tautan kanal** langsung.
3. **Fase 1 - Kumpulkan data mentah**: berjalan bertahap dengan progres (info kanal → postingan/video → Reels/iklan untuk Facebook → komentar), lalu berhenti di **Data terkumpul** - lihat data mentah + metrik per kanal seketika.
4. **Fase 2 - Analisis AI**: klik **Analisis** → pilih AI dan model (atau "Otomatis") → AI menganalisis merek, taktik, ringkasan; laporan Keseluruhan menambah **Perbandingan kanal** dan saran alokasi. **Analisis ulang** dengan AI lain tanpa biaya pengumpulan tambahan.
5. Daftar laporan bisa difilter per kanal; lihat di sistem, **Ekspor PDF**, **Unduh .doc**, atau **Simpan ke Google Drive** (logo + sumber dari Info sistem).

6. **Gaya merek**: di halaman laporan, klik **Gaya merek** → AI mengekstrak profil gaya dari postingan/video (nada, sapaan, kosakata, pola kalimat, argumen, formula, ciri khas, frasa khas, lakukan/hindari) → tinjau per bagian dan **salin/unduh Markdown** atau **salin prompt yang dapat dipakai ulang** agar AI lain menulis dengan suara merek ini.

7. **Laporan Grup Facebook**: pilih **Grup Facebook** di popup pembuatan dan tempel tautan grup **publik** (facebook.com/groups/...). Sistem mengumpulkan **postingan beserta komentar tiap postingan** (komentar melekat pada postingannya agar dianalisis bersama), info grup (jumlah anggota, deskripsi) dan metrik (frekuensi, jenis postingan, kontributor teratas). AI menganalisis dari sudut pandang komunitas: **topik hangat**, **insight anggota** (kebutuhan, masalah, pertanyaan, bahasa) dan **peluang konten/seeding** dengan ide postingan. Pilih cakupan: **Teratas** (interaksi tertinggi 6 bulan terakhir) atau **Terbaru**. Grup privat tidak dapat dianalisis.

8. **Instagram / Threads / Produk Shopee**: pilih kanal di popup pembuatan. Instagram memakai tautan profil atau @username (postingan + Reels dengan **transkrip** + komentar); Threads memakai @username (postingan + balasan, metrik repost/kutipan); Shopee menempel **tautan produk** (...-i.SHOPID.ITEMID) - sistem mengumpulkan info produk + ulasan pembeli (dengan bintang per aspek, varian yang dibeli, balasan penjual), lalu AI menganalisis **listing**, **insight pembeli** (pujian/keluhan, kebutuhan, bahasa) dan **saran perbaikan + konten penjualan + FAQ**. Instagram dan Threads juga dapat ikut laporan Keseluruhan.

9. **Toko Shopee**: pilih **Toko Shopee**, tempel tautan toko (mis. shopee.co.id/namatoko) atau username. Sistem mengumpulkan **info toko** (bintang, pengikut, total produk, tingkat respons) + **katalog produk** (harga, diskon, rating) + **ulasan produk terlaris** (setiap ulasan terkait produknya), lalu AI menganalisis **katalog & strategi harga**, **insight pelanggan lintas produk** dan **rangkuman & saran** (peluang, perbaikan, konten penjualan). Nama laporan dapat diatur seperti laporan produk.

10. **TikTok Shop**: kartu **TikTok Shop** (dan kartu **Shopee**) menggabungkan kedua jenis - saat diklik akan ditanya membuat laporan untuk **produk** atau **seluruh toko**. Produk: tempel tautan produk (atau tautan bagikan vt.tiktok.com / ID produk) → mengumpulkan harga, diskon, **terjual**, stok, varian + ulasan pelanggan → AI menganalisis listing, insight pembeli, dan menyarankan **video jualan**. Toko: masukkan **nama toko** persis seperti di TikTok Shop (tidak ada URL toko publik) → sistem menemukan produk unggulan + total terjual/estimasi omzet + ulasan produk teratas (terkait tiap produk) → AI menganalisis katalog & harga, insight pelanggan, dan rangkuman. Pilih **wilayah** yang benar (default VN).

11. **Lazada**: kartu **Lazada** juga menggabungkan kedua jenis. Produk: tempel tautan LENGKAP dengan nama produk di path (atau tautan bagikan s.lazada) → satu run mengumpulkan harga, diskon, **terjual**, penjual + ulasan pelanggan → AI menganalisis listing, insight pembeli, dan rangkuman. Toko: tempel tautan toko (lazada.co.id/shop/namatoko) → mengumpulkan katalog + ulasan per produk → AI menganalisis katalog & harga, pelanggan, dan rangkuman.

12. **Ringkasan E-commerce** (riset pasar): kartu **Ringkasan** kini menanyakan **Social** (alur lama) atau **E-commerce**. E-commerce: masukkan **kata kunci produk/niche** + wilayah → sistem mengumpulkan produk **terlaris** di Shopee, TikTok Shop, dan Lazada → AI menganalisis **gambaran pasar** (permintaan, harga per marketplace), **pesaing utama lintas marketplace**, dan **rangkuman + rencana masuk pasar** (marketplace prioritas, harga saran, diferensiasi). Cocok untuk riset sebelum berjualan.

13. **Grafik visual**: setiap laporan dibuka dengan bagian **Grafik** - kanal sosial: performa menurut waktu posting, posting teratas, format, hari (grup FB: kontributor teraktif); produk: distribusi bintang, varian populer; toko: terlaris, distribusi harga, bintang (TikTok Shop menambah **laju penjualan 7 vs 30 hari**, hijau/merah sesuai naik/turun); ringkasan: grafik perbandingan kanal/marketplace. Grafik tetap ada di ekspor PDF/.doc/Drive.

14. **Segera hadir**: kanal **Zalo** dan **Messenger** sedang dikembangkan - muncul di pemilih kanal dengan tag "Coming soon" dan belum bisa dipilih. Akan diaktifkan saat siap.

Batas paket: jumlah Laporan Sosial per bulan dan kanal yang tersedia bergantung pada paket pemilik akun; paket Free hanya bisa menganalisis halaman Facebook. Lihat halaman **Paket** untuk batas Anda saat ini. Pada paket Free, laporan halaman hanya menampilkan bagian awal (hingga audiens target) dan tidak bisa diekspor ke PDF/DOC/Drive - upgrade untuk membuka analisis lengkap dan ekspor.

Tips: postingan dirujuk "Postingan 1..N" per kanal (dengan nama platform saat multi-kanal); jika gagal, klik **Coba lagi**.

---

## 20. Analisis skrip video

Menu **Analisis Skrip** (menu sebelah kiri) membedah sebuah video/reel yang sedang viral agar Anda bisa mempelajari formulanya lalu menerapkannya pada konten Anda sendiri.

1. Tempel **tautan video** (TikTok, YouTube, atau Facebook), pilih **AI** dan **model** (atau biarkan "Otomatis"), lalu klik **Analisis**.
2. Sistem mendeteksi platform → mengambil transkrip → AI membedahnya: **ringkasan**, **jenis konten**, **audiens**, **hook pembuka** (dan mengapa berhasil), **formula/struktur**, **timeline per detik**, **nada**, **tempo**, **kekuatan**, **perbaikan**, dan **pelajaran untuk diterapkan**.
3. Hasil muncul langsung di halaman dengan **video tersemat** di samping timeline sehingga Anda bisa membaca dan menonton sekaligus. Setiap bagian adalah blok yang bisa diklik untuk dibuka.
4. Setiap analisis disimpan di **Riwayat** di bawah; klik **Buka** untuk membukanya kembali atau **Hapus**.
5. Jika salah satu **gagal**, Anda bisa **memilih ulang AI + model** lalu menganalisis lagi (sistem menggunakan kembali transkrip yang sudah diambil — tanpa mengunduh ulang).

> Membutuhkan kunci **Pengumpulan data** (Apify), sama seperti Laporan Sosial, untuk mengambil transkrip. Akses bergantung pada paket Anda.

Untuk membagikan analisis ke luar, lihat **Berbagi publik** (bagian 21).

---

## 21. Berbagi publik (tautan bagikan, kata sandi, gambar sampul)

Baik **Laporan Sosial** maupun **Analisis Skrip** dapat menghasilkan **tautan bagikan publik** — penonton cukup membuka tautan untuk melihat konten sebagai halaman web hanya-baca, **tanpa perlu masuk**. (Konten publik tetap mengikuti paket pemilik.)

**Membuat tautan:** buka sebuah laporan/analisis yang sudah selesai → area **Berbagi publik** → klik **Buat tautan bagikan**. Sistem menyiapkan:
- Sebuah **tautan pendek bergaya blog** (mis. `.../bao-cao-...` atau `.../kich-ban-...`) untuk diposting ke media sosial — inilah tautan yang perlu Anda salin dan bagikan.
- Setelah tautan ada, area ini **menciut otomatis**; klik **Perluas** untuk mengeditnya.

**Gambar sampul (Open Graph):** agar saat menempel tautan di Facebook/Zalo muncul pratinjau yang bagus dengan gambar + judul + deskripsi.
- **Buat dengan AI**: masukkan deskripsi gambar (opsional), pilih AI/model gambar, klik **Buat sampul AI**.
- Atau **Unggah gambar** dari perangkat Anda — sistem mengompres dan mengubah formatnya agar ringan dan ramah media sosial.
- Biarkan kosong = gunakan gambar default (avatar kanal/logo).

**Kunci kata sandi:** untuk membatasi penonton → atur sebuah **kata sandi**. Siapa pun yang membuka tautan harus memasukkan kata sandi yang benar untuk melihat konten (gambar sampul/judul tetap tampil saat dibagikan). Anda bisa **mengubah kata sandi** atau **Hapus kunci** (membuatnya publik lagi) kapan saja.

**Mengelola tautan:** **Laporan Sosial** (dan **Analisis Skrip**) memiliki tab **Tautan bagikan** yang mencantumkan setiap tautan yang dibuat: **Salin**, **Buka**, **Edit** judul/deskripsi/gambar, atur/hapus **kata sandi**, **Cabut** (nonaktifkan sementara), atau **Hapus**. Setelah dicabut/dihapus, tautan lama tidak berfungsi lagi.

---

## 22. Pustaka gambar

Menu **Pustaka Gambar** (menu sebelah kiri) mengumpulkan setiap gambar yang dibuat oleh AI atau yang diunggah di seluruh sistem.

- **Lihat** semua gambar dalam bentuk kisi (grid).
- **Ganti nama** atau **Hapus** sebuah gambar.
- **Pilih beberapa** gambar untuk dihapus sekaligus — saat menghapus banyak gambar, Anda harus mengetik **DELETE** untuk mengonfirmasi (agar tidak salah hapus).

---

## 23. Butuh bantuan lebih lanjut?

- Tinjau kembali bagian terkait dalam panduan ini (gunakan kotak pencarian di bagian atas halaman).
- Untuk akun baru, Anda bisa membuka kembali bagian **pengenalan cepat** dengan tombol "Lihat panduan lagi" di halaman Ringkasan.
- Jika masih terkendala, hubungi administrator sistem Anda.
