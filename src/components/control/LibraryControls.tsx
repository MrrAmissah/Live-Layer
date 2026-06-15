import { useState } from 'react';
import PeopleLibrary from './PeopleLibrary';
import PresetControls from './PresetControls';
import RundownLibrary from './RundownLibrary';
import ImportPackPreview from './ImportPackPreview';

type LibrarySection = 'presets' | 'people' | 'rundowns' | 'import';

export default function LibraryControls() {
  const [section, setSection] = useState<LibrarySection>('presets');

  return (
    <div className="library">
      <div className="library-tabs" role="tablist" aria-label="Library sections">
        <button
          type="button"
          className={`library-tab ${section === 'presets' ? 'library-tab--active' : ''}`}
          onClick={() => setSection('presets')}
          role="tab"
          aria-selected={section === 'presets'}
        >
          Graphics
        </button>
        <button
          type="button"
          className={`library-tab ${section === 'people' ? 'library-tab--active' : ''}`}
          onClick={() => setSection('people')}
          role="tab"
          aria-selected={section === 'people'}
        >
          People
        </button>
        <button
          type="button"
          className={`library-tab ${section === 'rundowns' ? 'library-tab--active' : ''}`}
          onClick={() => setSection('rundowns')}
          role="tab"
          aria-selected={section === 'rundowns'}
        >
          Rundowns
        </button>
        <button
          type="button"
          className={`library-tab ${section === 'import' ? 'library-tab--active' : ''}`}
          onClick={() => setSection('import')}
          role="tab"
          aria-selected={section === 'import'}
        >
          Import
        </button>
      </div>
      {section === 'presets' ? <PresetControls /> : null}
      {section === 'people' ? <PeopleLibrary /> : null}
      {section === 'rundowns' ? <RundownLibrary /> : null}
      {section === 'import' ? <ImportPackPreview /> : null}
    </div>
  );
}
