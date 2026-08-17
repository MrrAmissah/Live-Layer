import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `/setup` is read by whoever is standing at the desk, which is not always the
 * person who built the rig. Asserted against source because this repo's vitest
 * has no DOM — what is being pinned is that the page still SAYS these things,
 * not how they are laid out.
 */
describe('the pre-service checklist', () => {
  /**
   * Every line of it is a fault that cost this rig real time and gave no
   * warning while it was happening — the graphic looks right on the desk while
   * something downstream quietly is not happening. Those are the only things
   * worth a checklist, and none of them were written down until after they bit.
   */
  const page = readFileSync('src/app/SetupPage.tsx', 'utf8');

  it('names the ordering that matters: relay first, then refresh the sources', () => {
    // A source that loses the relay never reconnects on its own — OBS loads
    // each page once and will not reload it for the rest of the session. Doing
    // these two the other way round leaves every source deaf.
    expect(page).toMatch(/Start the relay first, then refresh the browser sources/);
  });

  it('warns that OBS must be RENDERING or nothing can acknowledge', () => {
    // obs-browser suspends a source whose video is not being rendered, and a
    // suspended page cannot POST. The graphic still goes out; the desk sits on
    // "Not confirmed" forever, which is where a whole afternoon went.
    expect(page).toMatch(/suspends a browser source whose video is not/i);
  });

  it('tells the operator to prove the chain, not just assume it', () => {
    expect(page).toMatch(/watch the pill go green/i);
  });

  it('points at the two places that actually explain a failure', () => {
    // The reason beside a failed Take, and the output's own debug readout.
    expect(page).toMatch(/the reason is printed beside it/i);
    expect(page).toContain('?debug=1');
  });

  it('sits apart from the three SETUP steps', () => {
    // Setup is once per machine; this is once per service. Folding it in as a
    // fourth numbered step would say the wrong thing about both.
    expect(page).toContain('setup-step--check');
    expect(page).not.toMatch(/<Step n=\{4\}/);
  });
});

describe('the microphone is a this-machine feature, and the page says so', () => {
  const page = readFileSync('src/app/SetupPage.tsx', 'utf8');

  it('warns that a second machine cannot use it, with both reasons', () => {
    /**
     * Reported as "microphone not working on relay". Two structural blockers,
     * neither a setting: browsers only expose the microphone on a secure
     * address, so `http://<LAN-IP>` cannot have it; and the recogniser listens
     * on loopback, so a second machine would have nothing to send audio to.
     * The page said nothing about either, so there was no way to know it was
     * never going to work.
     */
    expect(page).toMatch(/not on a second\s+machine/);
    expect(page).toMatch(/secure address/i);
    expect(page).toMatch(/loopback/i);
  });
});
