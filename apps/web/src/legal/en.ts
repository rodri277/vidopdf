import { CONTACT_EMAIL } from './types';
import type { LegalTexts } from './types';

const UPDATED = 'October 10, 2026';

export const legalEn: LegalTexts = {
  privacy: {
    title: 'Privacy policy',
    updated: UPDATED,
    sections: [
      {
        heading: 'In short',
        paragraphs: [
          'Your documents never leave your device. Vidopdf works on PDFs and pictures inside your browser: there is no server to receive them, and no accounts, analytics, tracking cookies or requests to third parties.',
        ],
      },
      {
        heading: 'Who is responsible',
        paragraphs: [
          `vidotho, the alias the developer uses for this project (see the Legal notice). Contact for any privacy matter: ${CONTACT_EMAIL}.`,
        ],
      },
      {
        heading: 'What happens to your files',
        paragraphs: [
          'The files you choose are read with the browser’s normal features and processed in your computer’s memory, in Web Workers. The result is saved wherever you decide when you press “Save”.',
          'No file is uploaded to a server or kept in the browser between visits: when you close or reload the tab, the workspace is gone. The same goes for the passwords you type, signature pictures and form values: they live only in the tab’s memory and are not stored. Because we never receive the content of your documents, we do not process it as personal data.',
        ],
      },
      {
        heading: 'What your browser keeps',
        paragraphs: [
          'Vidopdf uses no cookies. It only stores two preferences you choose in your browser’s local storage (localStorage): the language and the size of the thumbnails. They stay on your device, they are needed to remember that choice, and you can delete them in your browser settings at any time.',
        ],
      },
      {
        heading: 'Technical data logged by the hosting',
        paragraphs: [
          'The site is served from Vercel Inc., a hosting provider. As with any website, when you load the page the provider receives and may log technical data about the connection: IP address, approximate location derived from the IP (country and city), browser and device type, the page requested, and the date and time.',
          'It is processed to deliver the site, keep it secure and prevent abuse (legitimate interest, Art. 6(1)(f) GDPR). Vercel acts as a processor. The retention period is set by the provider, which says it keeps data for the minimum necessary time and gives no specific period. The owner does not enable the provider’s visitor analytics and does not use this data to build profiles.',
          'If analytics of any kind were ever added, your consent would be asked first and this policy would change.',
        ],
      },
      {
        heading: 'Transfers outside the European Union',
        paragraphs: [
          'Vercel Inc. is based in the United States. According to its own documentation it is certified under the EU-U.S. Data Privacy Framework (and its UK and Swiss extensions), which is the basis for those transfers; for other cases it says it uses standard contractual clauses. This was checked on October 9, 2026, and you can verify it yourself at dataprivacyframework.gov/list.',
        ],
      },
      {
        heading: 'If you write to me',
        paragraphs: [
          `If you email ${CONTACT_EMAIL}, I use your address and message only to reply, and delete them when they are no longer needed. The mailbox is run by Google (Gmail).`,
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          `You can ask for access, rectification, erasure, objection, restriction and portability of your data by writing to ${CONTACT_EMAIL}. Since Vidopdf keeps no data about you beyond what is described here, there will normally be nothing to hand over or delete, and I will tell you so. If you think your data is not handled properly, you can complain to the Spanish Data Protection Agency (aepd.es) or to the supervisory authority in your country.`,
        ],
      },
      {
        heading: 'How to check it',
        paragraphs: [
          'The site’s security policy (CSP) prevents loading anything from other origins. Open your browser’s developer tools, Network tab, and check that no request leaves while you work with your files. The code is open source and the automated tests fail if the site contacts another origin.',
        ],
      },
      {
        heading: 'Children and changes',
        paragraphs: [
          'Vidopdf collects data from nobody, children included. If this policy changes, the date above is updated; the full history is in the repository.',
        ],
      },
    ],
  },

  legal: {
    title: 'Legal notice',
    updated: UPDATED,
    sections: [
      {
        heading: 'Owner',
        paragraphs: [
          `vidotho, the alias the developer uses for this project. Contact email: ${CONTACT_EMAIL}.`,
          'Vidopdf is a personal portfolio project: free, ad-free, with no income and no economic activity. That is why it is identified by the developer’s alias. If it ever earned income or was offered as an economic activity, the provider would be fully identified with everything Spanish Law 34/2002 (LSSI-CE) requires. If a competent authority or a person with a legitimate interest needs to know who is behind it, they can ask by email.',
        ],
      },
      {
        heading: 'Purpose',
        paragraphs: [
          'Vidopdf is a PDF workspace that runs in your browser: it merges, splits, reorders, rotates, crops and compresses PDFs, numbers pages, adds headers, footers and watermarks, edits metadata and bookmarks, adds a visual signature, fills forms, puts a password on a file, and converts pictures to PDF and PDF to pictures, without sending files to any server.',
        ],
      },
      {
        heading: 'Visual signature',
        paragraphs: [
          'The “visual signature” is only a picture placed on the page. It is not an advanced or qualified electronic signature under the eIDAS Regulation and does not by itself carry the evidential value of one. The picture of your signature is not stored or sent anywhere.',
        ],
      },
      {
        heading: 'Intellectual property and trademarks',
        paragraphs: [
          'Vidopdf’s code is free software under the MIT license (© 2026 vidotho). It uses third-party components under their own licenses; they are listed on the Licenses page.',
          '“PDF” is an open standard (ISO 32000) and is used here descriptively. Vidopdf is not affiliated with Adobe or any other company; any names and trademarks mentioned belong to their owners.',
        ],
      },
      {
        heading: 'Protected documents',
        paragraphs: [
          'A password-protected PDF only opens if you type the password yourself; Vidopdf does not guess it, recover it or store it, and offers no way to remove protections.',
          'If the author of a PDF limited what can be done with it (for example copying its content or printing), those restrictions are kept in the new file and cannot be changed from here.',
          'You can protect the resulting file with a password and permissions (AES-256 encryption). If you forget it, there is no way to recover it.',
        ],
      },
      {
        heading: 'Governing law',
        paragraphs: [
          'This site is governed by Spanish law, without prejudice to the rights that the law grants to consumers in their country of residence.',
        ],
      },
    ],
  },

  terms: {
    title: 'Terms of use',
    updated: UPDATED,
    sections: [
      {
        heading: 'Using the service',
        paragraphs: [
          'By using Vidopdf you accept these terms. The service is free and provided “as is” and as available: it may change, have errors or become unavailable without notice.',
        ],
      },
      {
        heading: 'Your documents',
        items: [
          'The watermarks, stamps and signatures you add are your responsibility: you need the right to use what you stamp, and you must not pose as someone else.',
          'You must have the right to use and modify the documents you process, and you are responsible for what you do with them.',
          'Vidopdf never modifies your originals: it creates new files. Even so, always keep a copy of your originals.',
          'Check the result before you use it. Compressing irreversibly lowers the quality of the pictures in the new file, and merging PDFs can lose accessibility tags or internal links. Cropping hides what falls outside the page but does not delete it from the file: do not use it to hide confidential information. XFA forms, and text in scripts other than Latin, Cyrillic or Greek, are not supported in stamps and watermarks. The project’s README lists these limitations.',
        ],
      },
      {
        heading: 'Uses that are not allowed',
        paragraphs: [
          'Do not use Vidopdf to infringe the rights of others or the law, including technological protection measures on protected works.',
        ],
      },
      {
        heading: 'Limitation of liability',
        paragraphs: [
          'To the extent the law allows, the owner is not liable for indirect damages or for loss of data, files or profits arising from use of the service. Nothing here excludes liability for wilful misconduct or gross negligence, or the rights that the law grants to consumers and that cannot be waived.',
        ],
      },
      {
        heading: 'Open source',
        paragraphs: [
          'The code is published under the MIT license, which has its own disclaimer of warranty. These website terms add to that license and do not restrict it.',
        ],
      },
      {
        heading: 'Changes and contact',
        paragraphs: [
          `These terms may change; the date above shows the last revision. Questions or notices: ${CONTACT_EMAIL}. Spanish law applies, without prejudice to the mandatory rights of consumers.`,
        ],
      },
    ],
  },
};
