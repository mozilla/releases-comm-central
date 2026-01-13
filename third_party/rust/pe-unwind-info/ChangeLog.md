# Changelog

## [Unreleased]

## [0.6.0] - 2025-08-05
* Support version 2 `UNWIND_INFO` and `UWOP_EPILOG` opcodes.

## [0.5.0] - 2025-07-02
* Set the crate as `no_std` (the standard library isn't used at all). Thanks @WolverinDEV!

## [0.4.0] - 2025-06-09
* Update zerocopy, thiserror, and dev-dependencies. Thanks @mstange!

## [0.3.0] - 2024-08-27
* Update zerocopy and fix breaking conflicts when zerocopy has the `derive` feature enabled. Thanks
  @da2ce7!

## [0.2.3] - 2024-03-04
* Fix the scaling of 32-bit large allocation unwind operations. Thanks @ishitatsuyuki!

## [0.2.2] - 2024-02-29
* Chained unwind info was not correctly parsed, and is now fixed. Thanks @ishitatsuyuki!

## [0.2.1] - 2024-01-18
* Separate `zerocopy-derive` and `zerocopy` to improve build times. Add `zerocopy::Unaligned` to
  types.

## [0.2.0] - 2024-01-18
* Update zerocopy to 0.7.32.

## [0.1.1] - 2023-12-14
* Remove unsafe code ([#1](https://github.com/mozilla/pe-unwind-info/pull/1))

## [0.1.0] - 2023-07-25
* Initial release.

[Unreleased]: https://github.com/mozilla/pe-unwind-info/compare/0.6.0...HEAD
[0.6.0]: https://github.com/mozilla/pe-unwind-info/compare/0.5.0...0.6.0
[0.5.0]: https://github.com/mozilla/pe-unwind-info/compare/0.4.0...0.5.0
[0.4.0]: https://github.com/mozilla/pe-unwind-info/compare/0.3.0...0.4.0
[0.3.0]: https://github.com/mozilla/pe-unwind-info/compare/0.2.3...0.3.0
[0.2.3]: https://github.com/mozilla/pe-unwind-info/compare/0.2.2...0.2.3
[0.2.2]: https://github.com/mozilla/pe-unwind-info/compare/0.2.1...0.2.2
[0.2.1]: https://github.com/mozilla/pe-unwind-info/compare/0.2.0...0.2.1
[0.2.0]: https://github.com/mozilla/pe-unwind-info/compare/0.1.1...0.2.0
[0.1.1]: https://github.com/mozilla/pe-unwind-info/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/mozilla/pe-unwind-info/releases/tag/0.0.1
