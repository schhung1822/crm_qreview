import { describe, expect, it } from 'vitest';

import { loadLegalDocument } from '@/lib/legal-documents';

describe('public legal documents', () => {
  it('parses both languages and preserves the numbered structure', async () => {
    const terms = await loadLegalDocument('term');
    const privacy = await loadLegalDocument('privacy');

    expect(
      terms.languages.vi.sections.filter((section) => section.level === 1),
    ).toHaveLength(18);
    expect(
      terms.languages.en.sections.filter((section) => section.level === 1),
    ).toHaveLength(18);
    expect(
      privacy.languages.vi.sections.filter((section) => section.level === 1),
    ).toHaveLength(16);
    expect(
      privacy.languages.en.sections.filter((section) => section.level === 1),
    ).toHaveLength(16);
    expect(
      privacy.languages.vi.sections.some((section) => section.number === '3.1'),
    ).toBe(true);
    expect(
      privacy.languages.en.sections.some((section) => section.number === '7.4'),
    ).toBe(true);
  });

  it('turns the plain-text list convention into semantic list blocks', async () => {
    const terms = await loadLegalDocument('term');
    const responsibility = terms.languages.en.sections.find(
      (section) => section.number === '3',
    );

    expect(
      responsibility?.blocks.some(
        (block) => block.type === 'list' && block.items.length === 4,
      ),
    ).toBe(true);
  });

  it('does not expose draft placeholders in public content', async () => {
    const documents = await Promise.all([
      loadLegalDocument('term'),
      loadLegalDocument('privacy'),
    ]);
    const publicContent = JSON.stringify(documents);

    expect(publicContent).not.toContain('[CONTACT_EMAIL]');
    expect(publicContent).not.toContain('[LEGAL_ENTITY_NAME]');
    expect(publicContent).not.toContain('Before publishing');
    expect(publicContent).toContain('qreview.asia@gmail.com');
  });
});
