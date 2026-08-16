import type { TemplateDefinition, TemplateVariant } from '../../types/graphics';
import { DEFAULT_CHURCH_LOGO_URL as BRAND_DEFAULT_CHURCH_LOGO_URL } from '../../lib/brandAssets';
import { PPC_PALETTE } from '../../lib/packs';
import PreacherLowerThird, {
  DEFAULT_VARIANT_ID as L3_FALLBACK_VARIANT,
  logoFallbackForVariant as l3LogoFallback
} from './PreacherLowerThird';
import ScriptureCard, { DEFAULT_VARIANT_ID as SCRIPTURE_FALLBACK_VARIANT } from './ScriptureCard';
import AnnouncementBanner, {
  DEFAULT_VARIANT_ID as ANNOUNCE_FALLBACK_VARIANT,
  logoFallbackForVariant as announceLogoFallback
} from './AnnouncementBanner';
import QuoteCard, { DEFAULT_VARIANT_ID as QUOTE_FALLBACK_VARIANT } from './QuoteCard';
import EventBanner, {
  DEFAULT_VARIANT_ID as EVENT_FALLBACK_VARIANT,
  logoFallbackForVariant as eventLogoFallback
} from './EventBanner';
import SermonTitle, {
  DEFAULT_VARIANT_ID as SERMON_FALLBACK_VARIANT,
  logoFallbackForVariant as sermonLogoFallback
} from './SermonTitle';
import FullscreenMessage, { DEFAULT_VARIANT_ID as FULLSCREEN_FALLBACK_VARIANT } from './FullscreenMessage';

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

const DEFAULT_CHURCH_LOGO_URL = BRAND_DEFAULT_CHURCH_LOGO_URL;

/**
 * Shared lower-third design catalogue. Both lower-third templates reference
 * these objects, so names, descriptions, and signature palettes live once.
 * `palette` is loaded into the draft when a design is selected (store
 * setField), keeping the color controls in step with the look on screen.
 */
