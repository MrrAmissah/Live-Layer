import type { TemplateDefinition } from '../../types/graphics';
import PreacherLowerThird from './PreacherLowerThird';
import ScriptureCard from './ScriptureCard';
import AnnouncementBanner from './AnnouncementBanner';

export const templateRegistry: TemplateDefinition[] = [
  {
    id: 'preacher-lower-third',
    name: 'Preacher Lower Third',
    category: 'Lower Third',
    description: 'Broadcast lower third with speaker name, role, organization, and a brand medallion.',
    fields: [
      { id: 'name', label: 'Name', type: 'text', placeholder: 'Speaker name' },
      { id: 'title', label: 'Title', type: 'text', placeholder: 'Title or role' },
      { id: 'subtitle', label: 'Subtitle / church', type: 'text', placeholder: 'Church or organization' },
      { id: 'logoUrl', label: 'Logo URL', type: 'url', placeholder: 'Optional logo URL', optional: true }
    ],
    defaultValues: {
      name: 'Anna Grace',
      title: 'Lead Pastor',
      subtitle: 'Grace Harbor Church',
      logoUrl: ''
    },
    theme: {
      primaryColor: '#f8fafc',
      accentColor: '#0E7C86',
      backgroundColor: 'transparent',
      accent2Color: '#E8B93C'
    },
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'scripture-card',
    name: 'Scripture Card',
    category: 'Card',
    description: 'A scripture card with reference, verse text, translation label, and optional theme title.',
    fields: [
      { id: 'reference', label: 'Reference', type: 'text', placeholder: 'John 3:16' },
      { id: 'verseText', label: 'Verse text', type: 'textarea', placeholder: 'Type or paste scripture text', rows: 4 },
      { id: 'translationLabel', label: 'Translation label', type: 'text', placeholder: 'ESV, NIV, MSG, etc.' },
      { id: 'themeTitle', label: 'Optional theme title', type: 'text', placeholder: 'Theme title', optional: true }
    ],
    defaultValues: {
      reference: 'Psalm 23:1-2',
      verseText: 'Yahweh is my shepherd: I shall lack nothing. He makes me lie down in green pastures.',
      translationLabel: 'WEB',
      themeTitle: 'Scripture'
    },
    theme: {
      primaryColor: '#f8fafc',
      accentColor: '#fbbf24',
      backgroundColor: 'transparent'
    },
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'announcement-banner',
    name: 'Announcement Banner',
    category: 'Banner',
    description: 'A bold event announcement banner with headline, body, date & time, and CTA.',
    fields: [
      { id: 'headline', label: 'Headline', type: 'text', placeholder: 'Big announcement title' },
      { id: 'body', label: 'Body', type: 'textarea', placeholder: 'Details or supporting copy', rows: 4 },
      { id: 'dateTime', label: 'Date / Time', type: 'text', placeholder: 'Sat • 7:00 PM' },
      { id: 'callToAction', label: 'Call to action', type: 'text', placeholder: 'Learn more at example.com', optional: true }
    ],
    defaultValues: {
      headline: 'Weekend Service Tonight',
      body: 'Join us in person or online for worship, community updates, and a powerful message.',
      dateTime: 'Sunday • 10:30 AM',
      callToAction: 'Visit the info desk after the service.'
    },
    theme: {
      primaryColor: '#f8fafc',
      accentColor: '#06b6d4',
      backgroundColor: 'transparent'
    },
    animation: { in: 'slide', out: 'slide' }
  }
];

export const templateRendererMap: Record<string, React.ComponentType<{ values: Record<string, string>; theme: TemplateDefinition['theme'] }>> = {
  'preacher-lower-third': PreacherLowerThird,
  'scripture-card': ScriptureCard,
  'announcement-banner': AnnouncementBanner
};
