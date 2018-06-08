import { expectSaga } from 'redux-saga-test-plan';
import { Action } from 'redux';

import { observeUntil } from '../../src/effects/ObserveUntil';

describe('ObserveUntil', () => {
  type State = {
    val: number;
  }

  interface MyAction extends Action {
    val: number
  };

  it('should stop observing when condition becomes true', (done) => {
    const initialState = {
      val: 20
    };

    function* saga() {
      yield observeUntil<State>(s => s.val > 40);
    }

    const reducer = (state: State, action: Action) => {
      if (action.type === 'setVal') {
        return {
          ...state,
          val: (action as MyAction).val
        }
      } else {
        return state;
      }
    }

    expectSaga(saga)
      .withReducer(reducer, initialState)
      .dispatch({ type: 'setVal', val: 35 })
      .dispatch({ type: 'setVal', val: 45 })
      .dispatch({ type: 'setVal', val: 50 })
      .run(false)
      .then(result => {
        const state = result.storeState as State;

        expect(state.val).toBe(45);
      })
      .catch(err => {
        fail(err);
      })
      .then(_ => done());
  });
});