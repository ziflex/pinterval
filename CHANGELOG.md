# CHANGELOG

## 4.0.0 (Unreleased)
### Breaking Changes
- **Changed default start mode for polling functions**: The `poll`, `until`, and `times` functions now default to `'immediate'` start mode instead of `'delayed'`. This means the first execution happens immediately rather than after the first timeout period. To restore the previous behavior, explicitly pass `'delayed'` as the start mode parameter.
  - `poll(predicate, timeout)` now executes immediately by default
  - `until(predicate, timeout)` now executes immediately by default  
  - `times(predicate, amount, timeout)` now executes immediately by default
  - This makes these functions consistent with `retry` and `pipeline` which already defaulted to `'immediate'`

## 3.4.0
### Added
- ``pipeline`` helper function.

## 3.3.0
### Added
- Support of dynamic interval duration by providing duration factory function.

## 3.2.0
### Added
- ``until`` helper function.
### Changed
- Updated dependencies

## 3.1.0
### Added
- Possibility to stop Interval when a function returns "false"
- ``poll``, ``times`` and ``sleep`` helper functions.

## 3.0.0
### Changed
- Updated dependencies

## 2.0.1
### Changed
- Updated dev dependencies

## 2.0.0
### Added
- Async error handler

### Changed
- Async function must return a promise.