# redux-saga-observer

![Community Supported](https://img.shields.io/badge/Support%20Level-Community%20Supported-457387.svg)

redux-saga-observer is a library that provides observer patterns to redux-sagas in powerful abstractions.

* [Why redux-saga-observer?]()
    * [Managing concurrency]()
# Why redux-saga-observer?

[redux-saga](https://github.com/redux-saga/redux-saga) is a powerful set of abstractions for managing asynchronous side effects in redux applications. However, a number of things are either difficult or obtuse in the base library. In particular:

* Handling concurrency that may update the redux store in ways your sagas must handle.
* Sometimes you want to so things when the state changes rather than worry about why it changed.

Observers help us out in both cases.

## Managing concurrency
