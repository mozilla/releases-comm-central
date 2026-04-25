# C++ Reference

This page is a grab bag of useful links to C++ documentation in the Mozilla source docs or in the source code itself.

This will grow and gain organisation, so please add any links you find useful!

## Miscellaneous

- [Using C++ in Mozilla code](https://firefox-source-docs.mozilla.org/code-quality/coding-style/using_cxx_in_firefox_code.html#c-and-mozilla-standard-libraries) - general C++ coding guidelines.
- [XPIDL](https://firefox-source-docs.mozilla.org/xpcom/xpidl.html) - details for XPCOM IDL files (e.g. how the types map between IDL, C++, Rust and JS).
- [{fmt} in Gecko](https://firefox-source-docs.mozilla.org/xpcom/fmt-in-gecko.html) - An implementation of C++20’s `std::format` formatting API, with some extra Mozilla goodies.
- [GTests](https://firefox-source-docs.mozilla.org/gtest/index.html) - Unit tests for C++.

## Data structures

- [String Guide](https://firefox-source-docs.mozilla.org/xpcom/stringguide.html) - `nsString` vs `nsCString` vs `nsACString` et al.
- [C++ and Mozilla standard libraries](https://firefox-source-docs.mozilla.org/code-quality/coding-style/using_cxx_in_firefox_code.html#c-and-mozilla-standard-libraries) - Guidelines for using standard C++ containers and libraries.
- [nsTArray](https://searchfox.org/firefox-main/source/xpcom/ds/nsTArray.h#99) - Analogous to `std::vector`.
- [HashMap](https://searchfox.org/firefox-main/source/mfbt/HashTable.h#125) and [HashSet](https://searchfox.org/firefox-main/source/mfbt/HashTable.h#453), both built on top of [HashTable](https://searchfox.org/firefox-main/source/mfbt/HashTable.h) (examples in [GTest](https://searchfox.org/firefox-main/source/mfbt/tests/TestHashTable.cpp)).
  Probably prefer these to `nsTHashMap`/`nsTHashSet`, which use a lot more virtual calls and less templating/inlining.
- [Span](https://searchfox.org/firefox-main/source/mfbt/Span.h#301) - A Slice type for C++ (examples in [GTest](https://searchfox.org/firefox-main/source/mfbt/tests/gtest/TestSpan.cpp)).

## Utility

- [Result](https://searchfox.org/firefox-main/source/mfbt/Result.h#474) - Analogous to Rust `Result<>` (examples in [GTest](https://searchfox.org/firefox-main/source/mfbt/tests/TestResult.cpp)).
- [Maybe](https://searchfox.org/firefox-main/source/mfbt/Maybe.h#315) - Analogous to Rust `Option<>` or C++ std::optional<T> (examples in [GTest](https://searchfox.org/firefox-main/source/mfbt/tests/TestMaybe.cpp)).
- [ScopeExit](https://searchfox.org/firefox-main/source/mfbt/ScopeExit.h) - An RAII guard to automatically handle scoped cleanup.
- [MozPromise](https://firefox-source-docs.mozilla.org/xpcom/mozpromise.html) - Promises for C++.
