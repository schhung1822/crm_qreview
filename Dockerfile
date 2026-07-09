# Multi-stage build cho Next.js 14 (output: standalone). Image runtime gọn, non-root.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Sinh Prisma client từ schema (cần cho STORAGE_DRIVER=prisma; ở file mode chỉ nằm im, vô hại).
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Người dùng không phải root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Bản standalone đã gói sẵn server + node_modules tối thiểu.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Script worker LỊCH ĐĂNG (service 'worker' của docker-compose chạy: node scripts/worker.mjs).
# Chỉ dùng fetch + env, không cần node_modules của app.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Thư mục lưu dữ liệu file (.data) + ảnh sinh ra — gắn volume khi chạy.
RUN mkdir -p /app/.data /app/public/generated && chown -R nextjs:nodejs /app/.data /app/public/generated

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
