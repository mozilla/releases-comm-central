# Memory Leak Detection

Using memory and not giving it up is not a good idea. Several parts of the automated testing can
catch you:

## Leak check error messages

Debug builds automatically track references to objects and the test logs will tell you off if you
are doing something bad:

* `WARNING: YOU ARE LEAKING THE WORLD (at least one JSRuntime and everything alive inside it, that
  is) AT JS_ShutDown TIME. FIX THIS!`
* `TEST-UNEXPECTED-FAIL | leakcheck large nsGlobalWindowInner | path/to/test/browser/browser.ini`
* `TEST-UNEXPECTED-FAIL | leakcheck large BackstagePass | path/to/test/browser/browser.ini`
* `TEST-UNEXPECTED-FAIL | leakcheck | default NNNNNN bytes leaked`

If your patch causes the tests to produce one or more of these errors, congratulations, you're
leaking some memory! This means you've created an object and somehow prevented it from being
destroyed. In our code this typically means:

* You've opened a window (not necessarily a top-level window, it could be a page in a browser
  element) and are still holding onto it after it closed.
* You've passed something to a module (.sys.mjs) and the module is holding onto it.
* You've called `Services.obs.addObserver` or `Services.prefs.addObserver` and forgotten to remove
  the observer.
* You've passed something to some other XPCOM object and that is holding onto it.
* You've done bad things with C++.

The first three of these error messages are reporting something _specifically_ wrong that happened,
e.g. a window was leaked. The other message means that, in general, too many things happened and the
amount of memory leaked was above a threshold. Any leaks that total over 50kB will be reported as a
failure. There's actually quite a lot you can leak below this amount, and we still have some
permanent leaks below 50kB. The threshold is defined in
testing/mozharness/configs/unittests/thunderbird_extra.py.

The Firefox source documentation has [way more information] about this logging.

[way more information]: https://firefox-source-docs.mozilla.org/performance/memory/bloatview.html

## Detached windows test

The in-product memory reporting tools can tell us if there are windows that have been opened and
closed, but cannot be removed from memory because something is holding on to them. These are known
as "detached windows", and we have a test which proves that certain actions do not lead to a
detached window.

`browser_detachedWindows.js` opens common windows (e.g. the composer window), closes them again,
and checks that the number of detached windows is still zero. Feel free to add other actions.

## Code coverage

(This is a weird side-effect of memory leaking and it's not expected that you'd notice.)

If you use a window and fail to clean it up, any code coverage data for that window will not be
recorded. So sudden dips in the code coverage numbers can indicate a memory leak problem.
Additionally, if you're writing a test for some newly added code (as you should) and it doesn't
appear to be covered, this could be why.
