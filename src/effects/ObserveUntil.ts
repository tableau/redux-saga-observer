import { buffers } from 'redux-saga';
import {
  actionChannel,
  ActionChannelEffect,
  call,
  CallEffect,
  select,
  SelectEffect,
  take,
  TakeEffect
} from 'redux-saga/effects';

/**
 * A saga that returns when the passed invariant first becomes true. Returns immediately if it's true at time of call.
 * @param invariant The invariant on the redux state.
 */
export function observeUntil<S>(invariant: (state: S) => boolean): CallEffect {
  return call(observeUntilInternal, invariant);
}

function* observeUntilInternal<S>(invariant: (state: S) => boolean): IterableIterator<ActionChannelEffect | TakeEffect | CallEffect> {
  if (yield call(invariantMet, invariant)) {
    return;
  }

  const channel = yield actionChannel('*', buffers.expanding(100));

  do {
    yield take(channel);
  } while (!(yield call(invariantMet, invariant)));
}

function* invariantMet<S>(invariant: (state: S) => boolean): IterableIterator<SelectEffect | boolean> {
  const state: S = yield select<S>(state => state);

  return invariant(state);
}