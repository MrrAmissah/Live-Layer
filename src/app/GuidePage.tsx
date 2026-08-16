import { useMemo } from 'react';
import { Icon } from '../lib/icons';
import { CONTROL_WORKSPACES } from '../components/control/StudioNav';
import { TONE_BY_PILL } from '../lib/programStatus';
import { SCRIPTURE_OUTPUT_SCREENS } from '../lib/scriptureOutputs';

/**
 * What the words mean — the page nobody could be handed before.
 *
 * The control surface names five workspaces, eight Program pills and a dozen
 * buttons, and every one of them is obvious once somebody has told you and
 * opaque until they do. A volunteer covering a service could read the whole
 * screen and still not know whether Rundown was a list of what happened or a
 * list of what is about to.
 *
 * ## Derived, not retyped
 *
 * The workspace list comes from `StudioNav`, the status vocabulary from
 * `programStatus.ts`, the screens from `scriptureOutputs.ts`. Only the
 * EXPLANATIONS are written here, because only they have no source. A help page
 * that hand-copies the thing it describes is wrong within a month and wrong in
 * the most damaging way — confidently, in the place someone goes when they are
 * already lost. `programSyncWiring.test.ts` forbids a control component
 * hardcoding the status claims for exactly this reason; reading the record
 * honours that rule rather than dodging it.
 *
 * A test asserts every workspace and every pill has an explanation here, so
 * adding either without a word of English fails in CI instead of on a Sunday.
 *
 * ## Why a page and not a workspace
 *
 * The left nav is places you WORK. This is what things mean, so it sits beside
 * Setup on the top bar. It is also the reason it is a top-level route: a
 * `/control/*` child would have to be added to the workspace list, and this is
 * not one.
 */

/** Plain English for each workspace, keyed by the nav's own label. */
const WORKSPACE_HELP: Record<string, { one: string; more: string }> = {
  Studio: {
    one: 'Where you build a graphic and put it on air.',
    more: 'Pick a template on the left, type into it in the middle, watch the preview. Nothing you type here reaches the stream — the preview is a rehearsal. It goes out when you press Take live, and not before.'
  },
  Scripture: {
    one: 'Find a passage and load it into the graphic.',
    more: 'Type a reference, or tap book → chapter → verse. Look up fetches the words; “Set as current graphic” puts them on the card waiting in Studio. Still nothing on air until Take. If a recogniser is running on this machine it can also listen and suggest references, and you review every one.'
  },
  Rundown: {
    one: 'The running order for the service, prepared in advance.',
    more: 'A list of finished graphics in the order you will need them — the speaker for the first session, the offering announcement, the closing verse. Build it on Saturday, and on Sunday you press Take down the list instead of typing under pressure. While a rundown is active, Take fires the SELECTED ROW, not whatever is in Studio; that is the one thing about it worth remembering.'
  },
  Library: {
    one: 'Everything you have kept, so you never type it twice.',
    more: 'Saved graphics, the people who speak regularly with their photos and titles, uploaded logos, and your saved rundowns. It is also where a rundown is exported as a .livelayerpack file and imported again — which is how work moves to another machine, since none of it travels on its own.'
  },
  Screens: {
    one: 'Every OBS browser source, and whether it is really working.',
    more: 'One row per screen with the exact address to paste into OBS, a live preview of what that screen is showing right now, and whether it has reported back. If a graphic is not appearing, this is the page that tells you which source stopped answering rather than leaving you to guess.'
  }
};

/**
 * What each Program word means, keyed by the pill `programStatus.ts` owns.
 *
 * These are the words most likely to be misread under pressure — three of them
 * look like failures and are not, and one looks like success and is not.
 */
