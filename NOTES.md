# SRT → ASS Bilingual Translator — Lịch sử làm việc

> File này ghi lại toàn bộ yêu cầu và thay đổi theo thứ tự thời gian.
> Mục đích: AI hoặc developer đọc lại là hiểu ngay đã làm gì, tại sao.

---

## Mục tiêu dự án
Web app nhận file phụ đề `.srt` tiếng Anh → dịch sang tiếng Việt → trả về file `.ass` song ngữ:
- **Tiếng Anh** hiển thị **trên** (style `Default`, trắng, font 70)
- **Tiếng Việt** hiển thị **dưới** (style `Secondary`, cyan, font 55)

---

## Cấu trúc thư mục hiện tại (Next.js)
```
translate_caption/
├── app/
│   ├── layout.js            # Root layout + metadata
│   ├── globals.css          # Global styles (dark theme)
│   ├── page.jsx             # Frontend React (drag&drop, progress, download)
│   └── api/translate/
│       └── route.js         # API endpoint POST /api/translate
├── lib/
│   └── srtTranslator.js     # Parse SRT + dịch gtx parallel + build ASS
├── package.json
├── next.config.mjs          # output: standalone (cho Docker)
├── Dockerfile               # Node 20 alpine, multi-stage
├── docker-compose.yml       # port 5001:3000
├── .gitignore
├── .dockerignore
└── NOTES.md                 # File lịch sử này
```

---

## Lịch sử thay đổi

---

### [Session 1] — Build dự án lần đầu

**Yêu cầu:**
- Upload file `.srt` tiếng Anh, dịch ra tiếng Việt song ngữ
- File output cùng tên file gốc
- Làm web để upload và tải kết quả về
- Note lại vào file để sau tra lại

**Đã làm:**
- Tạo `srt_translator.py`: parse SRT → dịch batch bằng `deep-translator` (Google) → build bilingual SRT
- Tạo `app.py`: Flask với 2 route `POST /translate` và `GET /download/<job_id>/<filename>`
- Tạo `templates/index.html`: dark UI, drag & drop, fake progress bar, nút download
- Tạo `requirements.txt`: flask, deep-translator, werkzeug
- Tạo `NOTES.md` lần đầu

**Output lúc này:** file `.srt` song ngữ (EN trên, VI dưới trong cùng 1 block)

---

### [Session 2] — Đổi format output sang ASS + đổi API dịch

**Yêu cầu:**
- Output phải là file `.ass` (Advanced SubStation Alpha) theo mẫu cụ thể
- Dùng Google Translate free `gtx` endpoint (không cần API key)

**Mẫu output `.ass` được cung cấp:**
```ini
[Script Info] ...
[V4+ Styles]
Style: Default,Noto Sans,70,...   ← Tiếng Anh, trắng
Style: Secondary,Noto Sans,55,...  ← Tiếng Việt, cyan

[Events]
Dialogue: ...,Secondary,...,,Bản dịch tiếng Việt
Dialogue: ...,Default,...,,Original English text
```

**Đã làm:**
- Viết lại `srt_translator.py`:
  - Bỏ `deep-translator`, thay bằng `urllib` built-in gọi endpoint `gtx`
  - Thêm hàm `_srt_time_to_ass()`: convert `00:00:00,920` → `0:00:00.92`
  - Thêm hàm `build_bilingual_ass()`: sinh 2 dòng Dialogue/block (Secondary trước, Default sau → EN trên VI dưới)
- Cập nhật `app.py`: output filename đổi thành `<stem>_vi.ass`
- Cập nhật `requirements.txt`: bỏ `deep-translator`, chỉ còn flask + werkzeug
- Cập nhật `index.html`: mention format `.ass`, update UI text
- Cập nhật `NOTES.md`

---

### [Session 3] — Thêm Dockerfile + docker-compose

**Yêu cầu:** Viết Dockerfile và docker-compose để không cần cài Python trên máy

