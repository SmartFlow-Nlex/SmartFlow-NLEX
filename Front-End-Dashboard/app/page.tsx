"use client";

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { User, Lock, Eye, EyeOff, Pause, Play, ArrowRight, ShieldCheck } from "lucide-react";
import { supabase } from '../lib/supabase';
import { logActivity } from "../lib/backend-auth";
import {
  beginSecondStep,
  dropPasswordOnlySession,
  groupKey,
  isFullySignedIn,
  secondStepProblem,
  signInTimedOut,
  submitCode,
  type SecondStep,
} from "../lib/mfa";
import TitleReveal from '../components/stage/TitleReveal';
import EffectsToggle from '../components/dashboard/EffectsToggle';
import ThemeToggle from '../components/dashboard/ThemeToggle';
import NlexEnvironment from '../components/environment/NlexEnvironment';

/* Sign-in (redesigned 7 Oct 2026 after the user's reference): the user's own artwork of the mascot
   driving toward the reader (public/light_login.png and dark_login.png), the story on the left above
   the mascot, and a frosted glass sign-in card on the right. Styles: app/styles/nlex-signin.css. */

/* The four sign-in stories. Copy is taken from PRODUCT.md, verbatim from the
   redesign brief; it makes no claim the product does not. A "\n" sets the line
   break, and `accent` is the word set in NLEX blue. */
const STORIES = [
  {
    label: "Forecast",
    title: "Forecast,\nNot Just Live",
    accent: "Live",
    body: "Congestion, incidents, volume and emissions per exit and per hour, up to seven days ahead, with the action to take next.",
  },
  {
    label: "Validation",
    title: "Honest\nValidation",
    accent: "Honest",
    body: "Every model states how it was tested, how it scores against simple baselines, and how its served forecasts compared with what actually happened.",
  },
  {
    label: "Corridor",
    title: "One Corridor,\nOne View",
    accent: "View",
    body: "Live Waze jams, Waze history since 2022, toll volumes, incident logs, weather and events, joined in one warehouse from Balintawak to Sta. Ines.",
  },
  {
    label: "Drivers",
    title: "Connected\nto Drivers",
    accent: "Drivers",
    body: "Operators publish advisories and decide what the companion mobile app shows commuters.",
  },
] as const;

const STORY_MS = 7000;

type Lights = "" | "flash" | "error";

/* Sign-in has two steps (lib/mfa.ts): the password, then a code from the operator's authenticator
   app. An account that has no authenticator yet adds one at the second step instead. */
type Step = { kind: "password" } | SecondStep;

