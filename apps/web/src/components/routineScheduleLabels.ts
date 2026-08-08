import type { RoutineSchedule } from '@open-design/contracts';
import type { Dict } from '../i18n/types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export type RoutineScheduleSummaryParts =
  | { kind: 'hourly'; kindLabel: string; minute: string }
  | { kind: 'daily' | 'weekdays'; kindLabel: string; time: string; tz: string }
  | { kind: 'weekly'; dayLabel: string; time: string; tz: string };

function timezoneLabel(timezone: string): string {
  return timezone === 'UTC' ? 'UTC' : (timezone.split('/').pop() ?? timezone).replace(/_/g, ' ');
}

export function describeRoutineScheduleParts(
  schedule: RoutineSchedule,
  t: TranslateFn,
  _nextRunAt?: number | null,
): RoutineScheduleSummaryParts {
  if (schedule.kind === 'hourly') {
    return { kind: 'hourly', kindLabel: t('routines.kind.hourly'), minute: String(schedule.minute).padStart(2, '0') };
  }
  if (schedule.kind === 'weekly') {
    return {
      kind: 'weekly',
      dayLabel: t(`routines.weekday.long.${schedule.weekday}` as keyof Dict),
      time: schedule.time,
      tz: timezoneLabel(schedule.timezone),
    };
  }
  return {
    kind: schedule.kind,
    kindLabel: t(`routines.kind.${schedule.kind}` as keyof Dict),
    time: schedule.time,
    tz: timezoneLabel(schedule.timezone),
  };
}

export function describeRoutineSchedule(
  schedule: RoutineSchedule,
  t: TranslateFn,
  nextRunAt?: number | null,
): string {
  const parts = describeRoutineScheduleParts(schedule, t, nextRunAt);
  if (parts.kind === 'hourly') return t('routines.describe.hourly', { minute: parts.minute });
  if (parts.kind === 'weekly') return t('routines.describe.weekly', { day: parts.dayLabel, time: parts.time, tz: parts.tz });
  return t(`routines.describe.${parts.kind}` as keyof Dict, { time: parts.time, tz: parts.tz });
}