const PILL_HELP: Record<keyof typeof TONE_BY_PILL, string> = {
  'NO GRAPHIC': 'Nothing is on air. The output is transparent and OBS is showing only your camera.',
  SENT: 'The graphic went out and no screen has confirmed it yet. Normal for a moment; if it stays here, a screen is not listening.',
  'OUTPUT READY': 'A screen received the graphic and drew it. The page is right — whether the viewer sees it depends on OBS.',
  'OUTPUT ACTIVE': 'An OBS source is compositing the page right now. This is the closest thing to “it is on the stream”.',
  'SOURCE HIDDEN': 'The page is fine and the OBS source has its eye turned off. Nobody is seeing it. Check the scene, not LiveLayer.',
  'SOURCE INACTIVE': 'The page is fine and its OBS scene is not the one on program. Switch scenes and it appears.',
  UNVERIFIED: 'A screen has gone quiet for too long to speak for it. Usually OBS was closed or the source was removed.',
  FAILED: 'It did not get out. The commonest cause by far is a relay address configured with nothing running at it — /setup will say so.'
};

/** The buttons worth explaining, in the order an operator meets them. */
const ACTIONS: { name: string; what: string }[] = [
  {
    name: 'Take live',
    what: 'Puts the graphic on air. The only button that does. Everything else — typing, previewing, looking up a verse, queueing — changes what WOULD go out.'
  },
  {
    name: 'Clear graphic',
    what: 'Takes it off again. The output goes back to transparent; the graphic stays in Studio so you can send it again.'
  },
  {
    name: 'Auto-hide',
    what: 'Off, 3s, 6s, 10s, 15s. The graphic removes itself after that long. Off means it stays until you clear it — right for a scripture card being read, wrong for a name.'
  },
  {
    name: 'The eye on a field',
    what: 'Leaves a line off the graphic without deleting what is in it. A speaker with no title, this once, without retyping the title next week.'
  },
  {
    name: 'Set as current graphic',
    what: 'In Scripture: loads the passage into the card waiting in Studio. It replaces what is there. Still nothing on air.'
  },
  {
    name: 'Add to queue',
    what: 'Parks a graphic in the quick queue rail so it is one press away, without disturbing what is in Studio. For the thing you know is coming in five minutes.'
  },
  {
    name: 'Add to rundown',
    what: 'Puts it in the prepared running order instead of the queue — that is the difference: the queue is for today, the rundown is the plan.'
  },
  {
    name: 'Reset draft',
    what: 'Throws away what is in Studio and starts the template fresh. It does not touch anything saved.'
  }
];

const TONE_WORD: Record<string, string> = {
  live: 'green',
  ready: 'blue',
  pending: 'amber',
  attention: 'amber',
  failed: 'red',
  idle: 'grey'
};