export default function Home() {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Sign in form state
  const [signInUsername, setSignInUsername] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  // Loading and Error States
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // The second step, and the code typed into it.
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [code, setCode] = useState("");
  const [keyCopied, setKeyCopied] = useState(false);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const passwordSent = useRef(false); // a password has been submitted in this visit
  const checking = useRef(false); // a code is being checked right now
  const [stepped, setStepped] = useState(false); // the card has shown a second step at least once

  function goToDashboard() {
    window.location.assign('/dashboard');
  }

  // A session that stopped after the password is never resumed (lib/mfa.ts): a reload, or a
  // bounce back from the dashboard, starts again from the password.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && !isFullySignedIn(data.session) && !passwordSent.current) dropPasswordOnlySession();
    });
  }, []);

  async function handleSignInSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isLoading) return;
    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);
    passwordSent.current = true;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: signInUsername,
        password: signInPassword,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      // The password was right. That opens nothing yet: the code does.
      try {
        const next = await beginSecondStep();
        setStepped(true);
        setCode("");
        setStep(next);
      } catch (err: unknown) {
        dropPasswordOnlySession();
        setErrorMessage(secondStepProblem(err));
      }
      setIsLoading(false);
    } catch (_err: unknown) {
      setErrorMessage("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  }

  /** Back to the password, ending the half-finished sign-in. */
  function backToPassword() {
    dropPasswordOnlySession();
    setErrorMessage("");
    setCode("");
    setSignInPassword("");
    setKeyCopied(false);
    setStep({ kind: "password" });
  }

  async function verifyCode(value: string) {
    if (step.kind === "password" || checking.current) return;
    if (!/^\d{6}$/.test(value)) {
      setErrorMessage("Enter the 6-digit code from your authenticator app.");
      return;
    }
    checking.current = true;
    setErrorMessage("");
    setIsLoading(true);

    try {
      const accessToken = await submitCode(step.factorId, value);
      // The audit log's entries, under the token the code just earned: a first-time setup, then
      // the sign-in itself. Not awaited past a moment: the dashboard opens either way.
      const firstTime = step.kind === "enroll";
      await Promise.race([
        (async () => {
          if (firstTime) await logActivity({ type: "session.authenticator_added" }, accessToken);
          await logActivity({ type: "session.login" }, accessToken);
        })(),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      goToDashboard();
    } catch (err: unknown) {
      checking.current = false;
      setIsLoading(false);
      if (signInTimedOut(err)) backToPassword();
      else setCode("");
      setErrorMessage(secondStepProblem(err));
    }
  }

  function handleCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    void verifyCode(code);
  }

  // Digits only, six at most, and the sixth sends it: nobody should have to reach for a button
  // while a 30-second code is counting down.
  function handleCodeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verifyCode(digits);
  }

  async function copyKey() {
    if (step.kind !== "enroll") return;
    try {
      await navigator.clipboard.writeText(step.secret);
      setKeyCopied(true);
    } catch {
      // No clipboard access: the key is on screen and can be selected by hand.
    }
  }

  // Each step starts in its own first field, and a wrong code returns to the code field. Moving
  // focus by hand matters here: the form that held it has just been replaced.
  useEffect(() => {
    if (isLoading) return;
    if (step.kind !== "password") codeRef.current?.focus();
    else if (stepped) usernameRef.current?.focus();
  }, [step.kind, isLoading, stepped]);

  /* ---- Presentation only: the story timer and the mascot's headlights ---- */

  const [story, setStory] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [holdFocus, setHoldFocus] = useState(false);
  const [holdHover, setHoldHover] = useState(false);
  const [reduced, setReduced] = useState(false);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const goToStory = useCallback((i: number) => {
    elapsedRef.current = 0;
    setStory(((i % STORIES.length) + STORIES.length) % STORIES.length);
  }, []);

  // The stories advance on a 7 s timer, held while a field has focus, the
  // pointer is over the card, the reader paused it, or motion is reduced.
  const held = holdFocus || holdHover || userPaused || reduced;
  useEffect(() => {
    if (held) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsedRef.current += now - last;
      last = now;
      const p = Math.min(1, elapsedRef.current / STORY_MS);
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`;
      if (p >= 1) {
        elapsedRef.current = 0;
        setStory((s) => (s + 1) % STORIES.length);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [held, story]);

  /* The sign-in button drives the mascot's headlights: a flash when it is
     pointed at or focused, a steady pulse while the request is pending, a
     double blink when it fails. */
  const [lights, setLights] = useState<Lights>("");
  const lightsTimer = useRef<number | undefined>(undefined);
  const pulseLights = useCallback((kind: Exclude<Lights, "">) => {
    window.clearTimeout(lightsTimer.current);
    setLights("");
    // A frame apart, so the same pulse can play again straight after itself.
    requestAnimationFrame(() => setLights(kind));
    lightsTimer.current = window.setTimeout(() => setLights(""), kind === "error" ? 1400 : 950);
  }, []);
  useEffect(() => () => window.clearTimeout(lightsTimer.current), []);
  useEffect(() => {
    if (errorMessage) pulseLights("error");
  }, [errorMessage, pulseLights]);
  const flashLights = useCallback(() => pulseLights("flash"), [pulseLights]);

  const current = STORIES[story];

  return (
    <main className="si-shell" data-lights={isLoading ? "pending" : lights || undefined}>
      <NlexEnvironment scene="signin" />

      <header className="si-topbar">
        <section className="si-brand" aria-label="SmartFlow branding">
          <Image
            src="/SMARTFLOW_LOGO_WHITE.png"
            alt="SmartFlow NLEX"
            width={512}
            height={512}
            priority
            unoptimized
            className="brand-logo ds-brand-swap is-light"
          />
          <Image
            src="/logo-dark-bg.png"
            alt=""
            width={512}
            height={512}
            priority
            unoptimized
            className="brand-logo ds-brand-swap is-dark"
          />
          <h1 className="si-wordmark">SmartFlow NLEX</h1>
        </section>

        {/* The same theme control and effects switch as the dashboard's top bar. */}
        <div className="si-topbar-end">
          <EffectsToggle />
          <ThemeToggle />
        </div>
      </header>

      <section className="si-story" aria-label="About SmartFlow">
        <div className="si-story-text" key={story}>
          <TitleReveal as="h2" text={current.title} accent={current.accent} className="si-story-title" />
          <p className="si-story-body">{current.body}</p>
        </div>
        {/* The stories: one dash each, the current one filling over its 7 s, and a pause. */}
        <nav className="si-tabs" aria-label="Stories">
          {STORIES.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={`si-tab${i === story ? " is-current" : ""}${i < story ? " is-done" : ""}`}
              aria-label={`Story ${i + 1} of ${STORIES.length}: ${s.title.replace("\n", " ")}`}
              aria-current={i === story ? "true" : undefined}
              onClick={() => goToStory(i)}
            >
              <span className="si-tab-track" aria-hidden="true">
                <span ref={i === story ? fillRef : undefined} className="si-tab-fill" />
              </span>
            </button>
          ))}
          {!reduced && (
            <button
              type="button"
              className="si-story-pause"
              aria-label={userPaused ? "Play stories" : "Pause stories"}
              aria-pressed={userPaused}
              onClick={() => setUserPaused((p) => !p)}
            >
              {userPaused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
            </button>
          )}
        </nav>
      </section>

      <section
        className="login-panel"
        aria-labelledby="si-card-title"
        onPointerEnter={() => setHoldHover(true)}
        onPointerLeave={() => setHoldHover(false)}
      >
        <div className="login-card" data-stepped={stepped ? "" : undefined}>
          <div className="login-card-head">
            <span className="login-accent" aria-hidden="true" />
            {step.kind !== "password" && (
              <button type="button" className="si-link" onClick={backToPassword} disabled={isLoading}>
                Use a different account
              </button>
            )}
          </div>

          <h2 id="si-card-title">
            {step.kind === "password" ? "Sign In to Dashboard" : step.kind === "enroll" ? "Set Up Authenticator" : "Enter Your Code"}
          </h2>

          {step.kind === "password" ? (
          <form
            onSubmit={handleSignInSubmit}
            className="login-form"
            onFocus={() => setHoldFocus(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoldFocus(false); }}
          >
            {errorMessage && <div className="login-alert danger" role="alert">{errorMessage}</div>}
            {successMessage && <div className="login-alert success" role="status">{successMessage}</div>}

            <label className="field-group">
              <span>Username / Email</span>
              <div className="input-with-icon">
                <User className="input-icon-left" size={20} aria-hidden="true" />
                <input
                  ref={usernameRef}
                  type="text"
                  name="username"
                  autoComplete="username"
                  placeholder="Enter your username or email"
                  value={signInUsername}
                  onChange={(e) => setSignInUsername(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
            </label>

            <label className="field-group">
              <span>Password</span>
              <div className="input-with-icon">
                <Lock className="input-icon-left" size={20} aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="icon-button-right"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </label>

            <div className="login-options">
              <label className="remember-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  disabled={isLoading}
                />
                <span>Remember me</span>
              </label>

              <button type="button" className="forgot-link" disabled={isLoading}>
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              className="submit-button"
              disabled={isLoading}
              onPointerEnter={flashLights}
              onFocus={flashLights}
            >
              <span>{isLoading ? 'Signing In...' : 'Sign In'}</span>
              {isLoading
                ? <i className="submit-spinner" aria-hidden="true" />
                : <ArrowRight className="submit-arrow" size={22} strokeWidth={2} aria-hidden="true" />}
            </button>
          </form>
          ) : (
          <form
            onSubmit={handleCodeSubmit}
            className="login-form mfa-form"
            noValidate
            onFocus={() => setHoldFocus(true)}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoldFocus(false); }}
          >
            {step.kind === "enroll" ? (
              <div className="mfa-setup">
                <div className="mfa-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element -- an SVG data URL from Supabase; next/image has nothing to optimise */}
                  <img src={step.qr} alt="QR code that adds SmartFlow NLEX to your authenticator app" width={148} height={148} />
                </div>
                <p className="mfa-lead">
                  Sign-in now needs a code from your phone. Scan this with an authenticator app, such as
                  Google Authenticator or Microsoft Authenticator, then enter the code it shows.
                </p>
                <div className="mfa-key">
                  <span className="mfa-key-label">Can&rsquo;t scan? Type this key into the app:</span>
                  <button type="button" className="si-link" onClick={copyKey} disabled={isLoading}>
                    {keyCopied ? "Copied" : "Copy key"}
                  </button>
                  <code>{groupKey(step.secret)}</code>
                  <span className="sr-only" role="status">{keyCopied ? "Setup key copied" : ""}</span>
                </div>
              </div>
            ) : (
              <p className="mfa-lead">Open your authenticator app and enter the code it shows for SmartFlow NLEX.</p>
            )}

            {/* The message sits under the field it is about, not above the QR code a screen away. */}
            <div className="mfa-field">
              <label className="field-group">
                <span>Authenticator code</span>
                <div className="input-with-icon">
                  <ShieldCheck className="input-icon-left" size={20} aria-hidden="true" />
                  <input
                    ref={codeRef}
                    className="mfa-code"
                    type="text"
                    name="one-time-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    placeholder="Enter the 6-digit code"
                    value={code}
                    onChange={handleCodeChange}
                    required
                    disabled={isLoading}
                    aria-invalid={errorMessage ? true : undefined}
                    aria-describedby={errorMessage ? "mfa-code-error" : undefined}
                  />
                </div>
              </label>
              {errorMessage && <p id="mfa-code-error" className="mfa-error" role="alert">{errorMessage}</p>}
            </div>

            <button
              type="submit"
              className="submit-button"
              disabled={isLoading}
              onPointerEnter={flashLights}
              onFocus={flashLights}
            >
              <span>{isLoading ? 'Verifying...' : 'Verify'}</span>
              {isLoading
                ? <i className="submit-spinner" aria-hidden="true" />
                : <ArrowRight className="submit-arrow" size={22} strokeWidth={2} aria-hidden="true" />}
            </button>
          </form>
          )}
        </div>

        <p className="copyright">{'©'} 2026 SmartFlow NLEX. All rights reserved.</p>
      </section>
    </main>
  );
}
