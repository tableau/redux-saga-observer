import { call, CallEffect } from 'redux-saga/effects';

import { observeUntil } from './ObserveUntil';

/**
 * A saga that returns when the passed invariant is false. Returns immediately if it's false at time of call.
 * @param invariant The condition on the Redux state to check.
 */
export function* observeWhile<S>(invariant: (state: S) => boolean): IterableIterator<CallEffect> {
  yield call(observeUntil, (state: S) => !invariant(state));
}