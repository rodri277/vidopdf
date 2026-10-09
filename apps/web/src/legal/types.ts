export const CONTACT_EMAIL = 'vidotho@gmail.com';
export const REPOSITORY_URL = 'https://github.com/rodri277/vidopdf';

export interface LegalSection {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly items?: readonly string[];
}

export interface LegalDocument {
  readonly title: string;
  readonly updated: string;
  readonly sections: readonly LegalSection[];
}

export type LegalTexts = Readonly<Record<'privacy' | 'legal' | 'terms', LegalDocument>>;
