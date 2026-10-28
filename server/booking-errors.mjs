import { BOOKING_ERROR_CODES } from './booking-service.mjs';

const known = new Set(BOOKING_ERROR_CODES);
const groups = [
  [401,'AUTHENTICATION_REQUIRED','Authentication is required.',['UNAUTHENTICATED']],
  [404,'RESOURCE_UNAVAILABLE','Requested resource is unavailable.',
    ['FORBIDDEN','NOT_FOUND','UNKNOWN_LOCATION','UNKNOWN_SERVICE','UNKNOWN_CUSTOMER','UNKNOWN_RESOURCE']],
  [400,'INVALID_REQUEST','Check the request data.',
    ['INVALID_INPUT','INVALID_IDEMPOTENCY_KEY','INVALID_START_AT','PRIVACY_REQUIRED','INVALID_REFERENCE']],
  [409,'REQUEST_CONFLICT','The request conflicts with the current state.',
    ['IDEMPOTENCY_CONFLICT','DUPLICATE_REQUEST','INVALID_TRANSITION','REFERENCE_CONFLICT','RESOURCE_CONFLICT','RECONCILIATION_MISMATCH']],
  [409,'REQUEST_NOT_ALLOWED','The request is not allowed in its current state.',
    ['PAST_TIME','RECONCILIATION_REQUIRED','POLICY_UNDECIDED']],
  [500,'INTERNAL_ERROR','The request could not be completed.',['INVALID_CONFIGURATION','ADAPTER_FAILURE']],
];
const descriptors = new Map();
for (const [status,code,message,reasons] of groups) {
  const descriptor=Object.freeze({status,code,message});
  for (const reason of reasons) descriptors.set(reason,descriptor);
}

/** Stable reason for a trusted internal diagnostic sink; no message/stack data. */
export function getInternalBookingReason(error) {
  try {
    if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return 'ADAPTER_FAILURE';
    const property=Object.getOwnPropertyDescriptor(error,'code');
    return property && Object.hasOwn(property,'value') && known.has(property.value)
      ? property.value : 'ADAPTER_FAILURE';
  } catch { return 'ADAPTER_FAILURE'; }
}

/**
 * Response descriptor only: no HTTP route, real audit sink or authentication.
 * Missing/inaccessible resources deliberately have identical public data.
 * The original domain error is unchanged for trusted internal diagnostics.
 */
export function toExternalBookingError(error) {
  const reason=getInternalBookingReason(error);
  return descriptors.get(reason) ?? descriptors.get('ADAPTER_FAILURE');
}
