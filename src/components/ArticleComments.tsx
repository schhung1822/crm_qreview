'use client';

import { BlockStack, Box, Button, InlineStack, Text, TextField } from '@shopify/polaris';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Comment {
  id: string;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
}

// Ghi chú/nhận xét nội bộ trên 1 bài (cộng tác). Được ĐIỀU KHIỂN từ trình soạn:
//  - open: chỉ hiện chi tiết khi bật (bấm bộ đếm ở header Soạn thảo).
//  - quote: "bôi đen để ghi chú" → điền sẵn trích dẫn đoạn đã chọn.
//  - onCount: báo số lượng ghi chú lên cha (để hiện trên bộ đếm).
export function ArticleComments({
  articleId,
  open,
  quote,
  onCount,
}: {
  articleId: string;
  open: boolean;
  quote?: { text: string; nonce: number } | null;
  onCount?: (n: number) => void;
}) {
  const t = useTranslations('comments');
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const lastQuote = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/articles/comments?articleId=${articleId}`);
    if (res.ok) setComments((await res.json()).comments ?? []);
    else setComments([]);
  }, [articleId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onCount?.(comments?.length ?? 0);
  }, [comments, onCount]);

  // Bôi đen để ghi chú: chèn trích dẫn đoạn đã chọn vào đầu ô nhập (mỗi lần chọn = 1 nonce mới).
  useEffect(() => {
    if (quote && quote.nonce !== lastQuote.current) {
      lastQuote.current = quote.nonce;
      const q = quote.text.trim().replace(/\s+/g, ' ').slice(0, 300);
      setBody((b) => (q ? `> ${q}\n\n${b}` : b));
    }
  }, [quote]);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/articles/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, body: body.trim() }),
      });
      if (res.ok) {
        setBody('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/articles/comments?articleId=${articleId}&id=${id}`, {
      method: 'DELETE',
    });
    if (res.ok) await load();
  }

  if (!open) return null;

  return (
    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">
          {t('title')} {comments ? `(${comments.length})` : ''}
        </Text>

        {comments && comments.length > 0 ? (
          <BlockStack gap="200">
            {comments.map((c) => (
              <Box key={c.id} padding="200" background="bg-surface" borderRadius="200">
                <BlockStack gap="050">
                  <InlineStack align="space-between" blockAlign="center" gap="200">
                    <Text as="span" variant="bodySm" fontWeight="medium">
                      {c.userName}
                    </Text>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" tone="subdued" variant="bodySm">
                        {new Date(c.createdAt).toLocaleString()}
                      </Text>
                      <Button variant="plain" tone="critical" onClick={() => void remove(c.id)}>
                        {t('delete')}
                      </Button>
                    </InlineStack>
                  </InlineStack>
                  <Text as="p" variant="bodySm">
                    {c.body}
                  </Text>
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        ) : comments ? (
          <Text as="p" tone="subdued" variant="bodySm">
            {t('empty')}
          </Text>
        ) : null}

        <InlineStack gap="200" blockAlign="end" wrap>
          <div style={{ flex: '1 1 260px' }}>
            <TextField
              label={t('add')}
              labelHidden
              value={body}
              onChange={setBody}
              autoComplete="off"
              multiline={2}
              placeholder={t('placeholder')}
            />
          </div>
          <Button onClick={() => void add()} loading={busy} disabled={!body.trim()}>
            {t('send')}
          </Button>
        </InlineStack>
      </BlockStack>
    </Box>
  );
}
