/**
 * One compact line reassuring the operator that the control monitor is a draft,
 * not the live output — editing only changes the preview; the stream changes on
 * Take. Shared by the dock Edit/Live steps and the studio preview panel.
 */
export default function DraftPreviewNote() {
  return (
    <p className="draft-note">
      Editing updates preview only — changes go live when you press Take.
    </p>
  );
}