export default function GuidePage() {
  const controlUrl = useMemo(() => `${window.location.origin}/control`, []);
  const pills = useMemo(() => Object.entries(TONE_BY_PILL) as [keyof typeof TONE_BY_PILL, string][], []);

  return (
    <div className="control-root">
      <div className="control-inner setup-inner">
        <header className="cmd-bar">
          <div className="cmd-bar__brand">
            <span className="cmd-logo">
              <img className="cmd-logo__mark" src="/livelayer-mark.svg" alt="" aria-hidden="true" />
            </span>
            <span className="cmd-logo__copy">
              <span className="cmd-logo__name">LiveLayer</span>
              <span className="cmd-logo__sub">What everything means</span>
            </span>
          </div>
          <div className="cmd-bar__right">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.open(`${window.location.origin}/setup`, '_self')}>
              Setup
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.open(controlUrl, '_self')}>
              Open control
            </button>
          </div>
        </header>

        <main className="setup-main">
          <div className="setup-head">
            <p className="setup-eyebrow">A five-minute read, once</p>
            <h1 className="setup-title">What each part of LiveLayer is for</h1>
            <p className="setup-lead">
              Written for someone covering a service who has not used it before. Nothing here
              changes anything — you can read it with the stream running.
            </p>
          </div>

          {/**
            * The safety rule first, on its own, because it is the one thing that
            * makes the rest safe to explore. Somebody who knows that typing
            * cannot reach the stream will click everything and learn the app;
            * somebody who does not will freeze on every button.
            */}
          <section className="guide-rule">
            <Icon name="broadcast" size={18} />
            <div>
              <h2 className="guide-rule__title">One rule: nothing reaches the stream until you press Take live.</h2>
              <p className="guide-rule__body">
                Typing, previewing, looking up a verse, building a running order — none of it is
                visible to anyone watching. The preview is a rehearsal of what Take would send.
                So click things. You cannot put something on air by accident.
              </p>
            </div>
          </section>

          <section className="guide-section">
            <h2 className="guide-section__title">The five places you work</h2>
            <p className="guide-section__lead">Down the left-hand side of the control screen.</p>
            <div className="guide-cards">
              {CONTROL_WORKSPACES.map((workspace) => {
                const help = WORKSPACE_HELP[workspace.label];
                return (
                  <article key={workspace.to} className="guide-card">
                    <h3 className="guide-card__title">
                      <Icon name={workspace.icon} size={16} />
                      {workspace.label}
                    </h3>
                    <p className="guide-card__one">{help?.one}</p>
                    <p className="guide-card__more">{help?.more}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="guide-section">
            <h2 className="guide-section__title">The buttons that matter</h2>
            <dl className="guide-defs">
              {ACTIONS.map((action) => (
                <div key={action.name} className="guide-def">
                  <dt className="guide-def__term">{action.name}</dt>
                  <dd className="guide-def__desc">{action.what}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="guide-section">
            <h2 className="guide-section__title">What the status word is telling you</h2>
            <p className="guide-section__lead">
              Top right of the control screen, above Take. It describes what LiveLayer actually
              knows — which is deliberately less than “it is on the stream”, because only OBS
              knows that.
            </p>
            <dl className="guide-defs">
              {pills.map(([pill, tone]) => (
                <div key={pill} className="guide-def">
                  <dt className="guide-def__term">
                    <span className={`guide-pill guide-pill--${tone}`}>{pill}</span>
                    <span className="guide-def__tone">{TONE_WORD[tone]}</span>
                  </dt>
                  <dd className="guide-def__desc">{PILL_HELP[pill]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="guide-section">
            <h2 className="guide-section__title">Screens, and why there is more than one</h2>
            <p className="guide-section__lead">
              Each OBS browser source declares which screen it is, in its address. Set a verse
              once and every screen shows it its own way, with nothing to switch mid-service.
            </p>
            <dl className="guide-defs">
              {SCRIPTURE_OUTPUT_SCREENS.map((screen) => (
                <div key={screen.id} className="guide-def">
                  <dt className="guide-def__term">
                    <Icon name={screen.icon} size={15} />
                    {screen.name}
                  </dt>
                  <dd className="guide-def__desc">{screen.hint}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="guide-section">
            <h2 className="guide-section__title">Two things that surprise people</h2>
            <dl className="guide-defs">
              <div className="guide-def">
                <dt className="guide-def__term">A rundown changes what Take does</dt>
                <dd className="guide-def__desc">
                  With a rundown active, Take fires the <strong>selected row</strong> — not what is
                  in Studio. That is on purpose: on a service day the running order is the plan and
                  Studio is a scratchpad. If Take seems to be sending the wrong thing, look at
                  which row is selected.
                </dd>
              </div>
              <div className="guide-def">
                <dt className="guide-def__term">Your work does not follow you between machines</dt>
                <dd className="guide-def__desc">
                  Logos, photos, saved graphics, presets and rundowns live in the browser that made
                  them. A different machine — or a different address for the same machine — starts
                  empty. Export a rundown from Library as a <code>.livelayerpack</code> and import
                  it on the other side.
                </dd>
              </div>
            </dl>
          </section>

          <p className="setup-note guide-foot">
            Still stuck? <button type="button" className="btn btn--ghost btn--xs" onClick={() => window.open(`${window.location.origin}/setup`, '_self')}>Setup</button>{' '}
            checks this machine and says what is wrong with it — the origin, the storage, the
            relay, and whether each screen is reporting.
          </p>
        </main>
      </div>
    </div>
  );
}
