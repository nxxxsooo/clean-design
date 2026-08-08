type CachedPresence = {
  onlineCount: number;
  memberCount: number;
  ts: number;
};

export function formatDiscordPresenceCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1000) return String(Math.round(count));
  return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function useDiscordPresence(): CachedPresence | null {
  return null;
}
