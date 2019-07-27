import { expectSaga } from 'redux-saga-test-plan';
import { Action } from 'redux';
import { call, race, take } from 'redux-saga/effects';

import { observeAndRun } from '../../src/effects/ObserveAndRun';

describe('observeAndRun', () => {
  type State = {
    val: number,
  };

  const reducer = (state: State | undefined, action: Action) => {
    if (state == null) {
      return { val: 0 };
    }

    if (action.type === 'increment') {
      return {
        ...state,
        val: state.val + 1
      };
    } else {
      return state;
    }
  }

  it('Should keep running if no until is specified.', (done) => {
    let count = 0;

    function* saga() {
      const observer = observeAndRun<State>()
        .saga(function* (): IterableIterator<never> {
          count++;
        })
        .when((oldState, newState) => {
          return oldState.val % 2 === 0 &&
            newState.val % 2 === 1;
        })
        .run();

      const watchdog = function*() {
        for (let i = 0; i < 5; i++) {
          yield take('*');
        }
      }

      // Put the observer in a race with a saga that just counts to 5 and then returns. Check that the count
      // saga won the race.
      const results = yield race({
        countWon: call(watchdog),
        observerWon: observer
      });

      if ('observerWon' in results) {
        fail('observer ended');
      }

      if (!('countWon' in results)) {
        fail('count didn\'t end');
      }
    }

    const initialState = {
      val: 0
    };

    expectSaga(saga)
      .withReducer(reducer, initialState)
      .delay(0)
      .dispatch({type: 'increment'})
      .delay(0)
      .dispatch({type: 'increment'})
      .delay(0)
      .dispatch({type: 'increment'})
      .delay(0)
      .dispatch({type: 'increment'})
      .delay(0)
      .dispatch({type: 'increment'})
      .delay(0)
      .dispatch({type: 'increment'})
      .delay(0)
      .dispatch({type: 'increment'})
      .delay(0)
      .dispatch({type: 'increment'})
      .delay(0)
      .run(false)
      .then(_ => {
        expect(count).toBe(2);
      })
      .catch(error => fail(error))
      .then(_ => done());
  });

  it('Should fire every time the condition becomes true until until condition is hit', (done) => {
    let count = 0;

    function* saga() {
      yield observeAndRun<State>()
        .saga(function* (): IterableIterator<never> {
          count++;
        })
        .when((oldState, newState) => {
          return oldState.val % 2 === 0 &&
            newState.val % 2 === 1;
        })
        .until(state => state.val > 5)
        .run();
    }

    const initialState = {
      val: 0
    };

    expectSaga(saga)
      .withReducer(reducer, initialState)
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .run(false)
      .then(_ => {
        expect(count).toBe(3);
      })
      .catch(error => fail(error))
      .then(_ => done());
  });

  it('Exceptions propagate as expected', (done) => {
    let caught = false;

    function* saga() {
      try {
        yield observeAndRun<State>()
          .saga(function* (): IterableIterator<never> {
            throw new Error('horse')
          })
          .when(_ => true)
          .until(state => state.val > 5)
          .run();
      } catch (e) {
        caught = true
      }
    }

    const initialState = {
      val: 0
    };

    expectSaga(saga)
      .withReducer(reducer, initialState)
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .run(false)
      .then(_ => {
        expect(caught).toBe(true);
      })
      .catch(error => fail(error))
      .then(_ => done());
  });

  it('Should receive arguments if specified', async () => {
    let sagaCalled = false;

    function* saga() {
      yield observeAndRun<State>()
        .args((_oldState, newState) => newState.val)
        .saga(function*(val: number) {
          expect(val).toBe(2);
          sagaCalled = true;
          yield 5;
        })
        .when((_oldState, newState) => newState.val === 2)
        .until(state => state.val === 3)
        .run();
    }

    const initialState = {
      val: 0
    };

    await expectSaga(saga)
      .withReducer(reducer, initialState)
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .run(false);

    expect(sagaCalled).toBe(true);
  });

  it('Should not receive arguments if not specified', async () => {
    let sagaCalled = false;

    function* saga() {
      yield observeAndRun<State>()
        .saga(function*() {
          expect(arguments.length).toBe(0);
          sagaCalled = true;
          yield 5;
        })
        .when((_oldState, newState) => newState.val === 2)
        .until(state => state.val === 3)
        .run();
    }

    const initialState = {
      val: 0
    };

    await expectSaga(saga)
      .withReducer(reducer, initialState)
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .dispatch({type: 'increment'})
      .run(false);

    expect(sagaCalled).toBe(true);
  });
});