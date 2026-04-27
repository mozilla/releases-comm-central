# Test Helpers

There are a lot of utilities for writing JavaScript tests. This document wants
to highlight those you should use in new tests.

## From Firefox

- [TestUtils](https://firefox-source-docs.mozilla.org/testing/testutils.html) - This is always available in mochitests, but needs to be explicitly imported from `resource://testing-common/TestUtils.sys.mjs` in xpcshell tests.
- [EventUtils](https://firefox-source-docs.mozilla.org/testing/eventutils.html) - This is always available in mochitests.
- [BrowserTestUtils](https://firefox-source-docs.mozilla.org/testing/browser-chrome/browsertestutils.html) - This is always available in mochitests.
- [SimpleTest.promiseFocus](https://firefox-source-docs.mozilla.org/testing/simpletest.html#SimpleTest.promiseFocus) and also `SimpleTest.requestCompleteLog` [for debugging](https://firefox-source-docs.mozilla.org/testing/mochitest-plain/faq.html#how-can-i-get-the-full-log-output-for-my-test-in-automation-for-debugging).
- [SpecialPowers](https://searchfox.org/firefox-main/source/testing/specialpowers/content/SpecialPowersParent.sys.mjs) - especially `pushPrefEnv` in mochitests and `SpecialPowers.MockColorPicker`.
- [MockFilePicker](https://searchfox.org/firefox-main/source/testing/specialpowers/content/MockFilePicker.sys.mjs) - `resource://testing-common/MockFilePicker.sys.mjs`
- [MockRegistrar](https://searchfox.org/firefox-main/source/testing/modules/MockRegistrar.sys.mjs) - `resource://testing-common/MockRegistrar.sys.mjs`; replace an XPCOM component for a test.
- [HttpServer](https://firefox-source-docs.mozilla.org/networking/http_server_for_testing.html)

## Thunderbird Specific

All of these need to be imported in tests when needed. None of these have links,
since there's no documentation apart from usage examples in existing tests and
the implementation itself.

- CalendarTestUtils - `resource://testing-common/calendar/CalendarTestUtils.sys.mjs`
- ServerTestUtils - `resource://testing-common/mailnews/ServerTestUtils.sys.mjs`; of course sometimes you also just want one of the individual servers this uses.
- NetworkTestUtils - `resource://testing-common/mailnews/NetworkTestUtils.sys.mjs`; add a redirect at any domain to a local test server.
- HttpsServer - `resource://testing-common/mailnews/HttpsProxy.sys.mjs`; add an HTTPS proxy in front of a local test server.
- PromiseTestUtils - `resource://testing-common/mailnews/PromiseTestUtils.sys.mjs`; converts some common transactions to a promise.
- MailTestUtils - `resource://testing-common/mailnews/MailTestUtils.sys.mjs`
- OAuth2TestUtils - `resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs`
- MockExternalProtocolService - `resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs`; intercept opening protocols that aren't handled internally.
- MockAlertsService - `resource://testing-common/mailnews/MockAlertsService.sys.mjs`
