import { Action } from 'redux';
import { buffers } from 'redux-saga';
import {
  actionChannel,
  ActionChannelEffect,
  call,
  CallEffect,
  fork,
  ForkEffect,
  select,
  SelectEffect,
  take,
  TakeEffect
} from 'redux-saga/effects';

export type ObserveAndRunMonad<S> = {
  saga: (saga: (state: S) => IterableIterator<any>) => ObserveAndRunSagaMonad<S>;
};

export type ObserveAndRunSagaMonad<S> = {
  when: (condition: (oldState: S, newState: S) => boolean) => ObserveAndRunWhenMonad<S>;
};

export type ObserveAndRunUntilMonad = {
  run: () => CallEffect;
};

export type ObserveAndRunWhenMonad<S> = {
  until: (callback: (state: S) => boolean) => ObserveAndRunUntilMonad;
  run: () => CallEffect;
};

type RunWhenDefinition<S> = {
  saga: (state: S) => IterableIterator<any>,
  condition: (oldState: S, newState: S) => boolean;
  until: (state: S) => boolean;
};

/**
 * Runs a saga every time the when criteria is satisfied.
 */
export function observeAndRun<S>() {
  return {
    saga: sagaPartial<S>({
      saga: function*() { yield null; },
      condition: function() { return false; },
      until: _ => false
    })
  };
}

function sagaPartial<S>(definition: RunWhenDefinition<S>) {
  return function(saga: () => IterableIterator<any>): ObserveAndRunSagaMonad<S> {
    return {
      when: whenPartial<S>({
        ...definition,
        saga
      })
    };
  }
}

function whenPartial<S>(definition: RunWhenDefinition<S>) {
  return function(condition: (oldState: S, newState: S) => boolean): ObserveAndRunWhenMonad<S> {
    const newDefinition = {
      ...definition,
      condition
    };

    return {
      run: runPartial<S>(newDefinition),
      until: untilPartial<S>(newDefinition)
    };
  }
}

function untilPartial<S>(definition: RunWhenDefinition<S>) {
  return function(until: (state: S) => boolean) {
    return {
      run: runPartial<S>({
        ...definition,
        until
      })
    };
  };
}

function runPartial<S>(definition: RunWhenDefinition<S>) {
  return function () {
    return call(runInternal, definition);
  };
}

function* runInternal<S>(definition: RunWhenDefinition<S>): IterableIterator<ActionChannelEffect | ForkEffect | SelectEffect | TakeEffect> {
  let previousState: S = yield select(state => state);

  // We need to observe every action to guarantee the observer will detect all state changes.
  // This means we have to eventually process actions even while other sagas are blocked; hence
  // the channel.
  const channel = yield actionChannel('*', buffers.expanding<Action>(100));

  while(true) {
    const currentState: S = yield select(state => state);

    if (definition.until(currentState)) {
      return;
    }

    if (
      currentState != previousState &&
      definition.condition(previousState, currentState)
    ) {
      yield fork(definition.saga, previousState);
    }

    previousState = currentState;

    yield take(channel);
  }
}

