import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING_ERROR_CODES } from '../server/booking-service.mjs';
import { getInternalBookingReason, toExternalBookingError } from '../server/booking-errors.mjs';

const error = (code) => Object.assign(new Error('synthetic-private-marker'), {code});
const groups = [
  [401,'AUTHENTICATION_REQUIRED',['UNAUTHENTICATED']],
  [404,'RESOURCE_UNAVAILABLE',['FORBIDDEN','NOT_FOUND','UNKNOWN_LOCATION','UNKNOWN_SERVICE','UNKNOWN_CUSTOMER','UNKNOWN_RESOURCE']],
  [400,'INVALID_REQUEST',['INVALID_INPUT','INVALID_IDEMPOTENCY_KEY','INVALID_START_AT','PRIVACY_REQUIRED','INVALID_REFERENCE']],
  [409,'REQUEST_CONFLICT',['IDEMPOTENCY_CONFLICT','DUPLICATE_REQUEST','INVALID_TRANSITION','REFERENCE_CONFLICT','RESOURCE_CONFLICT','RECONCILIATION_MISMATCH']],
  [409,'REQUEST_NOT_ALLOWED',['PAST_TIME','RECONCILIATION_REQUIRED','POLICY_UNDECIDED']],
  [500,'INTERNAL_ERROR',['INVALID_CONFIGURATION','ADAPTER_FAILURE']],
];

test('all internal booking codes have an explicit safe public group', () => {
  assert.ok(Object.isFrozen(BOOKING_ERROR_CODES));
  assert.deepEqual(groups.flatMap(([, , codes]) => codes).sort(),[...BOOKING_ERROR_CODES].sort());
  for (const [status,code,reasons] of groups) for (const reason of reasons) {
    const original=error(reason);
    const external=toExternalBookingError(original);
    assert.deepEqual(Object.keys(external).sort(),['code','message','status']);
    assert.equal(external.status,status);
    assert.equal(external.code,code);
    assert.equal(typeof external.message,'string');
    assert.ok(external.message.length>0);
    assert.equal(Object.getPrototypeOf(external),Object.prototype);
    assert.ok(Object.isFrozen(external));
    assert.equal(getInternalBookingReason(original),reason);
    assert.equal(original.code,reason);
    assert.equal(original.message,'synthetic-private-marker');
    assert.ok(!JSON.stringify(external).includes('synthetic-private-marker'));
    assert.throws(()=>{external.code='edited';},TypeError);
  }
});

test('missing and inaccessible resource descriptors are indistinguishable while internal reasons remain distinct', () => {
  const internalAudit=[];
  const outputs=['NOT_FOUND','FORBIDDEN','UNKNOWN_LOCATION','UNKNOWN_SERVICE','UNKNOWN_CUSTOMER','UNKNOWN_RESOURCE'].map(reason => {
    const original=error(reason);
    internalAudit.push({reason:getInternalBookingReason(original)});
    return toExternalBookingError(original);
  });
  for (const output of outputs) assert.deepEqual(output,outputs[0]);
  assert.equal(outputs[0].status,404);
  assert.equal(new Set(internalAudit.map(event=>event.reason)).size,6);
  assert.ok(!JSON.stringify(outputs).includes('FORBIDDEN'));
  assert.ok(!JSON.stringify(outputs).includes('NOT_FOUND'));
});

test('unknown error data never becomes a public message, code, stack or diagnostic reason', () => {
  for (const value of [null,undefined,'synthetic-private-marker',error('synthetic-private-marker'),{},42]) {
    assert.equal(getInternalBookingReason(value),'ADAPTER_FAILURE');
    assert.deepEqual(toExternalBookingError(value),{status:500,code:'INTERNAL_ERROR',message:'The request could not be completed.'});
  }
});

test('error accessors and hostile descriptors cannot leak through normalization', () => {
  let reads=0;
  const accessor=Object.defineProperties({}, {
    code:{get(){reads++; return 'NOT_FOUND';}},
    message:{get(){reads++; throw new Error('synthetic-private-marker');}},
    stack:{get(){reads++; return 'synthetic-private-marker';}},
  });
  assert.equal(getInternalBookingReason(accessor),'ADAPTER_FAILURE');
  assert.equal(toExternalBookingError(accessor).status,500);
  assert.equal(reads,0);
  const hostile=new Proxy({}, {getOwnPropertyDescriptor(){throw new Error('synthetic-private-marker');}});
  assert.equal(getInternalBookingReason(hostile),'ADAPTER_FAILURE');
  assert.equal(toExternalBookingError(hostile).code,'INTERNAL_ERROR');
});
