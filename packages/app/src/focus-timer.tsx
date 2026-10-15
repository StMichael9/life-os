'use client';
import { focusCountdown, stopwatchTime } from '@life-os/shared';
export function FocusTimer({
  elapsed,
  plannedMinutes,
  running,
  mode = 'countdown',
}: {
  elapsed: number;
  plannedMinutes: number;
  running: boolean;
  mode?: 'countdown' | 'stopwatch' | undefined;
}) {
  const stopwatch = mode === 'stopwatch';
  const { remaining, progress, overtime } = focusCountdown(elapsed, plannedMinutes);
  const label = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className={'radial-focus' + (!stopwatch && !remaining ? ' intention-reached' : '')}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle className="timer-track" cx="120" cy="120" r="108" />
        <circle
          className="timer-progress"
          cx="120"
          cy="120"
          r="108"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={stopwatch ? 0 : 100 * (1 - progress)}
        />
      </svg>
      <div className="timer-center">
        <span className="eyebrow">
          {stopwatch
            ? running
              ? 'Working'
              : 'Paused'
            : remaining
              ? running
                ? 'Focus'
                : 'Paused'
              : 'Intention reached'}
        </span>
        <strong
          role="timer"
          aria-label={stopwatch ? 'Actual work elapsed' : 'Focus time remaining'}
        >
          {stopwatch ? stopwatchTime(elapsed) : label(remaining)}
        </strong>
        <span className="muted">
          {stopwatch ? 'Actual time · paused time excluded' : `${plannedMinutes}-minute intention`}
        </span>
      </div>
      {!stopwatch && !remaining && (
        <p className="timer-overtime">
          +{label(overtime)} additional time · Finish when ready. All active time is recorded.
        </p>
      )}
    </div>
  );
}
