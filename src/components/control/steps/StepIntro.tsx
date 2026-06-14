interface StepIntroProps {
  /** Optional step number badge for the main workflow (1/2/3). */
  step?: string;
  title: string;
  hint?: string;
}

/** Plain-language heading for a dock step: big title + one helper sentence. */
export default function StepIntro({ step, title, hint }: StepIntroProps) {
  return (
    <div className="step-intro">
      <h2 className="step-intro__title">
        {step ? <span className="step-intro__num" aria-hidden>{step}</span> : null}
        {title}
      </h2>
      {hint ? <p className="step-intro__hint">{hint}</p> : null}
    </div>
  );
}
