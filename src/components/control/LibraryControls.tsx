import { useState } from 'react';
import PeopleLibrary from './PeopleLibrary';
import PresetControls from './PresetControls';

type LibrarySection = 'presets' | 'people';

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
          Saved graphics
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
      </div>
      {section === 'presets' ? <PresetControls /> : <PeopleLibrary />}
    </div>
  );
}
