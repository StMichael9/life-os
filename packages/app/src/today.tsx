'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowUpRight,
  Compass,
  Cross,
  Globe2,
  Layers3,
  ShieldCheck,
  Sun,
  Target,
} from 'lucide-react';
import { dailyContent } from '@life-os/shared';
import type { Season } from '@life-os/shared';
import { TodaySeason } from './today-season';
import { Button, Eyebrow, Panel } from '@life-os/ui';

function subscribeClock(onChange: () => void) {
  const timer = setInterval(onChange, 1000);
  return () => clearInterval(timer);
}
const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
const serverSnapshot = () => null;
const zones = [
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

export function Today({
  initialSeason = null,
  accountId,
  seasonUnavailable = false,
}: {
  initialSeason?: Season | null;
  accountId?: string | undefined;
  seasonUnavailable?: boolean;
}) {
  const minute = useSyncExternalStore(subscribeClock, minuteSnapshot, serverSnapshot);
  const [zone, setZone] = useState('device');
  const settings = useRef<HTMLDialogElement>(null);
  const timeZone = zone === 'device' ? Intl.DateTimeFormat().resolvedOptions().timeZone : zone;
  const now = minute === null ? null : new Date(minute * 60_000);
  const content = now ? dailyContent(now, timeZone) : null;
  const dateLabel = now
    ? new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }).format(now)
    : 'A little space for today';

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Life OS">
        <a className="brand" href="#main" aria-label="Life OS home">
          <span className="brand-mark">
            L<span>·</span>
          </span>
          <span>
            LIFE <strong>OS</strong>
          </span>
        </a>
        <div className="workspace-label">
          <span className="status-dot" /> Personal workspace
        </div>
        <nav aria-label="Main navigation">
          <a className="nav-link" href="/inbox">
            <Layers3 size={18} /> Inbox
          </a>
          <p className="nav-label">YOUR COMMAND CENTER</p>
          <a className="nav-link active" href="#main" aria-current="page">
            <Sun size={18} /> Today <span className="nav-dot" />
          </a>
          <a className="nav-link" href="/direction">
            <Compass size={18} /> Direction
          </a>
          <a className="nav-link" href="#daily-plan">
            <Target size={18} /> Daily priorities
          </a>
          <a className="nav-link" href="#reflection">
            <Cross size={18} /> Scripture & thought
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="fine-line" />
          <p>Do what matters.</p>
          <span>Make space for the rest.</span>
        </div>
        <div className="sidebar-bottom">
          <ShieldCheck size={16} />
          <span>
            Built for your life.
            <br />
            <strong>Designed to stay yours.</strong>
          </span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Command <span>/</span> <strong>Today</strong>
          </span>
          <div className="topbar-right">
            <span className="preview-badge">
              {accountId ? 'YOUR WORKSPACE' : 'FOUNDATION PREVIEW'}
            </span>
            <button
              className="icon-button"
              aria-label="Date and timezone settings"
              onClick={() => settings.current?.showModal()}
            >
              <Globe2 size={18} />
            </button>
          </div>
        </header>
        <main id="main" className="main-content">
          <div className="page-heading">
            <div>
              <p className="date-label" data-testid="local-date">
                {dateLabel}
              </p>
              <h1>
                Make today count<span>.</span>
              </h1>
              <p className="lead">A clear direction. A deliberate day.</p>
            </div>
            <div className="day-emblem" aria-hidden="true">
              <Sun size={38} strokeWidth={1} />
            </div>
          </div>
          <div className="preview-notice">
            <span className="status-dot" />
            <p>Your space is taking shape. Daily planning is coming next.</p>
          </div>

          {accountId ? (
            <TodaySeason initialSeason={initialSeason} accountId={accountId} />
          ) : (
            <Panel className="season-panel" id="direction" aria-labelledby="season-title">
              <div className="season-icon">
                <Compass size={23} strokeWidth={1.4} />
              </div>
              <div className="season-copy">
                <Eyebrow>YOUR CURRENT SEASON</Eyebrow>
                <h2 id="season-title">Choose what deserves your focus.</h2>
                <p>A season connects your daily work to the life you’re building.</p>
              </div>
              <span className="subtle-badge">
                {seasonUnavailable ? 'Season unavailable' : 'Sign in for your Season'}
              </span>
            </Panel>
          )}

          <div className="dashboard-grid" id="daily-plan">
            <Panel className="one-thing" aria-labelledby="one-thing-title">
              <div className="panel-heading">
                <Eyebrow>01 / THE ONE THING</Eyebrow>
                <Target size={18} />
              </div>
              <h2 id="one-thing-title">
                What would move
                <br className="desktop-break" /> your life forward?
              </h2>
              <p className="one-thing-prompt">
                If you accomplish only one thing today,
                <br className="desktop-break" /> make it something that matters.
              </p>
              <div className="empty-outcome">
                <span className="outcome-marker" />
                <span>Your primary outcome belongs here.</span>
              </div>
              <p className="quiet-note">One clear outcome. Your starting point for the day.</p>
            </Panel>
            <Panel className="big-three" aria-labelledby="big-three-title">
              <div className="panel-heading">
                <Eyebrow>02 / THE BIG 3</Eyebrow>
                <span className="small-muted">Daily outcomes</span>
              </div>
              <h2 id="big-three-title">Define a successful day.</h2>
              <p className="card-description">Three meaningful outcomes. Room to focus.</p>
              <ol className="outcome-list">
                {[
                  'Choose what matters most.',
                  'Make the tradeoff deliberate.',
                  'Leave room for life.',
                ].map((line, index) => (
                  <li key={line}>
                    <span className="outcome-number">0{index + 1}</span>
                    <span>{line}</span>
                    <span className="empty-checkbox" aria-hidden="true" />
                  </li>
                ))}
              </ol>
              <p className="quiet-note">
                Your outcomes will appear here once daily planning is connected.
              </p>
            </Panel>
          </div>

          <div className="section-heading" id="reflection">
            <div>
              <Eyebrow>A MOMENT OF PERSPECTIVE</Eyebrow>
              <h2>Before the noise.</h2>
            </div>
            <span>
              Carry this into your day <ArrowUpRight size={14} />
            </span>
          </div>
          <div className="reflection-grid">
            <Panel className="scripture-panel" aria-labelledby="scripture-title">
              <div className="panel-heading">
                <h3 id="scripture-title" className="eyebrow">
                  DAILY SCRIPTURE
                </h3>
                <Cross size={16} />
              </div>
              {content ? (
                <>
                  <blockquote data-testid="scripture">“{content.scripture.text}”</blockquote>
                  <p className="verse-reference">
                    {content.scripture.book} {content.scripture.chapter}:{content.scripture.verse}
                    <span>KJV</span>
                  </p>
                </>
              ) : (
                <p className="card-description">Preparing today’s Scripture…</p>
              )}
            </Panel>
            <Panel className="thought-panel" aria-labelledby="thought-title">
              <div className="panel-heading">
                <h3 id="thought-title" className="eyebrow">
                  THOUGHT FOR TODAY
                </h3>
                <span className="quote-mark" aria-hidden="true">
                  “
                </span>
              </div>
              {content ? (
                <>
                  <blockquote data-testid="thought">{content.thought.text}</blockquote>
                  <p className="verse-reference">
                    Life OS<span>ORIGINAL THOUGHT</span>
                  </p>
                </>
              ) : (
                <p className="card-description">Preparing today’s thought…</p>
              )}
            </Panel>
          </div>
          <footer className="page-footer">
            <span>
              <Layers3 size={14} /> A foundation for deliberate living.
            </span>
            <span>Faith, character, and rest have room here.</span>
          </footer>
        </main>
      </div>
      <dialog ref={settings} className="settings-dialog" aria-labelledby="settings-title">
        <div className="panel-heading">
          <Eyebrow>YOUR LOCAL DAY</Eyebrow>
          <Globe2 size={18} />
        </div>
        <h2 id="settings-title">Date & timezone</h2>
        <p>
          Today’s date, Scripture, and thought follow this timezone. This preview keeps your choice
          until you reload.
        </p>
        <label htmlFor="timezone">Timezone</label>
        <select id="timezone" value={zone} onChange={(event) => setZone(event.target.value)}>
          <option value="device">Use this device’s timezone</option>
          {zones.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <form method="dialog">
          <Button variant="primary">Done</Button>
        </form>
      </dialog>
    </div>
  );
}
