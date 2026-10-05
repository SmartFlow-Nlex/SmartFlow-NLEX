"use client";

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { User, Lock, Eye, EyeOff, Activity, TrendingUp, TriangleAlert, Pause, Play } from "lucide-react";
import { supabase } from '../lib/supabase';
import { logActivity } from "../lib/backend-auth";
import { emitStage } from '../components/stage/stage-bus';
import EditorialGrid from '../components/stage/EditorialGrid';
import TitleReveal from '../components/stage/TitleReveal';
import SigninCursor from '../components/stage/SigninCursor';
import EffectsToggle from '../components/dashboard/EffectsToggle';
import ThemeToggle from '../components/dashboard/ThemeToggle';
import NlexEnvironment from '../components/environment/NlexEnvironment';

// Sign-in has no mascot (user request, 6 Oct 2026), so it needs no WebGL stage: the
// background is the NLEX environment, drawn in CSS and SVG.

/* The four sign-in stories. Copy is taken from PRODUCT.md, verbatim from the
   redesign brief; it makes no claim the product does not. */
const STORIES = [
  {
    label: "Forecast",
    title: "Forecast, Not Just Live",
    body: "Congestion, incidents, volume and emissions per exit and per hour, up to seven days ahead, with the action to take next.",
  },
  {
    label: "Validation",
    title: "Honest Validation",
    body: "Every model states how it was tested, how it scores against simple baselines, and how its served forecasts compared with what actually happened.",
  },
  {
    label: "Corridor",
    title: "One Corridor, One View",
    body: "Live Waze jams, Waze history since 2022, toll volumes, incident logs, weather and events, joined in one warehouse from Balintawak to Sta. Ines.",
  },
  {
    label: "Drivers",
    title: "Connected to Drivers",
    body: "Operators publish advisories and decide what the companion mobile app shows commuters.",
  },
] as const;

const STORY_MS = 7000;

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

  function goToDashboard() {
    window.location.assign('/dashboard');
  }

  async function handleSignInSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isLoading) return;
    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);


    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: signInUsername,
        password: signInPassword,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      // The audit log's sign-in entry, under the token just issued. Not awaited past a moment:
      // the dashboard opens either way.
      await Promise.race([logActivity({ type: "session.login" }, data.session?.access_token), new Promise((r) => setTimeout(r, 1500))]);
      goToDashboard();
    } catch (_err: unknown) {
      setErrorMessage("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  }

  /* ---- Presentation only: the story timer and the stage's reactions ---- */

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

  // Tell the stage which story is showing (the wave runs amber to blue).
  useEffect(() => {
    emitStage({ type: "story", index: story, count: STORIES.length });
  }, [story]);

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

  // The sign-in request drives the car: wheels and lights while pending, settle on error.
  useEffect(() => {
    emitStage({ type: "pending", on: isLoading });
  }, [isLoading]);
  useEffect(() => {
    if (errorMessage) emitStage({ type: "error" });
  }, [errorMessage]);

  const flashLights = useCallback(() => emitStage({ type: "flash" }), []);

  const current = STORIES[story];

  return (
    <main className="si-shell">
      <NlexEnvironment scene="hero" />
      <EditorialGrid variant="signin" />
      <SigninCursor />

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
          <div className="brand-copy">
            <h1>SmartFlow <span>NLEX</span></h1>
            <p>Decision-Intelligence System</p>
          </div>
        </section>

        <nav className="si-story-nav" aria-label="Stories">
          {STORIES.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className={i === story ? "is-current" : ""}
              aria-current={i === story ? "true" : undefined}
              onClick={() => goToStory(i)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        {/* The same theme control and effects switch as the dashboard's top bar. */}
        <div className="si-topbar-end">
          <EffectsToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* No mascot on sign-in (6 Oct 2026, user request): the middle row of the grid is open
          space, so the story and the card keep their places. */}

      <section className="si-story" aria-label="About SmartFlow">
        <div className="si-story-text" key={story}>
          <TitleReveal as="h2" text={current.title} className="si-story-title" />
          <p className="si-story-body">{current.body}</p>
        </div>

        <div className="si-story-controls">
          <div className="si-story-dashes" role="group" aria-label="Choose a story">
            {STORIES.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className={`si-dash${i === story ? " is-current" : ""}${i < story ? " is-done" : ""}`}
                aria-label={`Story ${i + 1} of ${STORIES.length}: ${s.title}`}
                aria-current={i === story ? "true" : undefined}
                onClick={() => goToStory(i)}
              >
                <span ref={i === story ? fillRef : undefined} className="si-dash-fill" />
              </button>
            ))}
          </div>
          {!reduced && (
            <button
              type="button"
              className="si-story-pause"
              aria-label={userPaused ? "Play stories" : "Pause stories"}
              aria-pressed={userPaused}
              onClick={() => setUserPaused((p) => !p)}
            >
              {userPaused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
            </button>
          )}
        </div>

        <ul className="brand-points">
          <li><Activity size={15} aria-hidden="true" /> Live corridor status</li>
          <li><TrendingUp size={15} aria-hidden="true" /> Predictive volume</li>
          <li><TriangleAlert size={15} aria-hidden="true" /> Incident intelligence</li>
        </ul>
      </section>

      <section
        className="login-panel"
        aria-label="Sign in form"
        onPointerEnter={() => setHoldHover(true)}
        onPointerLeave={() => setHoldHover(false)}
      >
        <div className="login-card">
              <h2>Sign In to Dashboard</h2>

              <form
                onSubmit={handleSignInSubmit}
                className="login-form"
                onFocus={() => setHoldFocus(true)}
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHoldFocus(false); }}
              >
                {errorMessage && <div className="login-alert danger">{errorMessage}</div>}
                {successMessage && <div className="login-alert success">{successMessage}</div>}

                <label className="field-group">
                  <span>Username / Email</span>
                  <div className="input-with-icon">
                    <User className="input-icon-left" size={18} />
                    <input
                      type="text"
                      name="username"
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
                    <Lock className="input-icon-left" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
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
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
                  <i className="pill-ring" aria-hidden="true" />
                </button>
              </form>
        </div>

        <p className="copyright">{'©'} 2026 SmartFlow NLEX. All rights reserved.</p>
      </section>
    </main>
  );
}
