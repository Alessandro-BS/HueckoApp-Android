import type { ProposalState } from '@hueckoapp/shared';

import { STATE_BADGE } from '../utils/proposals';
import { Badge } from './Badge';

export function ProposalStateBadge({ state }: { state: ProposalState }) {
  const badge = STATE_BADGE[state];
  return <Badge text={badge.text} containerColor={badge.container} contentColor={badge.content} />;
}
