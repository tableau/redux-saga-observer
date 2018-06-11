import {
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

export type ObserveAndRunWhenMonad<S> = {
  run: () => CallEffect;
};

type RunWhenDefinition<S> = {
  saga: (state: S) => IterableIterator<any>,
  condition: (oldState: S, newState: S) => boolean;
};

/**
 * Runs a saga every time the when criteria is satisfied.
 */
export function observeAndRun() {
  return {
    saga: sagaPartial({
      saga: function*() { yield null; },
      condition: function() { return false; }
    })
  };
}

function sagaPartial<S>(definition: RunWhenDefinition<S>) {
  return function(saga: () => IterableIterator<any>): ObserveAndRunSagaMonad<S> {
    return {
      when: whenPartial({
        ...definition,
        saga
      })
    };
  }
}

function whenPartial<S>(definition: RunWhenDefinition<S>) {
  return function(condition: (oldState: S, newState: S) => boolean): ObserveAndRunWhenMonad<S> {
    return {
      run: runPartial({
        ...definition,
        condition
      })
    };
  }
}

function runPartial<S>(definition: RunWhenDefinition<S>) {
  return function () {
    return call(runInternal, definition);
  };
}

function* runInternal<S>(definition: RunWhenDefinition<S>) {
  let previousState: S = yield select(state => state);

  while(true) {
    const currentState: S = yield select(state => state);

    if (
      currentState != previousState &&
      definition.condition(previousState, currentState)
    ) {
      yield fork(definition.saga, previousState);
    }

    previousState = currentState;

    yield take('*');
  }
}