**Đã làm:**
- Tạo `Dockerfile`:
  - Base: `python:3.12-slim`
  - Chạy bằng `gunicorn` (2 worker, timeout 300s) thay Flask dev server
- Tạo `docker-compose.yml`:
  - Port `5001:5000`
  - Mount `./outputs` và `./uploads` ra host
  - `restart: unless-stopped`
  - Healthcheck 30s
- Tạo `.dockerignore`
- Thêm `gunicorn==22.0.0` vào `requirements.txt`

**Cách chạy:**
```bash
docker compose up -d --build
# → http://localhost:5001
```

---

### [Session 4] — Đổi port 5000 → 5001

**Yêu cầu:** Đổi port expose sang 5001

**Đã làm:** Sửa `docker-compose.yml` dòng ports: `"5000:5000"` → `"5001:5000"`

---

### [Session 5] — Tối ưu tốc độ dịch (parallel HTTP)

**Yêu cầu:** App dịch chậm, muốn hiểu logic để đưa ra phương án

**Phân tích vấn đề:**
- File 113 block → 8 batch (15 block/batch)
- Các batch gọi Google **tuần tự** + sleep 0.4s giữa mỗi batch
- Ước tính: ~14–18 giây/file

**Các phương án được đề xuất:**
- A: Parallel HTTP (ThreadPoolExecutor) — nhanh ~5–7x, không đổi API
- B: Tăng batch_size — đơn giản nhưng dễ lỗi split
- C: Google Cloud Translation API — cần API key, có phí
- D: Task queue (Celery + Redis) — phức tạp, tốt cho multi-user

**Đã làm (chọn phương án A):**
- Tách logic batch thành hàm `_translate_batch(batch_index, texts, src, tgt, jitter)`
- Dùng `ThreadPoolExecutor` gửi tất cả batch **đồng thời**
- Stagger `0.1s × batch_index` để tránh rate-limit
- Kết quả gom lại theo `batch_index`, đảm bảo đúng thứ tự
- Kết quả: ~1.5–3 giây thay vì ~14–18 giây

---

### [Session 6] — Bỏ hậu tố `_vi` khỏi tên file output

**Yêu cầu:** File output không cần thêm `_vi`, giữ nguyên tên gốc

**Đã làm:** Sửa `app.py`: `f"{stem}_vi.ass"` → `f"{stem}.ass"`

---

### [Session 7] — Không lưu file xuống disk

**Yêu cầu:** Không lưu output file, xử lý xong là trả về luôn

**Đã làm:**
- Viết lại `app.py` hoàn toàn:
  - File upload đọc thẳng vào RAM (`file.read()`) — không lưu disk
  - Kết quả dịch lưu tạm trong `dict` RAM: `_job_store = {job_id: (filename, bytes)}`
  - Route `/download/<job_id>/<filename>`: dùng `io.BytesIO` gửi từ RAM, `pop()` khỏi store ngay sau khi gửi → xoá luôn
  - Bỏ `OUTPUT_FOLDER` hoàn toàn
- Cập nhật `docker-compose.yml`: bỏ volume `outputs` (không cần nữa)

---

## Logic hiện tại (cuối cùng)

```
POST /translate
  ├── Đọc file SRT vào RAM (không lưu disk)
  ├── parse_srt()          → List[SubtitleBlock]
  ├── translate_blocks()   → gọi Google gtx song song (ThreadPoolExecutor, 6 thread)
  ├── build_bilingual_ass()→ chuỗi .ass
  ├── Lưu vào _job_store[job_id] = (filename, bytes)  ← trong RAM
  └── Trả JSON {job_id, filename}

GET /download/<job_id>/<filename>
  ├── _job_store.pop(job_id)  ← lấy ra VÀ xoá luôn
  ├── io.BytesIO(data)        ← stream từ RAM
  └── send_file() → trả file về browser
```

**Không có gì lưu xuống disk. Mọi thứ sống trong RAM và mất sau khi download hoặc restart.**

---

## Lưu ý quan trọng

