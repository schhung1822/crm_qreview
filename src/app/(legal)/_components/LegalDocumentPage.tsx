import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  loadLegalDocument,
  type LegalDocumentKind,
  type LegalLanguage,
  type LegalSection,
} from '@/lib/legal-documents';

import styles from '../legal.module.css';

interface LegalDocumentPageProps {
  kind: LegalDocumentKind;
  language: LegalLanguage;
}

const COMMON_COPY = {
  vi: {
    skip: 'Bỏ qua đến nội dung chính',
    center: 'Trung tâm pháp lý',
    publicDocument: 'Tài liệu công khai',
    terms: 'Điều khoản',
    privacy: 'Quyền riêng tư',
    signIn: 'Đăng nhập',
    effective: 'Có hiệu lực',
    updated: 'Cập nhật lần cuối',
    language: 'Ngôn ngữ tài liệu',
    vietnamese: 'Tiếng Việt',
    english: 'English',
    toc: 'Mục lục',
    sections: 'mục',
    readingLabel: 'Nội dung tài liệu',
    more: 'Tài liệu liên quan',
    footer: 'Nội dung pháp lý của Qreview.',
  },
  en: {
    skip: 'Skip to main content',
    center: 'Legal center',
    publicDocument: 'Public document',
    terms: 'Terms',
    privacy: 'Privacy',
    signIn: 'Sign in',
    effective: 'Effective',
    updated: 'Last updated',
    language: 'Document language',
    vietnamese: 'Tiếng Việt',
    english: 'English',
    toc: 'On this page',
    sections: 'sections',
    readingLabel: 'Document content',
    more: 'Related document',
    footer: 'Qreview legal information.',
  },
} satisfies Record<LegalLanguage, Record<string, string>>;

const DOCUMENT_COPY = {
  term: {
    vi: {
      title: 'Điều khoản Dịch vụ',
      description:
        'Các quy định áp dụng khi bạn truy cập, kết nối tài khoản và sử dụng các tính năng xuất bản nội dung của Qreview.',
      relatedTitle: 'Chính sách Quyền riêng tư',
      relatedDescription:
        'Tìm hiểu cách Qreview thu thập, sử dụng và bảo vệ thông tin của bạn.',
    },
    en: {
      title: 'Terms of Service',
      description:
        'The rules that apply when you access Qreview, connect accounts, and use its content publishing features.',
      relatedTitle: 'Privacy Policy',
      relatedDescription:
        'Learn how Qreview collects, uses, and protects your information.',
    },
  },
  privacy: {
    vi: {
      title: 'Chính sách Quyền riêng tư',
      description:
        'Thông tin minh bạch về dữ liệu Qreview xử lý, mục đích sử dụng, thời gian lưu giữ và quyền kiểm soát của bạn.',
      relatedTitle: 'Điều khoản Dịch vụ',
      relatedDescription: 'Xem các quyền, trách nhiệm và điều kiện khi sử dụng Qreview.',
    },
    en: {
      title: 'Privacy Policy',
      description:
        'Clear information about the data Qreview processes, why it is used, how long it is retained, and your choices.',
      relatedTitle: 'Terms of Service',
      relatedDescription:
        'Review the rights, responsibilities, and conditions for using Qreview.',
    },
  },
} satisfies Record<LegalDocumentKind, Record<LegalLanguage, Record<string, string>>>;

function sectionId(language: LegalLanguage, section: LegalSection): string {
  return `${language}-section-${section.number.replaceAll('.', '-')}`;
}

