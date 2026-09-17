# Version 0.2.20 (2026-09-16)

 * Make const_new the default, and bump MSRV to 1.85. `const_new` feature is still available but does nothing.
 * Forbid ZSTs for gecko-ffi mode (#94).
 * Avoid allocating for ZSTs (#92).

# Version 0.2.19 (2026-07-26)

 * add may_dangle Drop impl under unstable feature
 * Use safe `Layout::from_size_align` (instead of unsafe `from_size_align_unchecked`), panicking with a capacity overflow if it fails.
 * Fix `shallow_size_of` for inline arrays.

# Versions 0.2.17 and 0.2.18 (2026-04-29)
* Fix compiling some feature combinations in no_std mode

# Version 0.2.16 (2026-04-14)
* Fix reserve() on auto arrays in gecko-ffi mode.
* Fix two double-drop issues with ThinVec::clear() and ThinVec::into_iter()
  when the Drop implementation of the item panics.

# Version 0.2.15 (2026-04-08)
* Support AutoTArrays created from Rust in Gecko FFI mode.
* Add extract_if.
* Add const new() support behind feature flag.
* Fix `thin_vec` macro not being hygienic when recursing
* Improve extend() performance.

# Version 0.2.14 (2025-03-23)
* Add "malloc_size_of" feature for heap size measurement support

# Version 0.2.13 (2023-12-02)

* add default-on "std" feature for no_std support
* added has_capacity method for checking if something is the empty singleton
* marked more things as `#[inline]`
* added license files
* appeased Clippy

# Previous Versions

*shrug*
