'use client';
import { useEffect, useState } from 'react';
import type { Season } from '@life-os/shared';
import { Compass } from 'lucide-react';
import { Panel, Eyebrow } from '@life-os/ui';
import { requestJson, RequestFailed } from './auth-client';
import { AllocationList, dateRange } from './direction-editor';
export function TodaySeason({
  initialSeason,
  accountId,
}: {
  initialSeason: Season | null;
  accountId: string;
}) {
  const [season, setSeason] = useState(initialSeason);
  const [state, setState] = useState<'ready' | 'loading' | 'offline' | 'ended'>('ready');
  useEffect(() => {
    let stopped = false;
    let loading = false;
    let ended = false;
    const refresh = async () => {
      if (loading || ended || document.visibilityState !== 'visible') return;
      loading = true;
      setState('loading');
      try {
        const data = await requestJson<{ activeSeason: Season | null; ownerId: string }>(
          '/api/direction/active-season',
        );
        if (data.ownerId !== accountId) throw new RequestFailed(401, 'Account changed.');
        if (!stopped) {
          setSeason(data.activeSeason);
          setState('ready');
        }
      } catch (error) {
        if (!stopped) {
          if (error instanceof RequestFailed && error.status === 401) {
            ended = true;
            setSeason(null);
            setState('ended');
          } else setState('offline');
        }
      } finally {
        loading = false;
      }
    };
    const foreground = () => void refresh();
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    const timer = setInterval(foreground, 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [accountId]);
  return (
    <Panel className="season-panel today-real-season" id="direction" aria-labelledby="season-title">
      <div className="season-icon">
        <Compass size={23} strokeWidth={1.4} />
      </div>
      <div className="season-copy">
        <Eyebrow>YOUR CURRENT SEASON</Eyebrow>
        <h2 id="season-title">
          {season?.name ??
            (state === 'ended' ? 'Return to your direction.' : 'Choose what deserves your focus.')}
        </h2>
        <p>
          {season?.objective ??
            (state === 'ended'
              ? 'Sign in again to view your private Season.'
              : 'Give this chapter a primary objective and a deliberate allocation of attention.')}
        </p>
        {season && (
          <>
            <p className="small-muted">{dateRange(season.startsOn, season.endsOn)}</p>
            <AllocationList allocations={season.allocations.slice(0, 6)} />
          </>
        )}
        {season && season.allocations.length > 6 && (
          <p className="quiet-note">{season.allocations.length - 6} more areas in your Season.</p>
        )}
        <a
          href={
            state === 'ended'
              ? '/login?next=/'
              : season
                ? `/direction?view=seasons&id=${season.id}`
                : '/direction'
          }
        >
          {state === 'ended'
            ? 'Sign in again'
            : season
              ? 'View your Season'
              : 'Create your first Season'}
        </a>
        {state === 'offline' && (
          <p role="status" className="quiet-note">
            Could not refresh. Showing the last confirmed Season.
          </p>
        )}
        {state === 'loading' && (
          <p role="status" className="quiet-note">
            Refreshing your Season…
          </p>
        )}
      </div>
      <span className="subtle-badge">
        {season ? 'Active Season' : state === 'ended' ? 'Session ended' : 'No active Season'}
      </span>
    </Panel>
  );
}
