import { call, CallEffect, race, RaceEffect } from 'redux-saga/effects';

import { observeWhile } from './ObserveWhile';

export type RunWhileMonad<S, I extends string> = {
  /**
   * Actually starts running the saga.
   */
  run: () => CallEffect,

  /**
   * Add an invariant that must be true while the saga runs. If the invariant is every broken, we call onViolation.
   */
  invariant: <NewI extends string>(tag: NewI, clause: (s: S) => boolean) => RunWhileMonad<S, I | NewI>,

  /**
   * Add a callback that gets called if any of the invariants get violated. These are called in the order they're added
   * if more than one exists.
   * @param callback the saga to be redux-called when an invariant gets violated. Takes the current Redux state and the invariant tag
   *   that was violated. Note that only one invariant will actully report being violated. If you need to check for multiple concurrent
   *   violations, you'll need to infer these yourself from state.
   */
  onViolation: (callback: (s: S, tag: I) => IterableIterator<any>) => RunWhileMonad<S, I>
};

const sageRaceTag = '@@Saga';

export type Invariant<S, I extends string> = {
  tag: I,
  clause: (s: S) => boolean
};

type RunWhileDefinition<S, I extends string> = {
  invariants: Invariant<S, I>[],
  onViolationCallbacks: ((s: S, tag: I) => IterableIterator<any>)[],
  saga: () => IterableIterator<any>
};

/**
 * Constructs a runWhile guard on the passed saga. The saga will only run while all .invariant declarations are true.
 * @param saga The saga to guard.
 */
export function runWhile<S>(saga: () => IterableIterator<any>) {
  return constructMonad({
    saga: saga,
    invariants: [],
    onViolationCallbacks: []
  });
}

function constructMonad<S, I extends string>(definition: RunWhileDefinition<S, I>): RunWhileMonad<S, I> {
  return {
    run: run.bind(definition),
    invariant: invariant.bind(definition),
    onViolation: onViolation.bind(definition)
  };
}

function invariant<S, I extends string, NewI extends string>(this: RunWhileDefinition<S, I>, tag: NewI, clause: (s: S) => boolean): RunWhileMonad<S, I | NewI> {
  if (tag === sageRaceTag) {
    throw new Error(`${tag} is reserved. Please choose another invariant tag.`);
  }

  return constructMonad<S, I | NewI>({
    ...this,
    invariants: [
      ...this.invariants,
      {
        tag,
        clause
      }
    ]
  });
}

function onViolation<S, I extends string>(this: RunWhileDefinition<S, I>, callback: (s: S) => IterableIterator<any>) {
  return constructMonad({
    ...this,
    onViolationCallbacks: [ ...this.onViolationCallbacks, callback ]
  });
}

function run<S, I extends string>(this: RunWhileDefinition<S, I>): CallEffect {
  return call(runInternal.bind(this));
}

function* runInternal<S, I extends string>(this: RunWhileDefinition<S, I>): IterableIterator<RaceEffect> {
  let raceDefinition = {
    [sageRaceTag]: call(this.saga),
  };

  this.invariants.forEach(invariant => {
    raceDefinition = {
      ...raceDefinition,
      [invariant.tag]: call(observeWhile, invariant.clause)
    }
  });

  const raceResults = yield race(raceDefinition);

  // Find the invariant that was violated, if any, and run the onViolation callbacks
  this.invariants.forEach(invariant => {
    if (0)
  });
}