function formatDate(value: string, language: LegalLanguage): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function inlineContent(text: string): ReactNode[] {
  const parts = text.split(/([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g);
  return parts.map((part, index) =>
    /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(part) ? (
      <a key={`${part}-${index}`} href={`mailto:${part}`}>
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function TableOfContents({
  sections,
  language,
  label,
}: {
  sections: LegalSection[];
  language: LegalLanguage;
  label: string;
}) {
  return (
    <nav className={styles.tocNav} aria-label={label}>
      <ol>
        {sections.map((section) => (
          <li
            key={section.number}
            className={section.level > 1 ? styles.tocSubItem : undefined}
          >
            <a href={`#${sectionId(language, section)}`}>
              <span>{section.number}</span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Header({ kind, language }: LegalDocumentPageProps) {
  const copy = COMMON_COPY[language];
  const languageQuery = language === 'en' ? '?lang=en' : '';

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/login" aria-label="Qreview">
          {/* Ảnh thương hiệu nội bộ, không cần Image Optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/qreview_toke.webp" alt="Qreview" />
        </Link>

        <nav className={styles.headerNav} aria-label={copy.center}>
          <Link
            className={kind === 'term' ? styles.headerLinkActive : styles.headerLink}
            href={`/term${languageQuery}`}
            aria-current={kind === 'term' ? 'page' : undefined}
          >
            {copy.terms}
          </Link>
          <Link
            className={kind === 'privacy' ? styles.headerLinkActive : styles.headerLink}
            href={`/privacy${languageQuery}`}
            aria-current={kind === 'privacy' ? 'page' : undefined}
          >
            {copy.privacy}
          </Link>
          <Link className={styles.signInLink} href="/login">
            {copy.signIn}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export async function LegalDocumentPage({ kind, language }: LegalDocumentPageProps) {
  const document = await loadLegalDocument(kind);
  const content = document.languages[language];
  const copy = COMMON_COPY[language];
  const documentCopy = DOCUMENT_COPY[kind][language];
  const route = `/${kind}`;
  const relatedKind: LegalDocumentKind = kind === 'term' ? 'privacy' : 'term';
  const relatedRoute = `/${relatedKind}${language === 'en' ? '?lang=en' : ''}`;

  return (
    <div className={styles.page} lang={language}>
      <a className={styles.skipLink} href="#legal-content">
        {copy.skip}
      </a>
      <Header kind={kind} language={language} />

      <main>
        <section className={styles.hero} aria-labelledby="legal-title">
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.eyebrow}>
              <span aria-hidden="true" />
              {copy.center}
              <span className={styles.eyebrowDivider} aria-hidden="true" />
              {copy.publicDocument}
            </div>
            <h1 id="legal-title">{documentCopy.title}</h1>
            <p>{documentCopy.description}</p>

            <dl className={styles.documentMeta}>
              <div>
                <dt>{copy.effective}</dt>
                <dd>
                  <time dateTime={document.effectiveDate}>
                    {formatDate(document.effectiveDate, language)}
                  </time>
                </dd>
              </div>
              <div>
                <dt>{copy.updated}</dt>
                <dd>
                  <time dateTime={document.lastUpdated}>
                    {formatDate(document.lastUpdated, language)}
                  </time>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <div className={styles.contentShell}>
          <div className={styles.mobileControls}>
            <div className={styles.languagePicker} aria-label={copy.language}>
              <a
                className={language === 'vi' ? styles.languageActive : undefined}
                href={route}
                lang="vi"
                aria-current={language === 'vi' ? 'true' : undefined}
              >
                {copy.vietnamese}
              </a>
              <a
                className={language === 'en' ? styles.languageActive : undefined}
                href={`${route}?lang=en`}
                lang="en"
                aria-current={language === 'en' ? 'true' : undefined}
              >
                {copy.english}
              </a>
            </div>

            <details className={styles.mobileToc}>
              <summary>
                <span>{copy.toc}</span>
                <small>
                  {content.sections.length} {copy.sections}
                </small>
              </summary>
              <TableOfContents
                sections={content.sections}
                language={language}
                label={copy.toc}
              />
            </details>
          </div>

          <div className={styles.readingLayout}>
            <aside className={styles.sidebar}>
              <div className={styles.sidebarInner}>
                <div className={styles.languagePicker} aria-label={copy.language}>
                  <a
                    className={language === 'vi' ? styles.languageActive : undefined}
                    href={route}
                    lang="vi"
                    aria-current={language === 'vi' ? 'true' : undefined}
                  >
                    {copy.vietnamese}
                  </a>
                  <a
                    className={language === 'en' ? styles.languageActive : undefined}
                    href={`${route}?lang=en`}
                    lang="en"
                    aria-current={language === 'en' ? 'true' : undefined}
                  >
                    {copy.english}
                  </a>
                </div>

                <div className={styles.tocHeading}>
                  <strong>{copy.toc}</strong>
                  <span>
                    {content.sections.length} {copy.sections}
                  </span>
                </div>
                <TableOfContents
                  sections={content.sections}
                  language={language}
                  label={copy.toc}
                />
              </div>
            </aside>

            <article
              id="legal-content"
              className={styles.article}
              lang={language}
              aria-label={copy.readingLabel}
            >
              <div className={styles.articleIntro}>
                <span>{copy.publicDocument}</span>
                <h2>{documentCopy.title}</h2>
                <p>{documentCopy.description}</p>
              </div>

              {content.sections.map((section) => {
                const Heading = section.level > 1 ? 'h3' : 'h2';
                return (
                  <section
                    id={sectionId(language, section)}
                    key={section.number}
                    className={section.level > 1 ? styles.subsection : styles.section}
                  >
                    <Heading>
                      <span>{section.number}</span>
                      {section.title}
                    </Heading>

                    <div className={styles.sectionBody}>
                      {section.blocks.map((block, blockIndex) =>
                        block.type === 'list' ? (
                          <ul key={`${section.number}-list-${blockIndex}`}>
                            {block.items.map((item, itemIndex) => (
                              <li key={`${item}-${itemIndex}`}>{inlineContent(item)}</li>
                            ))}
                          </ul>
                        ) : block.text.includes('\n') ? (
                          <address key={`${section.number}-address-${blockIndex}`}>
                            {block.text.split('\n').map((line) => (
                              <span key={line}>{inlineContent(line)}</span>
                            ))}
                          </address>
                        ) : (
                          <p key={`${section.number}-paragraph-${blockIndex}`}>
                            {inlineContent(block.text)}
                          </p>
                        ),
                      )}
                    </div>
                  </section>
                );
              })}

              <aside className={styles.relatedDocument} aria-label={copy.more}>
                <div>
                  <span>{copy.more}</span>
                  <h2>{documentCopy.relatedTitle}</h2>
                  <p>{documentCopy.relatedDescription}</p>
                </div>
                <Link href={relatedRoute} aria-label={documentCopy.relatedTitle}>
                  <span aria-hidden="true">→</span>
                </Link>
              </aside>
            </article>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div>
          <span>© {new Date().getUTCFullYear()} Qreview</span>
          <span>{copy.footer}</span>
        </div>
        <nav aria-label={copy.center}>
          <Link href={`/term${language === 'en' ? '?lang=en' : ''}`}>{copy.terms}</Link>
          <Link href={`/privacy${language === 'en' ? '?lang=en' : ''}`}>
            {copy.privacy}
          </Link>
          <a href="mailto:qreview.asia@gmail.com">qreview.asia@gmail.com</a>
        </nav>
      </footer>
    </div>
  );
}