- `_job_store` là dict trong RAM → **mất khi restart container**. Nếu user upload xong mà chưa download rồi server restart thì mất. Acceptable cho use case cá nhân.
- Google gtx không có SLA chính thức, rate limit khoảng 100–200 req/phút. Với 6 thread parallel vẫn an toàn.
- Nếu sau này cần scale lên nhiều user đồng thời → thêm Redis làm job store + Celery làm task queue.

---

---

### [Session 8] — Chuyển toàn bộ sang Next.js (JavaScript)

**Yêu cầu:**
- Chuyển từ Python/Flask sang JavaScript/Next.js
- Dễ deploy lên Vercel
- Viết `.gitignore` tránh đẩy `node_modules`

**Thay đổi kiến trúc:**

| | Python (cũ) | Next.js (mới) |
|---|---|---|
| Backend | Flask + Gunicorn | Next.js App Router API route |
| Translation | ThreadPoolExecutor | Promise.all (native async) |
| Job store | dict RAM + 2 request | Không cần — trả file thẳng từ POST |
| Frontend | HTML/CSS/JS thuần | React (useState, hooks) |
| Docker base | python:3.12-slim | node:20-alpine (multi-stage) |
| Deploy | Docker / VPS | Vercel (zero-config) hoặc Docker |

**Flow mới (đơn giản hơn):**
```
POST /api/translate
  ├── request.formData() → đọc file vào RAM
  ├── translateSrtToAss() → Promise.all parallel
  └── return new Response(assContent) → trả file thẳng, không lưu disk

Frontend:
  fetch('/api/translate') → res.blob() → URL.createObjectURL() → a.click()
```

**Files đã tạo:**
- `lib/srtTranslator.js` — port của srt_translator.py sang JS
- `app/api/translate/route.js` — Next.js App Router API
- `app/page.jsx` — React component
- `app/layout.js` + `app/globals.css`
- `package.json`, `next.config.mjs`
- `.gitignore` (bao gồm node_modules, .next, .env)
- Update `Dockerfile` → Node 20 alpine multi-stage
- Update `docker-compose.yml` → port 5001:3000

**Files đã xoá:**
- `app.py`, `srt_translator.py`, `requirements.txt`
- `templates/index.html`

**Cách chạy local:**
```bash
npm install
npm run dev
# → http://localhost:3000
```

**Cách deploy Vercel:**
```bash
# Cài Vercel CLI
npm i -g vercel

# Deploy
vercel
# → Vercel tự detect Next.js, zero-config
```

**Cách chạy Docker:**
```bash
docker compose up -d --build
# → http://localhost:5001
```

---

## Logic hiện tại (Next.js, cuối cùng)

```
POST /api/translate
  ├── Đọc file SRT vào RAM (request.formData())
  ├── parseSrt()           → array of blocks
  ├── translateBlocks()    → Promise.all parallel (Google gtx, stagger 100ms/batch)
  ├── buildBilingualAss()  → chuỗi .ass
  └── return new Response(assContent) → file trả thẳng về browser

Frontend (React):
  fetch() → blob → URL.createObjectURL() → a.click() (auto download)
```

**Không lưu bất kỳ file nào xuống disk. Mọi thứ trong RAM, mất sau khi response xong.**

---

## Lưu ý quan trọng

- Vercel Hobby plan timeout 10s, Pro 60s. File dài (>200 block) có thể timeout trên Hobby.
- Google gtx không có SLA chính thức, rate limit ~100–200 req/phút. Stagger 100ms/batch vẫn an toàn.
- `maxDuration = 60` được set trong route.js (chỉ có tác dụng trên Vercel Pro).

---

## TODO tiếp theo (chưa làm)
- [ ] Hỗ trợ thêm `.vtt` input
- [ ] Cho chọn ngôn ngữ nguồn / đích (không chỉ EN→VI)
- [ ] Preview subtitle trên web trước khi download
- [ ] Rate limiting nếu public deploy
