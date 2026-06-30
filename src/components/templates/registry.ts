import type { TemplateDefinition } from '../../types/graphics';
import PreacherLowerThird from './PreacherLowerThird';
import ScriptureCard from './ScriptureCard';
import AnnouncementBanner from './AnnouncementBanner';
import QuoteCard from './QuoteCard';
import EventBanner from './EventBanner';
import SermonTitle from './SermonTitle';
import FullscreenMessage from './FullscreenMessage';

const HOUSE_BLUE = {
  brand: '#0d2095',
  surface: '#07106a',
  deep: '#081052',
  electric: '#1284ff',
  gold: '#E8B93C',
  yellow: '#ffcf20',
  paper: '#f8fafc',
  ink: '#07111f'
};

const DEFAULT_CHURCH_LOGO_URL = '/default%20logo.png';

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
      variantId: 'signature-medallion',
      name: 'Rev. Ishamel K. Awotwe',
      title: 'Lead Pastor',
      subtitle: 'Mathapoly Church International',
      logoUrl: DEFAULT_CHURCH_LOGO_URL,
      colorBrand: HOUSE_BLUE.brand,
      colorAccent: HOUSE_BLUE.gold,
      colorSurface: HOUSE_BLUE.paper,
      colorText: HOUSE_BLUE.deep,
      colorSecondary: HOUSE_BLUE.surface
    },
    theme: {
      primaryColor: HOUSE_BLUE.paper,
      accentColor: HOUSE_BLUE.brand,
      backgroundColor: 'transparent',
      surfaceColor: HOUSE_BLUE.surface,
      accent2Color: HOUSE_BLUE.gold
    },
    variants: [
      {
        id: 'modern-minimal',
        name: 'Modern Minimal',
        description: 'Slim black glass plate with a gold edge accent.'
      },
      {
        id: 'angled-accent',
        name: 'Angled Accent',
        description: 'Dark broadcast bar with bold angled end caps.'
      },
      {
        id: 'signature-medallion',
        name: 'Logo Medallion',
        description: 'Brand seal, angled nameplate, and strong church ID.'
      },
      {
        id: 'clean-broadcast',
        name: 'Clean Broadcast',
        description: 'Bright network-style strip for camera-heavy scenes.'
      },
      {
        id: 'bold-plate',
        name: 'Bold Plate',
        description: 'Heavy title plate with strong icon block energy.'
      },
      {
        id: 'split-bar',
        name: 'Split Bar',
        description: 'Deep bar with a premium accent slab on the right.'
      },
      {
        id: 'event-style',
        name: 'Event Style',
        description: 'Conference-ready teal bar with a round brand mark.'
      },
      {
        id: 'subtle-elegance',
        name: 'Subtle Elegance',
        description: 'Quiet framed plate with refined gold detailing.'
      }
    ],
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
      variantId: 'blue-quote-card',
      reference: 'Psalm 23:1-2',
      verseText: 'Yahweh is my shepherd: I shall lack nothing. He makes me lie down in green pastures.',
      translationLabel: 'WEB',
      themeTitle: 'Scripture',
      colorBrand: HOUSE_BLUE.brand,
      colorAccent: HOUSE_BLUE.electric,
      colorSurface: HOUSE_BLUE.surface,
      colorText: HOUSE_BLUE.paper,
      colorSecondary: HOUSE_BLUE.deep
    },
    theme: {
      primaryColor: HOUSE_BLUE.paper,
      accentColor: HOUSE_BLUE.electric,
      backgroundColor: 'transparent',
      surfaceColor: HOUSE_BLUE.surface,
      accent2Color: HOUSE_BLUE.gold
    },
    variants: [
      {
        id: 'blue-quote-card',
        name: 'Blue Quote Card',
        description: 'Textured blue scripture card with oversized quote marks.'
      },
      {
        id: 'classic-band',
        name: 'Classic Band',
        description: 'Reference tab over a clean opaque scripture plate.'
      }
    ],
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
      variantId: 'info-ribbon',
      headline: 'Weekend Service Tonight',
      body: 'Join us in person or online for worship, community updates, and a powerful message.',
      dateTime: 'Sunday • 10:30 AM',
      callToAction: 'Visit the info desk after the service.',
      colorBrand: HOUSE_BLUE.brand,
      colorAccent: HOUSE_BLUE.yellow,
      colorSurface: HOUSE_BLUE.paper,
      colorText: HOUSE_BLUE.ink,
      colorSecondary: HOUSE_BLUE.surface
    },
    theme: {
      primaryColor: HOUSE_BLUE.paper,
      accentColor: HOUSE_BLUE.brand,
      backgroundColor: 'transparent',
      surfaceColor: HOUSE_BLUE.paper,
      accent2Color: HOUSE_BLUE.yellow
    },
    variants: [
      {
        id: 'info-ribbon',
        name: 'Info Ribbon',
        description: 'White information band with textured blue footer.'
      },
      {
        id: 'live-tab',
        name: 'Live Tab',
        description: 'Top label tab, ornamental corner marks, and info footer.'
      },
      {
        id: 'plain-pattern',
        name: 'Plain Pattern',
        description: 'Minimal white message panel with decorative right marks.'
      },
      {
        id: 'tag-strip',
        name: 'Tag Strip',
        description: 'Compact label tab with a clean white content bar.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'quote-card',
    name: 'Quote Card',
    category: 'Card',
    description: 'Editorial quote card for sermon excerpts, reflections, and teaching moments.',
    fields: [
      { id: 'quoteText', label: 'Quote text', type: 'textarea', placeholder: 'Type the quote or key thought', rows: 5 },
      { id: 'sourceName', label: 'Source name', type: 'text', placeholder: 'Speaker or source', optional: true },
      { id: 'sourceRole', label: 'Source role', type: 'text', placeholder: 'Role, book, or context', optional: true },
      { id: 'themeTitle', label: 'Theme title', type: 'text', placeholder: 'Quote, Reflection, Key thought', optional: true },
      { id: 'translationLabel', label: 'Small label', type: 'text', placeholder: 'Optional label', optional: true }
    ],
    defaultValues: {
      variantId: 'quote-gradient',
      quoteText: 'Faith is not the absence of questions; it is the courage to keep walking with God through them.',
      sourceName: 'Pastor Anna Grace',
      sourceRole: 'Sunday Message',
      themeTitle: 'Key Thought',
      translationLabel: '',
      colorBrand: HOUSE_BLUE.brand,
      colorAccent: HOUSE_BLUE.electric,
      colorSurface: HOUSE_BLUE.surface,
      colorText: HOUSE_BLUE.paper,
      colorSecondary: HOUSE_BLUE.deep
    },
    theme: {
      primaryColor: HOUSE_BLUE.paper,
      accentColor: HOUSE_BLUE.electric,
      backgroundColor: 'transparent',
      surfaceColor: HOUSE_BLUE.surface,
      accent2Color: HOUSE_BLUE.electric
    },
    variants: [
      {
        id: 'quote-gradient',
        name: 'Gradient Quote',
        description: 'Deep textured blue card with oversized quote marks.'
      },
      {
        id: 'editorial-paper',
        name: 'Editorial Paper',
        description: 'Clean paper quote card with brand rail and source lockup.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'event-banner',
    name: 'Event Banner',
    category: 'Banner',
    description: 'Bold event banner with title, date/time, location, CTA, and status tag.',
    fields: [
      { id: 'eventTitle', label: 'Event title', type: 'text', placeholder: 'Event or session name' },
      { id: 'dateTime', label: 'Date / Time', type: 'text', placeholder: 'Friday • 7:00 PM' },
      { id: 'location', label: 'Location', type: 'text', placeholder: 'Main Auditorium', optional: true },
      { id: 'callToAction', label: 'Call to action', type: 'text', placeholder: 'Register after service', optional: true },
      { id: 'tag', label: 'Tag / status', type: 'text', placeholder: 'Tonight, Next, Free', optional: true }
    ],
    defaultValues: {
      variantId: 'festival-stage',
      eventTitle: 'Zonal Music Festival',
      dateTime: 'Mallam Choir',
      location: '',
      callToAction: 'Revitalising our allegiance to God through music.',
      tag: 'Performing Now',
      colorBrand: HOUSE_BLUE.brand,
      colorAccent: HOUSE_BLUE.yellow,
      colorSurface: HOUSE_BLUE.paper,
      colorText: HOUSE_BLUE.paper,
      colorSecondary: HOUSE_BLUE.electric
    },
    theme: {
      primaryColor: HOUSE_BLUE.paper,
      accentColor: HOUSE_BLUE.brand,
      backgroundColor: 'transparent',
      surfaceColor: HOUSE_BLUE.surface,
      accent2Color: HOUSE_BLUE.yellow
    },
    variants: [
      {
        id: 'festival-stage',
        name: 'Festival Stage',
        description: 'White sponsor block with vivid gradient performer strip.'
      },
      {
        id: 'broadcast-slate',
        name: 'Broadcast Slate',
        description: 'Bold event banner with cut paper schedule plate.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'sermon-title',
    name: 'Sermon Title',
    category: 'Fullscreen',
    description: 'Premium sermon intro card with title, series, scripture, speaker, and date.',
    fields: [
      { id: 'sermonTitle', label: 'Sermon title', type: 'text', placeholder: 'Sermon title' },
      { id: 'speakerName', label: 'Speaker name', type: 'text', placeholder: 'Speaker name', optional: true },
      { id: 'churchName', label: 'Church name', type: 'text', placeholder: 'Church or ministry', optional: true },
      { id: 'seriesTitle', label: 'Series title', type: 'text', placeholder: 'Series or theme', optional: true },
      { id: 'scriptureReference', label: 'Scripture reference', type: 'text', placeholder: 'Romans 8:28', optional: true },
      { id: 'date', label: 'Date', type: 'text', placeholder: '{{date}}', optional: true }
    ],
    defaultValues: {
      sermonTitle: 'Anchored in Hope',
      speakerName: 'Pastor Anna Grace',
      churchName: 'Grace Harbor Church',
      seriesTitle: 'Summer Psalms',
      scriptureReference: 'Psalm 23:1-2',
      date: '{{date}}',
      colorBrand: HOUSE_BLUE.brand,
      colorAccent: HOUSE_BLUE.gold,
      colorSurface: HOUSE_BLUE.surface,
      colorText: HOUSE_BLUE.paper,
      colorSecondary: HOUSE_BLUE.deep
    },
    theme: {
      primaryColor: HOUSE_BLUE.paper,
      accentColor: HOUSE_BLUE.brand,
      backgroundColor: 'transparent',
      surfaceColor: HOUSE_BLUE.surface,
      accent2Color: HOUSE_BLUE.gold
    },
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'fullscreen-message',
    name: 'Fullscreen Message',
    category: 'Fullscreen',
    description: 'Readable full-screen service message for welcome, prayer, pause, and next-step moments.',
    fields: [
      { id: 'headline', label: 'Headline', type: 'text', placeholder: 'Welcome' },
      { id: 'body', label: 'Body', type: 'textarea', placeholder: 'Short supporting message', rows: 4, optional: true },
      { id: 'footerNote', label: 'Footer note', type: 'text', placeholder: 'Service starts soon', optional: true },
      { id: 'callToAction', label: 'Call to action', type: 'text', placeholder: 'Connect with us', optional: true }
    ],
    defaultValues: {
      headline: 'Welcome to Church',
      body: 'We are glad you are here. Take a moment to greet someone near you.',
      footerNote: 'Grace Harbor Church',
      callToAction: 'Service begins at {{time}}',
      colorBrand: HOUSE_BLUE.brand,
      colorAccent: HOUSE_BLUE.gold,
      colorSurface: HOUSE_BLUE.surface,
      colorText: HOUSE_BLUE.paper,
      colorSecondary: HOUSE_BLUE.deep
    },
    theme: {
      primaryColor: HOUSE_BLUE.paper,
      accentColor: HOUSE_BLUE.brand,
      backgroundColor: 'transparent',
      surfaceColor: HOUSE_BLUE.surface,
      accent2Color: HOUSE_BLUE.gold
    },
    animation: { in: 'slide', out: 'slide' }
  }
];

export const templateRendererMap: Record<string, React.ComponentType<{ values: Record<string, string>; theme: TemplateDefinition['theme'] }>> = {
  'preacher-lower-third': PreacherLowerThird,
  'scripture-card': ScriptureCard,
  'announcement-banner': AnnouncementBanner,
  'quote-card': QuoteCard,
  'event-banner': EventBanner,
  'sermon-title': SermonTitle,
  'fullscreen-message': FullscreenMessage
};
