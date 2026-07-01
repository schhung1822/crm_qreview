'use client';

import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  ChoiceList,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExtLink } from '@/components/ui';
import { markdownToHtml } from '@/lib/content/markdown';
import { scoreAeo } from '@/lib/aeo/score';
import { scoreGeo } from '@/lib/geo/score';
import { scoreSeo } from '@/lib/seo/score';
import { buildScoreInput } from '@/lib/scoring/types';

interface Conn {
  id: string;
  label: string;
  provider: string;
  locale: string;
}
interface DraftSummary {
  id: string;
  title: string;
  status: string;
}
interface Term {
  id: string;
  name: string;
}

// HTML gửi lên CMS: bỏ ảnh placeholder chưa thay bằng URL thật.
function toCmsHtml(md: string): string {
  return markdownToHtml(md).replace(/<span class="md-img-ph"[\s\S]*?<\/span>/g, '');
}

export default function PublishPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();

  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftId, setDraftId] = useState<string>('');
  const [draftStatus, setDraftStatus] = useState<'draft' | 'published'>('draft');
  const [cmsPostId, setCmsPostId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [meta, setMeta] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [keyword, setKeyword] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [status, setStatus] = useState<'publish' | 'draft' | 'scheduled'>('publish');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('09:00');

  const [conns, setConns] = useState<Conn[] | null>(null);
  const [connId, setConnId] = useState('');

  // Taxonomy của site đích.
  const [cats, setCats] = useState<Term[]>([]);
  const [taxSupported, setTaxSupported] = useState(true);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  // Chuyên mục bài cũ đã có (nhập về để sửa) - chờ taxonomy tải xong rồi chọn sẵn.
  const [draftCats, setDraftCats] = useState<string[]>([]);
  const [tags, setTags] = useState('');

  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; url?: string; warn?: string } | null>(
    null,
  );

  useEffect(() => {
    fetch('/api/connections')
      .then((r) => r.json())
      .then((d: { connections: Conn[] }) => {
        setConns(d.connections);
        if (d.connections[0]) setConnId(d.connections[0].id);
      })
      .catch(() => setConns([]));
    fetch('/api/articles/draft')
      .then((r) => r.json())
      .then((d: { articles: DraftSummary[] }) => setDrafts(d.articles ?? []))
      .catch(() => setDrafts([]));
  }, []);

  // Nạp 1 bản nháp (từ ?draft= hoặc khi chọn ở dropdown).
  const loadDraft = useCallback(async (id: string) => {
    const res = await fetch(`/api/articles/draft?id=${id}`);
    if (!res.ok) return;
    const a = (await res.json()).article;
    if (!a) return;
    setDraftId(a.id);
    setDraftStatus(a.status === 'published' ? 'published' : 'draft');
    setCmsPostId(a.cmsPostId);
    // Bài đã đăng → không cho hẹn giờ; đưa về "Đăng ngay".
    if (a.status === 'published') setStatus((s) => (s === 'scheduled' ? 'publish' : s));
    setTitle(a.title);
    setSlug(a.slug || '');
    setMeta(a.metaDescription || '');
    setMarkdown(a.markdown || '');
    setKeyword(a.targetKeyword || '');
    setCoverImageUrl(a.coverImageUrl || '');
    setTags(Array.isArray(a.tags) ? a.tags.join(', ') : '');
    // Chuyên mục đã gán trên web → chọn sẵn sau khi taxonomy tải (effect bên dưới).
    setDraftCats(Array.isArray(a.categories) ? a.categories : []);
    if (a.connectionId) setConnId(a.connectionId);
  }, []);

  useEffect(() => {
    const id = params.get('draft');
    if (id) void loadDraft(id);
  }, [params, loadDraft]);

  // Tải taxonomy khi đổi kết nối.
  useEffect(() => {
    if (!connId) return;
    setCats([]);
    setSelectedCats([]);
    fetch(`/api/connections/${connId}/taxonomy`)
      .then((r) => r.json())
      .then((d: { supported?: boolean; categories?: Term[] }) => {
        setTaxSupported(d.supported !== false);
        setCats(d.categories ?? []);
      })
      .catch(() => {
        setTaxSupported(false);
        setCats([]);
      });
  }, [connId]);

  // Khi taxonomy đã tải & có chuyên mục từ bài cũ → chọn sẵn (chỉ giữ id còn tồn tại
  // trên site). Chạy sau khi effect trên reset selectedCats, nên giữ đúng lựa chọn cũ.
  useEffect(() => {
    if (!draftCats.length || !cats.length) return;
    const valid = draftCats.filter((id) => cats.some((c) => c.id === id));
    if (valid.length) setSelectedCats(valid);
  }, [draftCats, cats]);

  // Ảnh bìa gửi riêng (route xử lý featured image / inline tùy CMS) → không nhúng vào body.
  const contentHtml = useMemo(() => toCmsHtml(markdown), [markdown]);

  const scoreInput = useMemo(
    () => buildScoreInput({ title, metaDescription: meta, slug, markdown, locale, targetKeyword: keyword }),
    [title, meta, slug, markdown, locale, keyword],
  );
  const seo = useMemo(() => scoreSeo(scoreInput), [scoreInput]);
  const aeo = useMemo(() => scoreAeo(scoreInput), [scoreInput]);
  const geo = useMemo(() => scoreGeo(scoreInput), [scoreInput]);
  const hasContent = markdown.trim().length > 0;
  const scoreTone = (v: number): 'success' | 'attention' | 'warning' =>
    v >= 80 ? 'success' : v >= 60 ? 'attention' : 'warning';

  async function publish() {
    setPublishing(true);
    setResult(null);
    try {
      const scheduledAt =
        status === 'scheduled' && schedDate
          ? new Date(`${schedDate}T${schedTime || '09:00'}:00`).toISOString()
          : undefined;
      const tagNames = tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connId,
          confirm: true,
          articleId: draftId || undefined,
          article: {
            cmsPostId,
            title,
            slug,
            contentHtml,
            metaDescription: meta,
            status,
            scheduledAt,
            categories: selectedCats,
            tags: tagNames,
            coverImageUrl,
          },
        }),
      });
      const data = await res.json();
      if (data.scheduled) {
        // Đã tạo job lịch đăng - worker sẽ đăng đúng giờ (không đăng ngay).
        setResult({
          ok: true,
          msg: t('publish.scheduledDone', {
            date: data.runAt ? new Date(data.runAt).toLocaleString() : '',
          }),
        });
      } else if (data.published) {
        const warn =
          data.imagesNotUploaded > 0
            ? t('publish.imagesNotUploaded', { n: data.imagesNotUploaded })
            : undefined;
        setResult({ ok: true, msg: t('publish.confirm') + ' ✓', url: data.post?.url, warn });
        if (draftId) {
          await fetch('/api/articles/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: draftId,
              title,
              slug,
              metaDescription: meta,
              markdown,
              locale,
              status: status === 'scheduled' ? 'draft' : 'published',
              connectionId: connId,
              cmsPostId: data.post?.id,
              publishedUrl: data.post?.url,
            }),
          });
        }
      } else {
        setResult({ ok: false, msg: data.error ?? 'Đăng thất bại' });
      }
    } finally {
      setPublishing(false);
    }
  }

  const noConns = conns !== null && conns.length === 0;

  return (
    <Page title={t('publish.title')} subtitle={t('publish.subtitle')}>
      <BlockStack gap="400">
        <Banner tone="warning">{t('publish.warning')}</Banner>

        {noConns ? (
          <Banner
            tone="info"
            title={t('connections.empty')}
            action={{ content: t('connections.add'), url: `/${locale}/connections` }}
          />
        ) : null}

        {result ? (
          <Banner tone={result.ok ? 'success' : 'critical'}>
            {result.msg}{' '}
            {result.url ? <ExtLink href={result.url}>{result.url}</ExtLink> : null}
          </Banner>
        ) : null}

        {result?.warn ? <Banner tone="warning">{result.warn}</Banner> : null}

        {/* Chọn bản nháp */}
        <Card>
          <Select
            label={t('publish.pickDraft')}
            options={[
              { label: t('publish.noDraftPicked'), value: '' },
              ...drafts.map((d) => ({ label: d.title || '(không tiêu đề)', value: d.id })),
            ]}
            value={draftId}
            onChange={(v) => (v ? loadDraft(v) : setDraftId(''))}
            disabled={drafts.length === 0}
            helpText={drafts.length === 0 ? t('publish.noDrafts') : undefined}
          />
        </Card>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingSm">
                    {t('publish.preview')}
                  </Text>
                  {hasContent ? (
                    <InlineStack gap="200">
                      <Badge tone={scoreTone(seo.score)}>{`${t('editor.scoreSeo')} ${seo.score}`}</Badge>
                      <Badge tone={scoreTone(aeo.score)}>{`${t('editor.scoreAeo')} ${aeo.score}`}</Badge>
                      <Badge tone={scoreTone(geo.score)}>{`${t('editor.scoreGeo')} ${geo.score}`}</Badge>
                    </InlineStack>
                  ) : null}
                </InlineStack>
                {!hasContent ? (
                  <Text as="p" tone="subdued">
                    {t('publish.emptyContent')}
                  </Text>
                ) : null}
                <TextField label={t('publish.fieldTitle')} value={title} onChange={setTitle} autoComplete="off" />
                <TextField
                  label={t('publish.slug')}
                  value={slug}
                  onChange={setSlug}
                  autoComplete="off"
                  helpText={`example.com/${locale}/${slug}`}
                />
                <TextField
                  label={t('publish.metaDescription')}
                  value={meta}
                  onChange={setMeta}
                  multiline={2}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    {t('publish.destination')}
                  </Text>
                  <Select
                    label={t('publish.site')}
                    options={(conns ?? []).map((c) => ({
                      label: `${c.label} · ${c.provider} · ${c.locale}`,
                      value: c.id,
                    }))}
                    value={connId}
                    onChange={(v) => {
                      // Người dùng tự đổi site → bỏ chọn-sẵn chuyên mục của bài cũ (id khác site).
                      setConnId(v);
                      setDraftCats([]);
                    }}
                    disabled={noConns}
                    placeholder={noConns ? '-' : undefined}
                  />
                  <Select
                    label={t('common.status')}
                    options={[
                      { label: t('publish.publishNow'), value: 'publish' },
                      // Chỉ hẹn giờ được cho bài CHƯA đăng (bản nháp).
                      {
                        label: t('publish.scheduledOption'),
                        value: 'scheduled',
                        disabled: draftStatus === 'published',
                      },
                      { label: t('publish.saveToCms'), value: 'draft' },
                    ]}
                    value={status}
                    onChange={(v) => setStatus(v as 'publish' | 'draft' | 'scheduled')}
                    helpText={draftStatus === 'published' ? t('publish.publishedNoSchedule') : undefined}
                  />
                  {status === 'scheduled' ? (
                    <>
                      <TextField
                        type="date"
                        label={t('publish.scheduleDate')}
                        value={schedDate}
                        onChange={setSchedDate}
                        autoComplete="off"
                      />
                      <TextField
                        type="time"
                        label={t('publish.scheduleTime')}
                        value={schedTime}
                        onChange={setSchedTime}
                        autoComplete="off"
                        helpText={t('publish.scheduleHint')}
                      />
                    </>
                  ) : null}
                </BlockStack>
              </Card>

              {/* Chuyên mục & thẻ */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    {t('publish.categories')}
                  </Text>
                  {!taxSupported ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      {t('publish.taxonomyUnsupported')}
                    </Text>
                  ) : cats.length === 0 ? (
                    <Text as="p" tone="subdued" variant="bodySm">
                      -
                    </Text>
                  ) : (
                    <ChoiceList
                      allowMultiple
                      title=""
                      titleHidden
                      choices={cats.map((c) => ({ label: c.name, value: c.id }))}
                      selected={selectedCats}
                      onChange={setSelectedCats}
                    />
                  )}
                  <TextField
                    label={t('publish.tags')}
                    value={tags}
                    onChange={setTags}
                    autoComplete="off"
                    helpText={t('publish.tagsHelp')}
                    disabled={!taxSupported}
                  />
                </BlockStack>
              </Card>

              <Button
                variant="primary"
                fullWidth
                size="large"
                loading={publishing}
                disabled={!connId || noConns || !hasContent || (status === 'scheduled' && !schedDate)}
                onClick={publish}
              >
                {status === 'scheduled' ? t('publish.confirmSchedule') : t('publish.confirm')}
              </Button>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
