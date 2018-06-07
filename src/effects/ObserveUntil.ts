import { select, SelectEffect, take, TakeEffect } from 'redux-saga/effects';

export function* observeUntil<S>(invariant: (state: S) => boolean): IterableIterator<TakeEffect<{}>> {
  if (invariantMet(invariant)) {
    return;
  }

  do {
    yield take('*');
  } while (!invariantMet(invariant))
}

function* invariantMet<S>(invariant: (state: S) => boolean): IterableIterator<SelectEffect | boolean> {
  const state: S = yield select(state => state);

  return invariant(state);
}