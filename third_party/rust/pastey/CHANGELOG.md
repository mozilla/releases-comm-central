# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2026-05-20

### Improved

- Improved Branch Coverage [#34](https://github.com/AS1100K/pastey/pull/34)
- Improved Line Coverage [#32](https://github.com/AS1100K/pastey/pull/32)

## [0.2.2] - 2026-04-23

### Improved

- Improved Code Coverage [#28](https://github.com/AS1100K/pastey/pull/28), [#30](https://github.com/AS1100K/pastey/pull/30)

### Fixed

- Rust 1.56 compatibility: Handling None-delimited groups in replace modifier [#25](https://github.com/AS1100K/pastey/pull/25)

## [0.2.1] - 2025-12-16

### Added

- Support for idents and literals in replace modifier [#24](https://github.com/AS1100K/pastey/pull/24)

### Changed

- Excluded development scripts from the published cargo package [#23](https://github.com/AS1100K/pastey/pull/23)

## [0.2.0] - 2025-11-17

### Added

- `replace` modifier [#21](https://github.com/AS1100K/pastey/pull/21)

## [0.1.1] - 2025-08-12

### Removed

- `build.rs` and inline literal parsing logic [#16](https://github.com/AS1100K/pastey/pull/16)

## [0.1.0] - 2025-03-12

### Added

- Raw Mode in `paste!` macro [#8](https://github.com/AS1100K/pastey/pull/8)

## [v0.0.1]

### Added

- `lower_camel` case conversion modifier [#4](https://github.com/AS1100K/pastey/issues/4)
- `upper_camel` case conversion modifier, similar to `camel`
- `camel_edge` case coversion modifer [#3](https://github.com/AS1100K/pastey/issues/3)
- Internal crate `paste-compat` for testing behaviour against paste crate
