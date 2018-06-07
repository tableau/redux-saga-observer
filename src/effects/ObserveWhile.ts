import { call, CallEffect } from 'redux-saga/effects';

import { observeUntil } from './ObserveUntil';

export function* observeWhile<S>(invariant: (state: S) => boolean) {
  yield call(observeUntil, (state: S) => !invariant(state));
}