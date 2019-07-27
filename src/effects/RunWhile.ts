import { call, CallEffect, race, RaceEffect, select, SelectEffect } from 'redux-saga/effects';

import { observeWhile } from './ObserveWhile';

export type RunWhileMonad<S> = {
  /**
   * The saga run when .run() is called.
   * @param saga The saga to run.
   */
  saga: (saga: () => IterableIterator<any>) => RunWhileSagaMonad<S>;
};

export type RunWhileSagaMonad<S> = {
  /**
   * Actually starts running the saga.
   */
  run: () => CallEffect,

  /**
   * Add an invariant that must be true while the saga runs. If the invariant is every broken, we call onViolation.
   * You may not use '@@Saga' or a tag on another invariant call.
   * @param tag
   */
  invariant: <NewI extends string>(tag: ValidateTag<never, NewI>, clause: (s: S) => boolean) => RunWhileInvariantMonad<S, NewI>,
};

export type RunWhileInvariantMonad<S, I extends string> = {
  /**
   * Add an invariant that must be true while the saga runs. If the invariant is every broken, we call onViolation.
   * You may not use '@@Saga' or a tag on another invariant call.
   * @param tag
   */
  invariant: <NewI extends string>(tag: ValidateTag<I, NewI>, clause: (s: S) => boolean) => RunWhileInvariantMonad<S, I | NewI>,

  /**
   * Add a callback that gets called if any of the invariants get violated. These are called in the order they're added
   * if more than one exists.
   * @param callback the saga to be redux-called when an invariant gets violated. Callback receives the current redux
   *   state and an array of all the invariants violated.
   */
  onViolation: (callback: (state: S, violations: I[]) => IterableIterator<any>) => RunWhileOnViolationMonad<S, I>
};

export type RunWhileOnViolationMonad<S, I extends string> = {
  /**
   * Actually starts running the saga.
   */
  run: () => CallEffect,

  /**
   * Add a callback that gets called if any of the invariants get violated. These are called in the order they're added
   * if more than one exists.
   * @param callback the saga to be redux-called when an invariant gets violated. Callback receives the current redux
   *   state and an array of all the invariants violated.
   */
  onViolation: (callback: (state: S, violations: I[]) => IterableIterator<any>) => RunWhileOnViolationMonad<S, I>
};

type Invariant<S, I extends string> = {
  tag: I,
  clause: (s: S) => boolean
};

type RunWhileDefinition<S, I extends string> = RunWhileInvariantDefinition<S, I> & {
  onViolationCallbacks: ((s: S, tag: I[]) => IterableIterator<any>)[],
};

type RunWhileInvariantDefinition<S, I extends string> = {
  invariants: Invariant<S, I>[],
  saga: () => IterableIterator<any>
}

type ErrorBrand<T extends string> = T & {
};

const sagaRaceTag = '@@Saga';

/**
 * Constructs a runWhile guard on the passed saga. The saga will only run while all .invariant declarations are true.
 * @param saga The saga to guard.
 */
export function runWhile<S>(): RunWhileMonad<S> {
  const definition: RunWhileInvariantDefinition<S, never> = {
    saga: function* nothing() { yield 0; },
    invariants: [],
  };

  return {
    saga: sagaPartial(definition),
  };
}

function sagaPartial<S>(definition: RunWhileInvariantDefinition<S, never>): (saga: () => IterableIterator<any>) => RunWhileSagaMonad<S> {
  return (saga: () => IterableIterator<any>) => {
    const newDefinition = {
      ...definition,
      saga
    };

    const result: RunWhileSagaMonad<S> = {
      run: runPartial({...newDefinition, onViolationCallbacks: []}),
      invariant: invariantPartial(newDefinition),
    };

    return result;
  }
}

type DuplicateTagError = ErrorBrand<'Duplicate invariant'>;
type ReservedTagError = ErrorBrand<'@@Saga is a reserved tag.'>;

type AssertUniqueTag<I, NewI> = [NewI] extends [I] ? DuplicateTagError : NewI;
type AssertNonReservedTag<NewI> = [NewI] extends [typeof sagaRaceTag] ? ReservedTagError : NewI;

type ValidateTag<I, NewI> = AssertUniqueTag<I, AssertNonReservedTag<NewI>>;

function invariantPartial<S, I extends string>(
  definition: RunWhileInvariantDefinition<S, I>
) : <NewI extends string>(tag: ValidateTag<I, NewI>, clause: (s: S) => boolean) => RunWhileInvariantMonad<S, I | NewI> {
  return <NewI extends string>(tag: ValidateTag<I, NewI>, clause: (s: S) => boolean) => {
    const newDefinition: RunWhileInvariantDefinition<S, I | NewI> = {
      ...definition,
      invariants: [
        // The tag type in the old definition of the invariants aren't assignable to the new types.
        ...definition.invariants as any,
        {
          tag,
          clause
        }
      ],
    };

    const result: RunWhileInvariantMonad<S, I | NewI> = {
      invariant: invariantPartial(newDefinition),
      onViolation: onViolationPartial({...newDefinition, onViolationCallbacks: []})
    };

    return result;
  }
}

function onViolationPartial<S, I extends string>(
  definition: RunWhileDefinition<S, I>
): (callback: (state: S, invariants: I[]) => IterableIterator<any>) => RunWhileOnViolationMonad<S, I> {
  return (callback: (state: S, invariants: I[]) => IterableIterator<any>) => {
    const newDefinition: RunWhileDefinition<S, I> = {
      ...definition,
      onViolationCallbacks: [ ...definition.onViolationCallbacks, callback ]
    }

    const result: RunWhileOnViolationMonad<S, I> = {
      onViolation: onViolationPartial(newDefinition),
      run: runPartial(newDefinition)
    };

    return result;
  };
}

function runPartial<S, I extends string>(definition: RunWhileDefinition<S, I>): () => CallEffect {
  return () => {
    return call(runInternal, definition as any);
  }
}

function* runInternal<S, I extends string>(
  definition: RunWhileDefinition<S, I>
): IterableIterator<CallEffect | RaceEffect<any> | SelectEffect> {
  let raceDefinition = {
    [sagaRaceTag]: call(definition.saga),
  };

  definition.invariants.forEach(invariant => {
    raceDefinition = {
      ...raceDefinition,
      [invariant.tag as string]: call(observeWhile, invariant.clause as any)
    }
  });

  const raceResults = yield race(raceDefinition);

  // If an invariant was violated, call each onViolation with the set of violations
  if(definition.invariants.some(invariant => invariant.tag in raceResults)) {
    const currentState: S = yield select(state => state);

    const violations = definition.invariants
      .filter(invariant => !invariant.clause(currentState))
      .map(invariant => invariant.tag);

    for (const callback of definition.onViolationCallbacks) {
      yield call(callback, currentState, violations);
    };
  }
}
