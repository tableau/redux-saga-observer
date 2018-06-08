import { RunWhileMonad, OnViolationMonad } from './RunWhile';
import { call, CallEffect, race, RaceEffect, select, SelectEffect } from 'redux-saga/effects';

import { observeWhile } from './ObserveWhile';

export type RunWhileMonad<S, I extends string> = {
  /**
   * Actually starts running the saga.
   */
  run: () => CallEffect,

  /**
   * Add an invariant that must be true while the saga runs. If the invariant is every broken, we call onViolation.
   * You may not use '@@Saga' or a tag on another invariant call.
   * @param tag
   */
  invariant: <NewI extends string>(tag: NewI, clause: (s: S) => boolean) => RunWhileMonad<S, I | NewI>,
};

export type InvariantMonad<S, I extends string> = {
  /**
   * Add an invariant that must be true while the saga runs. If the invariant is every broken, we call onViolation.
   * You may not use '@@Saga' or a tag on another invariant call.
   * @param tag
   */
  invariant: <NewI extends string>(tag: NewI, clause: (s: S) => boolean) => RunWhileMonad<S, I | NewI>,

  /**
   * Add a callback that gets called if any of the invariants get violated. These are called in the order they're added
   * if more than one exists.
   * @param callback the saga to be redux-called when an invariant gets violated. Callback receives the current redux
   *   state and an array of all the invariants violated.
   */
  onViolation: (callback: (state: S, violations: I[]) => IterableIterator<any>) => RunWhileMonad<S, I>
};

export type OnViolationMonad<S, I extends string> = {
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
  onViolation: (callback: (state: S, violations: I[]) => IterableIterator<any>) => RunWhileMonad<S, I>
};


type Invariant<S, I extends string> = {
  tag: I,
  clause: (s: S) => boolean
};

type RunWhileDefinition<S, I extends string> = {
  invariants: Invariant<S, I>[],
  onViolationCallbacks: ((s: S, tag: I) => IterableIterator<any>)[],
  saga: () => IterableIterator<any>
};

const sagaRaceTag = '@@Saga';

/**
 * Constructs a runWhile guard on the passed saga. The saga will only run while all .invariant declarations are true.
 * @param saga The saga to guard.
 */
export function runWhile<S>(saga: () => IterableIterator<any>): RunWhileMonad<S, never> {
  const definition: RunWhileDefinition<S, never> = {
    saga: saga,
    invariants: [],
    onViolationCallbacks: []
  };

  return {
    run: run.bind(definition),
    invariant: invariant.bind(definition)
  };
}

function invariant<S, I extends string, NewI extends string>(
  this: RunWhileDefinition<S, I | NewI>,
  tag: NewI, clause: (s: S) => boolean
): InvariantMonad<S, I | NewI> {
  if (tag === sagaRaceTag) {
    throw new Error(`${tag} is reserved. Please choose another invariant tag.`);
  }

  // Enforce at runtime what our typesystem can't guarantee: that you only have
  // one of any given tag.
  if (this.invariants.some(invariant => invariant.tag as I | NewI === tag)) {
    throw new Error(`${tag} is a`);
  }

  const definition: RunWhileDefinition<S, I | NewI> = {
    ...this,
    invariants: [
      ...this.invariants,
      {
        tag,
        clause
      }
    ]
  };

  return {
    invariant: invariant.bind(definition),
    onViolation: onViolation.bind(definition)
  };
}

function onViolation<S, I extends string>(
  this: RunWhileDefinition<S, I>,
  callback: (s: S) => IterableIterator<any>
): OnViolationMonad<S, I> {
  const definition: RunWhileDefinition<S, I> = {
    ...this,
    onViolationCallbacks: [ ...this.onViolationCallbacks, callback ]
  }

  return {
    onViolation: onViolation.bind(definition),
    run: run.bind(definition)
  };
}

function run<S, I extends string>(this: RunWhileDefinition<S, I>): CallEffect {
  return call(runInternal.bind(this));
}

function* runInternal<S, I extends string>(
  this: RunWhileDefinition<S, I>
): IterableIterator<CallEffect | RaceEffect | SelectEffect> {
  let raceDefinition = {
    [sagaRaceTag]: call(this.saga),
  };

  this.invariants.forEach(invariant => {
    raceDefinition = {
      ...raceDefinition,
      [invariant.tag as string]: call(observeWhile, invariant.clause)
    }
  });

  const raceResults = yield race(raceDefinition);

  // If an invariant was violated, call each onViolation with the set of violations
  if(this.invariants.some(invariant => !!raceResults[invariant.tag])) {
    const currentState: S = yield select(state => state);

    const violations = this.invariants
      .filter(invariant => !invariant.clause(currentState))
      .map(invariant => invariant.tag);

    for (const callback of this.onViolationCallbacks) {
      yield call(callback, currentState, violations);
    };
  }
}