const L3_VARIANTS: Record<string, TemplateVariant> = {
  'modern-minimal': {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    description: 'Slim black glass plate with a gold edge accent.',
    palette: { colorBrand: '#1230c4', colorAccent: '#E8B93C', colorSurface: '#f8fafc', colorText: '#081052', colorSecondary: '#07106a' }
  },
  'angled-accent': {
    id: 'angled-accent',
    name: 'Angled Accent',
    description: 'Dark broadcast bar with bold angled end caps.',
    palette: { colorBrand: '#0d2095', colorAccent: '#E8B93C', colorSurface: '#0b1120', colorText: '#f8fafc', colorSecondary: '#131c2e' }
  },
  'signature-medallion': {
    id: 'signature-medallion',
    name: 'Logo Medallion',
    description: 'Brand seal, angled nameplate, and strong church ID.',
    palette: { colorBrand: '#0d2095', colorAccent: '#E8B93C', colorSurface: '#f8fafc', colorText: '#081052', colorSecondary: '#07106a' }
  },
  'clean-broadcast': {
    id: 'clean-broadcast',
    name: 'Clean Broadcast',
    description: 'Bright network-style strip for camera-heavy scenes.',
    palette: { colorBrand: '#1284ff', colorAccent: '#0d2095', colorSurface: '#ffffff', colorText: '#07111f', colorSecondary: '#334155' }
  },
  'bold-plate': {
    id: 'bold-plate',
    name: 'Bold Plate',
    description: 'Heavy title plate with strong icon block energy.',
    palette: { colorBrand: '#07111f', colorAccent: '#E8B93C', colorSurface: '#0d1626', colorText: '#f8fafc', colorSecondary: '#1f2a3d' }
  },
  'split-bar': {
    id: 'split-bar',
    name: 'Split Bar',
    description: 'Deep bar with a premium accent slab on the right.',
    palette: { colorBrand: '#0f766e', colorAccent: '#f7cf27', colorSurface: '#e7fdf6', colorText: '#f8fafc', colorSecondary: '#115e59' }
  },
  'event-style': {
    id: 'event-style',
    name: 'Event Style',
    description: 'Conference-ready teal bar with a round brand mark.',
    palette: { colorBrand: '#0d9488', colorAccent: '#E8B93C', colorSurface: '#0b3b36', colorText: '#f0fdfa', colorSecondary: '#134e4a' }
  },
  'subtle-elegance': {
    id: 'subtle-elegance',
    name: 'Subtle Elegance',
    description: 'Quiet framed plate with refined gold detailing.',
    palette: { colorBrand: '#111c33', colorAccent: '#d8b452', colorSurface: '#0e1526', colorText: '#f3f4f6', colorSecondary: '#1d2a44' }
  },
  'canva-host-bar': {
    id: 'canva-host-bar',
    name: 'Host Bar',
    description: 'Canva-inspired maroon and gold hosted service lower third.',
    palette: { colorBrand: '#6d1f2c', colorAccent: '#E8B93C', colorSurface: '#4a1017', colorText: '#fdf3e3', colorSecondary: '#8a2939' }
  },
  'canva-celebration': {
    id: 'canva-celebration',
    name: 'Celebration Strip',
    description: 'Teal event-style strip with circular logo anchor and gold accents.',
    palette: { colorBrand: '#0d9488', colorAccent: '#E8B93C', colorSurface: '#f8fafc', colorText: '#062f2b', colorSecondary: '#0f766e' }
  },
  'canva-ministry': {
    id: 'canva-ministry',
    name: 'Ministry Band',
    description: 'Warm broadcast band with deep texture, gold rails, and medallion lockup.',
    palette: { colorBrand: '#5b3209', colorAccent: '#E8B93C', colorSurface: '#2f1906', colorText: '#fdf3e3', colorSecondary: '#7c4a12' }
  },
  'soft-broadcast': {
    id: 'soft-broadcast',
    name: 'Soft Broadcast',
    description: 'Rounded blue-glass lower third with a clean logo seal and soft modern edges.',
    palette: { colorBrand: '#1284ff', colorAccent: '#E8B93C', colorSurface: '#0b2a6b', colorText: '#f8fafc', colorSecondary: '#123f9e' }
  },
  'convention-strap': {
    id: 'convention-strap',
    name: 'Convention Strap',
    description: 'Full-bleed royal gradient strap with the event logo anchored at the left.',
    palette: { ...PPC_PALETTE }
  },
  'performer-pill': {
    id: 'performer-pill',
    name: 'Stage Pill',
    description: 'Rounded gradient pill with a logo seal and a performance chip.',
    palette: { ...PPC_PALETTE }
  },
  'performer-note': {
    id: 'performer-note',
    name: 'Praise Tag',
    description: 'Dark glass nameplate with a floating gold performance tag.',
    palette: { colorBrand: '#2338dd', colorAccent: '#E8B93C', colorSurface: '#0a1130', colorText: '#ffffff', colorSecondary: '#9db1ff' }
  },
  /**
   * Type only — the plate lives in OBS, not here.
   *
   * The convention's lower-third BACKGROUND is now a Nine3 asset: an image
   * source sitting UNDER this output, carrying the textured ground, the
   * L-bracket and the theme in gold leaf. Every other variant paints its own
   * plate, so on top of that strap they stack — an opaque card inside a card,
   * the same fault the scripture split screens already had.
   *
   * So this one paints NOTHING. No background, no border, no bracket, no
   * medallion, no theme line. It positions type inside the strap's name zone
   * and stops.
   *
   * Additive: the other thirteen are untouched, and this is only correct when
   * the strap PNG is actually under it — which is why it says so in its own
   * description rather than being offered as a general-purpose look.
   */
  'strap-type': {
    id: 'strap-type',
    name: 'Strap Type-Only',
    description: 'Name and role with NO plate — for the Nine3 strap image sitting under this output in OBS.',
    palette: { ...PPC_PALETTE }
  }
};

const l3Variants = (...ids: string[]) => ids.map((id) => L3_VARIANTS[id]);

