import type { CapabilityStatus } from '../../contracts/src/index.ts';
import type { DecisionRecord, Requirement, Principal } from '../../platform-contracts/src/permissions.ts';
export type { DecisionRecord, Requirement, Principal, PermissionId, PermissionScope } from '../../platform-contracts/src/permissions.ts';
/** Root's actual storage client adapter supplies this interface. A failed read or
 * write never becomes an in-memory persistent success. */
export interface DecisionStore {
  list(principalKey: string): Promise<DecisionRecord[]>;
  put(record: DecisionRecord): Promise<DecisionRecord>;
  revoke(id: string): Promise<boolean>;
}
export interface PermissionPrompt {
  id: string;
  principal: Principal;
  operationId: string;
  requirements: Requirement[];
  choices: ('once'|'persistent'|'deny')[];
}
export type Remediation = 'review-permissions' | 'request-permission-again' | 'refresh-capability' | 'reconnect' | 'retry-storage';
export type BrokerOutcome =
  {outcome:'completed';result:unknown} |
  {outcome:'permission-required';prompt:PermissionPrompt;remediationAction:'review-permissions'} |
  {outcome:'unavailable';capability:CapabilityStatus;remediationAction:string} |
  {outcome:'denied';reasonCode:string;remediationAction:Remediation} |
  {outcome:'cancelled';effectOutcome:'not-dispatched'|'unknown';automaticReplay:false;requiresReview:boolean;remediationAction:Remediation} |
  {outcome:'failed';reasonCode:string;effectOutcome:'not-dispatched'|'unknown';automaticReplay:false;requiresReview:boolean};
