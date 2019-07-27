import { expectSaga } from 'redux-saga-test-plan';
import { Action } from 'redux';
import { put, take } from 'redux-saga/effects';

import { runWhile } from '../../src/effects/RunWhile';

describe('RunWhile', () => {
  type State = {
    val1: number,
    val2: number
  };

  interface MyAction1 extends Action {
    val: number
  };

  interface MyAction2 extends Action {
    val: number
  };

  const reducer = (state: State | undefined, action: Action) => {
    if (state == null) {
      return { val1: 0, val2: 0 };
    }

    if (action.type === 'setVal1') {
      return {
        ...state,
        val1: (action as MyAction1).val
      };
    } else if (action.type === 'setVal2') {
      return {
        ...state,
        val2: (action as MyAction2).val
      };
    } else {
      return state;
    }
  }

  it('should stop running when invariant violated', (done) => {
    const initialState: State = {
      val1: 0,
      val2: 0
    };

    let violationCalled = false;

    function* saga() {
      yield runWhile<State>()
        .saga(function* () {
          yield take('horse');
          yield put({ type: 'setVal2', val: 40 });

          yield take('cow');

          // We expect the saga to abort here.
          yield take('horse');
          yield put({ type: 'setVal2', val: 60 });
        })
        .invariant('horse', s => s.val1 < 20)
        .onViolation(function* (state, violations): IterableIterator<any> {
          expect(state.val1).toBe(20);
          expect(state.val2).toBe(40);
          expect(violations.length).toBe(1);
          expect(violations[0]).toBe('horse')

          violationCalled = true;
        })
        .run();
    }

    expectSaga(saga)
      .withReducer(reducer, initialState)
      .delay(0) // Actions don't properly queue without a channel, so we need to insert a delay so they aren't dropped in this test.
      .dispatch({ type: 'setVal1', val: 10})
      .delay(0)
      .dispatch({ type: 'horse' })
      .delay(0)
      .dispatch({ type: 'cow' })
      .delay(0)
      .dispatch({ type: 'setVal1', val: 20})
      .run(false)
      .then(results => {
        const state: State = results.storeState;

        expect(state.val1).toBe(20);
        expect(state.val2).toBe(40);
        expect(violationCalled).toBe(true);
      })
      .catch(err =>
        fail(err)
      )
      .then(_ => done());
  });

  it('should report every invariant violated', (done) => {
    const initialState: State = {
      val1: 0,
      val2: 0
    };

    let violationCalled = false;

    function* saga() {
      yield runWhile<State>()
        .saga(function* () {
          yield take('horse');
          yield put({ type: 'setVal2', val: 40 });

          yield take('cow');

          // We expect the saga to abort here.
          yield take('horse');
          yield put({ type: 'setVal2', val: 60 });
        })
        .invariant('horse', s => s.val1 < 20)
        .invariant('doggie', s => s.val1 < 19)
        .onViolation(function* (state, violations): IterableIterator<any> {
          expect(state.val1).toBe(20);
          expect(state.val2).toBe(40);
          expect(violations.length).toBe(2);
          expect(violations.some(violation => violation === 'horse')).toBe(true);
          expect(violations.some(violation => violation === 'doggie')).toBe(true);

          violationCalled = true;
        })
        .run();
    }

    expectSaga(saga)
      .withReducer(reducer, initialState)
      .delay(0)
      .dispatch({ type: 'setVal1', val: 10})
      .delay(0)
      .dispatch({ type: 'horse' })
      .delay(0)
      .dispatch({ type: 'cow' })
      .delay(0)
      .dispatch({ type: 'setVal1', val: 20})
      .run(false)
      .then(results => {
        const state: State = results.storeState;

        expect(state.val1).toBe(20);
        expect(state.val2).toBe(40);
        expect(violationCalled).toBe(true);
      })
      .catch(err =>
        fail(err)
      )
      .then(_ => done());
  });

  it ('should run to completion when no invariants are violated', (done) => {
    const initialState: State = {
      val1: 0,
      val2: 0
    };

    let violationCalled = false;

    function* saga() {
      yield runWhile<State>()
        .saga(function* () {
          yield take('horse');
          yield put({ type: 'setVal2', val: 40 });

          yield take('cow');

          // We expect the saga to abort here.
          yield take('horse');
          yield put({ type: 'setVal2', val: 60 });
        })
        .invariant('horse', s => s.val1 < 20)
        .invariant('doggie', s => s.val1 < 19)
        .onViolation(function* (_state, _violations): IterableIterator<any> {
          fail('violation should not be called');

          violationCalled = true;
        })
        .run();
    }

    expectSaga(saga)
      .withReducer(reducer, initialState)
      .delay(0)
      .dispatch({ type: 'setVal1', val: 10})
      .delay(0)
      .dispatch({ type: 'horse' })
      .delay(0)
      .dispatch({ type: 'cow' })
      .delay(0)
      .dispatch({ type: 'horse' })
      .run(false)
      .then(results => {
        const state: State = results.storeState;

        expect(state.val1).toBe(10);
        expect(state.val2).toBe(60);
        expect(violationCalled).toBe(false);
      })
      .catch(err =>
        fail(err)
      )
      .then(_ => done());
  });
});