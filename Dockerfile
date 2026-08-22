# Multi-stage build cho Next.js 14 (output: standalone). Image runtime gọn, non-root.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Dùng `npm install` (KHÔNG `npm ci`) vì package-lock.json được tạo trên Windows nên THIẾU các gói
# optional riêng cho Linux/Alpine-musl mà `sharp` cần (vd @emnapi/runtime, @img/sharp-linuxmusl).
# `npm ci` nghiêm ngặt sẽ báo "Missing ... from lock file" khi build trên Alpine; `npm install` tự
# giải & tải đúng gói cho nền tảng lúc build.
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Địa chỉ công khai của website Qreview. Next NHÚNG CỨNG mọi biến NEXT_PUBLIC_* vào bundle ngay
# lúc `npm run build` — đặt nó ở runtime (docker-compose environment) là QUÁ MUỘN, giá trị đã
# thành chuỗi rỗng trong code đã build. Truyền vào đây qua build arg (compose đã khai báo sẵn).
ARG NEXT_PUBLIC_QREVIEW_SITE_URL=
ENV NEXT_PUBLIC_QREVIEW_SITE_URL=$NEXT_PUBLIC_QREVIEW_SITE_URL
# Sinh Prisma client từ schema (cần cho STORAGE_DRIVER=prisma; ở file mode chỉ nằm im, vô hại).
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Next standalone bind theo biến HOSTNAME. Docker tự đặt HOSTNAME=<container-id> → app chỉ nghe ở
# IP container, KHÔNG nghe 127.0.0.1 → healthcheck (gọi 127.0.0.1:3000) fail → container "unhealthy".
# Ép nghe mọi interface (gồm loopback) để healthcheck + reverse proxy đều vào được.
ENV HOSTNAME=0.0.0.0

# Người dùng không phải root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Bản standalone đã gói sẵn server + node_modules tối thiểu.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Script worker LỊCH ĐĂNG (service 'worker' của docker-compose chạy: node scripts/worker.mjs).
# Chỉ dùng fetch + env, không cần node_modules của app.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# ── Postgres mode (STORAGE_DRIVER=prisma) ──────────────────────────────────────────────────
# Bản standalone của Next KHÔNG chắc gói đủ Prisma query-engine + schema → khi chạy driver=prisma
# dễ lỗi "Query engine library not found". Copy tường minh generated client (.prisma), @prisma/client
# và thư mục prisma/ (schema + migrations), và cài openssl (engine Prisma cần trên Alpine). Ở file
# mode các file này chỉ nằm im, VÔ HẠI. (Bỏ khối này nếu chắc chắn chỉ chạy file mode.)
RUN apk add --no-cache openssl
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Thư mục lưu dữ liệu file (.data) + ảnh sinh ra — gắn volume khi chạy.
RUN mkdir -p /app/.data /app/public/generated && chown -R nextjs:nodejs /app/.data /app/public/generated

USER nextjs
EXPOSE 3000

# Health check hạ tầng: gọi /api/healthz (không cần auth). Node 20 có fetch sẵn (không cần curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
