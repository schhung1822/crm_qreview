'use client';

import { Box, Card, InlineStack, Page, Text, TextField } from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Icon } from '@shopify/polaris';
import { SearchIcon } from '@/components/icons';
import { markdownToHtml } from '@/lib/content/markdown';
import { getUserGuideMd } from '@/lib/content/user-guide';

// CSS scoped cho nội dung render từ markdown (nhúng trong component, khỏi đụng globals.css).
const GUIDE_CSS = `
.user-guide { font-size: 14px; line-height: 1.7; color: var(--p-color-text); }
.user-guide h1 { font-size: 20px; margin: 4px 0 10px; }
.user-guide h2 { font-size: 17px; margin: 18px 0 8px; }
.user-guide h3 { font-size: 15px; margin: 14px 0 6px; }
.user-guide p { margin: 8px 0; }
.user-guide ul, .user-guide ol { margin: 8px 0 8px 22px; }
.user-guide li { margin: 4px 0; }
.user-guide strong { font-weight: 650; }
.user-guide code { background: #eef1f5; padding: 1px 5px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 0.88em; }
.user-guide a { color: var(--p-color-text-emphasis); }
.user-guide blockquote { border-left: 3px solid var(--p-color-border-emphasis); margin: 10px 0; padding: 8px 14px; color: var(--p-color-text-secondary); background: var(--p-color-bg-surface-secondary); border-radius: 0 6px 6px 0; }
.user-guide hr { border: none; border-top: 1px solid var(--p-color-border); margin: 16px 0; }
.guide-toc a { display: block; padding: 5px 8px; border-radius: 6px; color: var(--p-color-text); text-decoration: none; font-size: 13px; }
.guide-toc a:hover { background: var(--p-color-bg-surface-hover); }
.guide-layout { display: grid; grid-template-columns: 240px 1fr; gap: 16px; align-items: start; }
.guide-toc-wrap { position: sticky; top: 16px; }
@media (max-width: 900px) { .guide-layout { grid-template-columns: 1fr; } .guide-toc-wrap { position: static; } }
`;

interface Section {
  id: string;
  title: string;
  md: string; // toàn bộ khối markdown của mục (gồm cả dòng "## ")
  hay: string; // chữ thường để tìm kiếm
}

// Tách markdown thành: phần mở đầu (trước "## " đầu tiên) + các mục theo H2.
function parseSections(md: string): { intro: string; sections: Section[] } {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const intro: string[] = [];
  const sections: Section[] = [];
  let cur: string[] | null = null;
  let curTitle = '';
  let idx = 0;
  const push = () => {
    if (cur) {
      const body = cur.join('\n');
      sections.push({ id: `sec-${idx++}`, title: curTitle, md: body, hay: body.toLowerCase() });
    }
  };
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      push();
      cur = [line];
      curTitle = m[1].trim();
    } else if (cur) {
      cur.push(line);
    } else {
      intro.push(line);
    }
  }
  push();
  return { intro: intro.join('\n'), sections };
}

export default function GuidePage() {
  const t = useTranslations('guide');
  const locale = useLocale();
  const [query, setQuery] = useState('');

  const { intro, sections } = useMemo(() => parseSections(getUserGuideMd(locale)), [locale]);
  const introHtml = useMemo(() => markdownToHtml(intro), [intro]);

  const q = query.trim().toLowerCase();
  const shown = q ? sections.filter((s) => s.hay.includes(q)) : sections;

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <style dangerouslySetInnerHTML={{ __html: GUIDE_CSS }} />
      <Box paddingBlockEnd="400">
        <TextField
          label={t('searchLabel')}
          labelHidden
          value={query}
          onChange={setQuery}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          prefix={<Icon source={SearchIcon} tone="subdued" />}
          clearButton
          onClearButtonClick={() => setQuery('')}
        />
      </Box>

      <div className="guide-layout">
        {/* Mục lục (ẩn khi đang tìm kiếm để đỡ rối) */}
        <div className="guide-toc-wrap">
          {!q ? (
            <Card padding="200">
              <Box paddingBlock="100" paddingInline="200">
                <Text as="h2" variant="headingSm">
                  {t('tocTitle')}
                </Text>
              </Box>
              <nav className="guide-toc">
                {sections.map((s) => (
                  <a key={s.id} href={`#${s.id}`}>
                    {s.title}
                  </a>
                ))}
              </nav>
            </Card>
          ) : (
            <Card padding="300">
              <Text as="p" tone="subdued" variant="bodySm">
                {t('resultsCount', { count: shown.length })}
              </Text>
            </Card>
          )}
        </div>

        {/* Nội dung */}
        <div>
          {!q && intro.trim() ? (
            <Box paddingBlockEnd="400">
              <Card>
                <div className="user-guide" dangerouslySetInnerHTML={{ __html: introHtml }} />
              </Card>
            </Box>
          ) : null}

          {shown.length === 0 ? (
            <Card>
              <Box padding="400">
                <InlineStack align="center">
                  <Text as="p" tone="subdued">
                    {t('noResults')}
                  </Text>
                </InlineStack>
              </Box>
            </Card>
          ) : (
            shown.map((s) => (
              <Box key={s.id} paddingBlockEnd="400">
                <div id={s.id} style={{ scrollMarginTop: 16 }}>
                  <Card>
                    <div
                      className="user-guide"
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(s.md) }}
                    />
                  </Card>
                </div>
              </Box>
            ))
          )}
        </div>
      </div>
    </Page>
  );
}
