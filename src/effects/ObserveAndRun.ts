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

export type ObserveAndRunMonad<StateType> = {
  args: <SagaArgType>(callback: (oldState: StateType, newState: StateType) => SagaArgType) => ObserveAndRunArgsMonad<StateType, SagaArgType>;
  saga: (saga: () => IterableIterator<any>) => ObserveAndRunSagaMonad<StateType>;
};

export type ObserveAndRunArgsMonad<StateType, SagaArgType> = {
  saga: (saga: (arg: SagaArgType) => IterableIterator<any>) => ObserveAndRunSagaMonad<StateType>;
}

export type ObserveAndRunSagaMonad<StateType> = {
  when: (condition: (oldState: StateType, newState: StateType) => boolean) => ObserveAndRunWhenMonad<StateType>;
};

export type ObserveAndRunUntilMonad = {
  run: () => CallEffect;
};

export type ObserveAndRunWhenMonad<StateType> = {
  until: (callback: (state: StateType) => boolean) => ObserveAndRunUntilMonad;
  run: () => CallEffect;
};

type RunWhenDefinitionCommon<StateType> = {
  condition: (oldState: StateType, newState: StateType) => boolean;
  until: (state: StateType) => boolean;
};

type RunWhenNoArgDefinition<StateType> = RunWhenDefinitionCommon<StateType> & {
  saga: () => IterableIterator<any>;
};

type RunWhenWithArgsDefinition<StateType, SagaArgType> = RunWhenDefinitionCommon<StateType> & {
  args: (oldState: StateType, newState: StateType) => SagaArgType;
};

type RunWhenWithArgsAndSagaDefinition<StateType, SagaArgType> = RunWhenWithArgsDefinition<StateType, SagaArgType> & {
  saga: (arg: SagaArgType) => IterableIterator<any>;
};

type RunWhenDefinition<StateType, SagaArgType> = RunWhenNoArgDefinition<StateType> | RunWhenWithArgsAndSagaDefinition<StateType, SagaArgType>;

/**
 * Runs a saga every time the when criteria is satisfied.
 */
export function observeAndRun<StateType>(): ObserveAndRunMonad<StateType> {
  const initialDefinition = {
    condition: function() { return false; },
    until: () => false,
  };

  return {
    saga: sagaNoArgsPartial<StateType>(initialDefinition),
    args: argsPartial<StateType>(initialDefinition)
  };
}

function argsPartial<StateType>(definition: RunWhenDefinitionCommon<StateType>) {
  return function<SagaArgType>(args: (oldState: StateType, newState: StateType) => SagaArgType): ObserveAndRunArgsMonad<StateType, SagaArgType> {
    const newDefinition: RunWhenWithArgsDefinition<StateType, SagaArgType> = {
      ...definition,
      args: args
    };

    const saga = sagaWithArgPartial<StateType, SagaArgType>(newDefinition);

    const returnVal: ObserveAndRunArgsMonad<StateType, SagaArgType> = {
      saga: saga
    };

    return returnVal;
  };
}

function sagaWithArgPartial<StateType, SagaArgType>(definition: RunWhenWithArgsDefinition<StateType, SagaArgType>) {
  return function(saga: (arg: SagaArgType) => IterableIterator<any>): ObserveAndRunSagaMonad<StateType> {
    const newDefinition: RunWhenWithArgsAndSagaDefinition<StateType, SagaArgType> = {
      ...definition,
      saga
    };

    const when = whenPartial(newDefinition);

    return {
      when: when
    };
  }
}

function sagaNoArgsPartial<StateType>(definition: RunWhenDefinitionCommon<StateType>) {
  return function(saga: () => IterableIterator<any>): ObserveAndRunSagaMonad<StateType> {
    return {
      // It's fine for downstream monads to lose the saga type information in this case because the user has already
      // assigned the callback and it will never be used again.
      when: whenPartial<StateType, never>({
        ...definition,
        saga
      })
    };
  }
}

function whenPartial<StateType, SagaArgType>(definition: RunWhenDefinition<StateType, SagaArgType>) {
  return function(condition: (oldState: StateType, newState: StateType) => boolean): ObserveAndRunWhenMonad<StateType> {
    const newDefinition = {
      ...definition,
      condition
    };

    return {
      run: runPartial<StateType, SagaArgType>(newDefinition),
      until: untilPartial<StateType, SagaArgType>(newDefinition)
    };
  }
}

function untilPartial<StateType, SagaArgType>(definition: RunWhenDefinition<StateType, SagaArgType>) {
  return function(until: (state: StateType) => boolean) {
    return {
      run: runPartial<StateType, SagaArgType>({
        ...definition,
        until
      })
    };
  };
}

function runPartial<StateType, SagaArgType>(definition: RunWhenDefinition<StateType, SagaArgType>) {
  return function () {
    return call(runInternal, definition);
  };
}

function* runInternal<StateType, SagaArgType>(definition: RunWhenDefinition<StateType, SagaArgType>): IterableIterator<ActionChannelEffect | ForkEffect | SelectEffect | TakeEffect> {
  let previousState: StateType = yield select(state => state);

  // We need to observe every action to guarantee the observer will detect all state changes.
  // This means we have to eventually process actions even while other sagas are blocked; hence
  // the channel.
  const channel = yield actionChannel('*', buffers.expanding<Action>(100));

  while(true) {
    const currentState: StateType = yield select(state => state);

    if (definition.until(currentState)) {
      return;
    }

    if (
      currentState != previousState &&
      definition.condition(previousState, currentState)
    ) {
      if (definitionHasArgs(definition)) {
        yield fork(definition.saga, definition.args(previousState, currentState));
      } else {
        yield fork(definition.saga);
      }

    }

    previousState = currentState;

    yield take(channel);
  }
}

function definitionHasArgs<StateType, SagaArgType>(
  definition: RunWhenDefinition<StateType, SagaArgType>
): definition is RunWhenWithArgsAndSagaDefinition<StateType, SagaArgType> {
  return 'args' in definition;
}
