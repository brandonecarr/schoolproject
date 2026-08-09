// The one-time welcome popup for a school's owner: five quick questions that
// give support and sales real context — who to call, how big the school
// expects to be, where they came from, what they're replacing. Server-
// rendered overlay, plain form, no JS: Save stores the answers, "Skip for
// now" stores nothing, and either one stamps onboardedAt so it never shows
// again.

import { completeOnboarding } from "../actions";

export function OnboardingModal({ schoolName }: { schoolName: string }) {
  return (
    <div className="onboard-scrim" role="dialog" aria-modal="true" aria-label="Welcome to Cohort">
      <div className="onboard-card">
        <div className="eyebrow">Welcome to Cohort</div>
        <h2 className="onboard-title">A minute of setup, then the real work</h2>
        <p className="small muted onboard-sub">
          {schoolName} is live. These five answers help us support you properly — every one is
          optional, and you can change them later in Settings.
        </p>

        <form action={completeOnboarding}>
          <div className="onboard-grid">
            <div>
              <label htmlFor="ob-phone">Phone number</label>
              <input
                id="ob-phone"
                name="contactPhone"
                type="tel"
                autoComplete="tel"
                placeholder="(555) 201-4437"
              />
            </div>
            <div>
              <label htmlFor="ob-estimate">Students this year</label>
              <input
                id="ob-estimate"
                name="studentEstimate"
                type="number"
                min={1}
                max={5000}
                placeholder="12"
              />
            </div>
            <div>
              <label htmlFor="ob-grades">Grades served</label>
              <input id="ob-grades" name="gradesServed" placeholder="K–8" maxLength={60} />
            </div>
            <div>
              <label htmlFor="ob-heard">How did you find Cohort?</label>
              <select id="ob-heard" name="heardFrom" defaultValue="">
                <option value="">—</option>
                <option value="search">Search</option>
                <option value="referral">Another school referred us</option>
                <option value="social">Social media</option>
                <option value="walkthrough">A walkthrough call</option>
                <option value="conference">A conference or event</option>
                <option value="other">Somewhere else</option>
              </select>
            </div>
            <div className="onboard-wide">
              <label htmlFor="ob-tooling">What are you running the school on today?</label>
              <select id="ob-tooling" name="priorTooling" defaultValue="">
                <option value="">—</option>
                <option value="spreadsheets">Spreadsheets</option>
                <option value="paper">Paper and binders</option>
                <option value="another_tool">Another tool</option>
                <option value="nothing">Nothing yet — brand new school</option>
              </select>
            </div>
          </div>

          <div className="onboard-foot">
            <button className="btn ghost" name="skip" value="1" formNoValidate>
              Skip for now
            </button>
            <button className="btn">Save and get started</button>
          </div>
        </form>
      </div>
    </div>
  );
}
