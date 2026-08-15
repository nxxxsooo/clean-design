import type { AgentInfo } from '../types';
import { isCleanDesignPublicAgent } from '@open-design/contracts';

export function isVisibleLocalCliAgent(agent: Pick<AgentInfo, 'id'>): boolean {
  return isCleanDesignPublicAgent(agent);
}