export const templateRegistry: TemplateDefinition[] = [
  {
    id: 'preacher-lower-third',
    name: 'Preacher Lower Third',
    category: 'Lower Third',
    description: 'Broadcast lower third with speaker name, role, organization, and a brand medallion.',
    primaryField: 'name',
    fields: [
      { id: 'name', label: 'Name', type: 'text', placeholder: 'Speaker name', maxLength: 60, recommendedLength: 32 },
      { id: 'title', label: 'Title', type: 'text', placeholder: 'Title or role', maxLength: 60, recommendedLength: 40 },
      { id: 'subtitle', label: 'Subtitle / church', type: 'text', placeholder: 'Church or organization', maxLength: 60, recommendedLength: 44 },
      { id: 'logoUrl', label: 'Logo URL', type: 'url', placeholder: 'Optional logo URL', optional: true }
    ],
    defaultValues: {
      /**
       * The one the operator actually reaches for, so it is what a new graphic
       * starts as. `PreacherLowerThird.DEFAULT_VARIANT_ID` is deliberately NOT
       * changed with it: that is the renderer's fallback for a graphic which
       * stores no variant at all, it is shared with the performer template, and
       * moving it would repaint saved graphics on both.
       */
      variantId: 'modern-minimal',
      name: 'Rev. Ishmael K. Awotwe',
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
    /* Order is the shortlist: the two that get used are the two in front. */
    variants: l3Variants(
      'modern-minimal',
      'soft-broadcast',
      'angled-accent',
      'signature-medallion',
      'clean-broadcast',
      'bold-plate',
      'split-bar',
      'event-style',
      'subtle-elegance',
      'canva-host-bar',
      'canva-celebration',
      'canva-ministry',
      'convention-strap',
      'strap-type'
    ),
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'performer-lower-third',
    name: 'Performer Lower Third',
    category: 'Lower Third',
    description: 'Lower third for choirs, praise and worship teams, and special performances.',
    primaryField: 'name',
    fields: [
      { id: 'name', label: 'Performer / group', type: 'text', placeholder: 'Choir or performer name', maxLength: 60, recommendedLength: 34 },
      { id: 'title', label: 'Performance', type: 'text', placeholder: 'Praise, Worship, Special Song', maxLength: 60, recommendedLength: 34 },
      { id: 'subtitle', label: 'Event / tag', type: 'text', placeholder: 'Event or ministry tag', optional: true, maxLength: 60, recommendedLength: 28 },
      { id: 'logoUrl', label: 'Logo URL', type: 'url', placeholder: 'Optional logo URL', optional: true }
    ],
    // Performances stay up as long as the moment lasts — no auto-hide.
    defaultDurationSeconds: 0,
    defaultValues: {
      variantId: 'performer-pill',
      name: 'Mass Choir',
      title: 'Praise & Worship',
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
    // Shares the lower-third renderer but leads with its own performance
    // designs; a separate template identity keeps performer names, queue
    // entries, and presets their own collection.
    variants: l3Variants(
      'performer-pill',
      'performer-note',
      'convention-strap',
      'split-bar',
      'modern-minimal',
      'soft-broadcast',
      'event-style',
      'canva-celebration'
    ),
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'scripture-card',
    name: 'Scripture Card',
    category: 'Card',
    description: 'A scripture card with reference, verse text, translation label, and optional theme title.',
    primaryField: 'reference',
    fields: [
      { id: 'reference', label: 'Reference', type: 'text', placeholder: 'John 3:16' },
      { id: 'verseText', label: 'Verse text', type: 'textarea', placeholder: 'Type or paste scripture text', rows: 4 },
      { id: 'translationLabel', label: 'Translation label', type: 'text', placeholder: 'ESV, NIV, MSG, etc.' },
      { id: 'themeTitle', label: 'Optional theme title', type: 'text', placeholder: 'Theme title', optional: true }
    ],
    defaultValues: {
      variantId: 'blue-quote-card',
      /**
       * A SINGLE VERSE, not a range.
       *
       * It shipped as `Psalm 23:1-2`, so every operator opening a Scripture
       * Card landed in range mode with an end verse already filled in and had
       * to clear it to quote one verse — which is the ordinary case. The
       * picker was honest all along ("End (optional)"); the default was what
       * made a range feel compulsory.
       *
       * The text moves with it. A reference of one verse over the words of two
       * would put a citation on air that does not match what is under it.
       */
      /**
       * THE SEED IS IN THE DEFAULT TRANSLATION, AND ITS WORDS ARE THAT
       * TRANSLATION'S WORDS.
       *
       * Reported as "I still see WEB" after the default moved to the King
       * James: the picker opened on KJV and a new scripture card still seeded
       * Psalm 23:1 as "Yahweh is my shepherd" labelled WEB, because this seed
       * was written when the WEB was the default and nothing tied the two
       * together.
       *
       * All three move as one. Changing the label without the words would put a
       * citation on air that does not match what is under it — the same fault as
       * the reference/text pairing described above, and worse, because it is the
       * label that tells a viewer which Bible they are reading.
       * `defaultTranslation.test.ts` pins this label to `DEFAULT_TRANSLATION_ID`
       * so the two cannot drift apart again.
       */
      reference: 'Psalm 23:1',
      verseText: 'The LORD is my shepherd; I shall not want.',
      translationLabel: 'KJV',
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
      },
      {
        id: 'reference-runner',
        name: 'Reference Runner',
        description: 'Broadcast scripture runner with a dark reference rail and crisp reading band.'
      },
      {
        id: 'theme-lower',
        name: 'Theme Lower',
        description: 'Wide scripture lower band with a pill reference label and textured blue reading surface.'
      },
      {
        id: 'split-wide',
        name: 'Split — Wide',
        /**
         * For the split-screen scene: camera one side, scripture the other, over a
         * designed background plate that lives in OBS underneath this graphic.
         *
         * Every other scripture variant is a full-width band anchored to the bottom
         * of the frame — over this scene that runs straight across the preacher.
         * These two are confined to the scripture safe box and paint TYPE ONLY:
         * the plate underneath already draws the card, and a second card inside it
         * is the thing that would look wrong.
         *
         * `wide` is for a feed that keeps 16:9 and letterboxes into the left half.
         */
        description: 'Scripture type for the split-screen scene, 16:9 camera left. Paints no card — the OBS plate does.'
      },
      {
        id: 'house-wall',
        name: 'House Wall',
        description: 'Full-frame verse for the venue projectors and LED wall — no card, read at distance.'
      },
      {
        id: 'split-tall',
        name: 'Split — Tall',
        /** For a feed cropped to a vertical slot — tight shots framed on the preacher. */
        description: 'Scripture type for the split-screen scene, cropped vertical camera left. Paints no card — the OBS plate does.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'announcement-banner',
    name: 'Announcement Banner',
    category: 'Banner',
    description: 'A bold event announcement banner with headline, body, date & time, and CTA.',
    primaryField: 'headline',
    fields: [
      { id: 'headline', label: 'Headline', type: 'text', placeholder: 'Big announcement title' },
      { id: 'body', label: 'Body', type: 'textarea', placeholder: 'Details or supporting copy', rows: 4 },
      { id: 'dateTime', label: 'Date / Time', type: 'text', placeholder: 'Sat • 7:00 PM' },
      { id: 'logoUrl', label: 'Logo URL', type: 'url', placeholder: 'Optional event logo URL', optional: true }
    ],
    defaultValues: {
      variantId: 'live-tab',
      headline: 'Weekend Service Tonight',
      body: 'Join us in person or online for worship, community updates, and a powerful message.',
      dateTime: 'Sunday • 10:30 AM',
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
        id: 'live-tab',
        name: 'Live Tab',
        description: 'Yellow label tab above the band, with the ornamental corner marks.'
      },
      {
        id: 'info-ribbon',
        name: 'Info Ribbon',
        description: 'White information band with textured blue footer.'
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
      },
      {
        id: 'service-alert',
        name: 'Service Alert',
        description: 'High-contrast alert band with a strong date slab and live-news pacing.'
      },
      {
        id: 'convention-ticker',
        name: 'Convention Ticker',
        description: 'Slim full-bleed royal ticker with the event logo anchored at the left edge.'
      },
      {
        id: 'communion-strip',
        name: 'Communion Strip',
        description: 'Compact service strip with a round seal, deep title bar, and teal support rail.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'quote-card',
    name: 'Quote Card',
    category: 'Card',
    description: 'Editorial quote card for sermon excerpts, reflections, and teaching moments.',
    primaryField: 'sourceName',
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
      },
      {
        id: 'teaching-note',
        name: 'Teaching Note',
        description: 'Bright teaching-card layout with a blue label rail and gold underline.'
      },
      {
        id: 'devotional-blue',
        name: 'Devotional Blue',
        description: 'Compact blue devotional card with centered quote and soft paper metadata.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'event-banner',
    name: 'Event Banner',
    category: 'Banner',
    description: 'Bold event banner with title, date/time, location, CTA, and status tag.',
    primaryField: 'eventTitle',
    fields: [
      { id: 'eventTitle', label: 'Event title', type: 'text', placeholder: 'Event or session name' },
      { id: 'dateTime', label: 'Date / Time', type: 'text', placeholder: 'Friday • 7:00 PM' },
      { id: 'location', label: 'Location', type: 'text', placeholder: 'Main Auditorium', optional: true },
      { id: 'callToAction', label: 'Call to action', type: 'text', placeholder: 'Register after service', optional: true },
      { id: 'tag', label: 'Tag / status', type: 'text', placeholder: 'Tonight, Next, Free', optional: true },
      { id: 'logoUrl', label: 'Logo URL', type: 'url', placeholder: 'Optional event logo URL', optional: true }
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
      },
      {
        id: 'venue-runner',
        name: 'Venue Runner',
        description: 'Opaque venue-style lower band with separated status, title, and event details.'
      },
      {
        id: 'convention-bar',
        name: 'Convention Bar',
        description: 'Slim full-bleed royal bar with the event logo, title, and schedule inline.'
      },
      {
        id: 'offering-runner',
        name: 'Offering Runner',
        description: 'Clean lower information bar for giving, live status, and service calls.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  },
  {
    id: 'sermon-title',
    name: 'Sermon Title',
    category: 'Fullscreen',
    description: 'Premium sermon intro card with title, series, scripture, speaker, and date.',
    primaryField: 'speakerName',
    fields: [
      { id: 'sermonTitle', label: 'Sermon title', type: 'text', placeholder: 'Sermon title' },
      { id: 'speakerName', label: 'Speaker name', type: 'text', placeholder: 'Speaker name', optional: true },
      { id: 'churchName', label: 'Church name', type: 'text', placeholder: 'Church or ministry', optional: true },
      { id: 'seriesTitle', label: 'Series title', type: 'text', placeholder: 'Series or theme', optional: true },
      { id: 'scriptureReference', label: 'Scripture reference', type: 'text', placeholder: 'Romans 8:28', optional: true },
      { id: 'date', label: 'Date', type: 'text', placeholder: '{{date}}', optional: true },
      { id: 'logoUrl', label: 'Logo URL', type: 'url', placeholder: 'Optional event/church logo URL', optional: true }
    ],
    defaultValues: {
      variantId: 'sermon-paper',
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
    variants: [
      {
        id: 'sermon-paper',
        name: 'Sermon Paper',
        description: 'Clean sermon title card with bright paper, scripture chip, and structured footer.'
      },
      {
        id: 'midnight-manifest',
        name: 'Midnight Manifest',
        description: 'Dark blue-gold conference title card with oversized type and luminous frame.'
      },
      {
        id: 'golden-outline',
        name: 'Golden Outline',
        description: 'Minimal dark title frame with gold border, quiet metadata, and premium spacing.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  },
  {
    /**
     * KEEP. Reviewed 13 Aug 2026 against the "fix or retire" question.
     *
     * It overlaps the pre-rendered OBS package — `hold-brb`, `hold-starting`,
     * `hold-stand`, `hold-thanks` are full-screen holds already built to the
     * house system and already sitting in OBS as media sources, and they look
     * better than this does. For a PLANNED hold, use those.
     *
     * What they cannot do is carry a sentence nobody wrote in advance.
     * "Service resumes at 7:45", "the bus for Abodom leaves at 9" — an
     * unplanned full-screen message is the one thing a live tool is for and
     * the one thing fixed artwork cannot supply.
     *
     * And retiring it is not free: a stored `templateId` that stops resolving
     * is a rundown item that cannot air. `OutputPage` answers an unknown
     * template with OUTPUT_FAILED and a transparent screen, so every saved
     * preset, Recent entry and rundown item naming this would go dead — with
     * no migration target, because no other template renders full frame.
     *
     * If it is ever retired, it needs a mapping for all three variant ids, not
     * a delete. Six days before a convention is not when to do that.
     */
    id: 'fullscreen-message',
    name: 'Fullscreen Message',
    category: 'Fullscreen',
    description: 'Readable full-screen service message for welcome, prayer, pause, and next-step moments.',
    primaryField: 'headline',
    fields: [
      { id: 'headline', label: 'Headline', type: 'text', placeholder: 'Welcome' },
      { id: 'body', label: 'Body', type: 'textarea', placeholder: 'Short supporting message', rows: 4, optional: true },
      { id: 'footerNote', label: 'Footer note', type: 'text', placeholder: 'Service starts soon', optional: true },
      { id: 'callToAction', label: 'Call to action', type: 'text', placeholder: 'Connect with us', optional: true }
    ],
    defaultValues: {
      variantId: 'welcome-field',
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
    variants: [
      {
        id: 'welcome-field',
        name: 'Welcome Field',
        description: 'Full-screen welcome card with deep blue texture and a clear service CTA.'
      },
      {
        id: 'be-right-back',
        name: 'Be Right Back',
        description: 'Centered pause screen with calm dark glass, gold rails, and roomy copy.'
      },
      {
        id: 'prayer-focus',
        name: 'Prayer Focus',
        description: 'Quiet prayer screen with a paper scripture-style card and soft blue frame.'
      }
    ],
    animation: { in: 'slide', out: 'slide' }
  }
];

export const templateRendererMap: Record<string, React.ComponentType<{ values: Record<string, string>; theme: TemplateDefinition['theme'] }>> = {
  'preacher-lower-third': PreacherLowerThird,
  'performer-lower-third': PreacherLowerThird,
  'scripture-card': ScriptureCard,
  'announcement-banner': AnnouncementBanner,
  'quote-card': QuoteCard,
  'event-banner': EventBanner,
  'sermon-title': SermonTitle,
  'fullscreen-message': FullscreenMessage
};

/**
 * The variant each template's RENDERER paints when a graphic names none —
 * imported from the renderers themselves, so this can't drift from what is on
 * screen. It is keyed by template rather than by renderer because
 * `performer-lower-third` shares the lower-third renderer: a performer graphic
 * that stores no variant really does fall back to the preacher's
 * `signature-medallion`, not to its own `defaultValues.variantId`. Anything
 * describing what a graphic looks like has to read this rather than the
 * registry default. Keep it in step with `templateRendererMap` above.
 */
export const templateFallbackVariant: Record<string, string> = {
  'preacher-lower-third': L3_FALLBACK_VARIANT,
  'performer-lower-third': L3_FALLBACK_VARIANT,
  'scripture-card': SCRIPTURE_FALLBACK_VARIANT,
  'announcement-banner': ANNOUNCE_FALLBACK_VARIANT,
  'quote-card': QUOTE_FALLBACK_VARIANT,
  'event-banner': EVENT_FALLBACK_VARIANT,
  'sermon-title': SERMON_FALLBACK_VARIANT,
  'fullscreen-message': FULLSCREEN_FALLBACK_VARIANT
};

/**
 * The logo each template's RENDERER paints when the graphic names none, per
 * variant — imported from the renderers, so no URL literal is repeated outside
 * the component that draws it. Keyed by template because both lower thirds share
 * one renderer, and absent for templates that draw no logo in any design.
 *
 * Anything describing what a graphic looks like has to consult this: without it
 * a cleared logo reads as "removed" while Preview and Program still paint the
 * house mark. Keep in step with `templateRendererMap`.
 */
export const templateLogoFallback: Record<string, (variantId: string | undefined) => string | undefined> = {
  'preacher-lower-third': l3LogoFallback,
  'performer-lower-third': l3LogoFallback,
  'announcement-banner': announceLogoFallback,
  'event-banner': eventLogoFallback,
  'sermon-title': sermonLogoFallback
};
