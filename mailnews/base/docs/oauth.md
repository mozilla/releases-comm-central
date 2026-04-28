# OAuth

Thunderbird supports OAuth2 authentication for mail, address book, and calendar servers. This
document won't go into the details of how OAuth2 works, see [this website](https://oauth.net/2/)
for (a lot) more information.

## Providers

Thunderbird has built-in credentials and endpoint information for the major email providers. For
other services, this data can be added with an add-on using the [oauthProvider API][provider api].

To check if Thunderbird can offer to authenticate with a service, either using a built-in provider
or an add-on, call `OAuth2Providers.getHostnameDetails`. If the function returns a value,
Thunderbird has the data it needs, otherwise it will return `undefined`.

```{note}
Add-ons that connect to outside services should instead use the [identity webextension API][identity api].
```

## Obtaining an access token

Create a new `OAuth2Module` object, either from the JS module directly, or via XPCOM. Call one
of the `initFrom` functions to initialize it — this will return `true` if the provider data exists
or `false` if it doesn't. Then call either `connect` (for an SASL XOAUTH2 formatted token) or
`getAccessToken` (for just the raw access token).

```js
const oAuth2 = new OAuth2Module();
if (!oAuth2.initFromHostname("hostname", "carddav") {
  // Failed to find the needed information for the hostname and service type given.
  return;
}

await oAuth2.getAccessToken({
  onSuccess(accessToken) {
    // Successfully authenticated and obtained an access token.
  },
  onFailure(error) {
    // Something went wrong.
  },
});
```

These few function calls hide a lot of complexity:

- checking to see if Thunderbird has the credentials and endpoint information it needs;
- looking for an existing refresh token in the logins store;
- presenting the authentication provider's login page to the user;
- assuming the user authenticates and grants access, obtaining refresh and access tokens from the
  provider;
- saving the refresh token to the logins store;
- and finally returning the access token.

## Authentication UI options

### Internal vs external authentication

Thunderbird can present the authentication provider's web pages in a pop-up window or, as of
version 151, in the user's default browser. We refer to the former as "internal" and the latter as
"external". The preference `mailnews.oauth.useExternalBrowser` controls this choice.

There are advantages and disadvantages with each approach:

- Showing the page within Thunderbird avoids switching to another application (and back again),
  which can be jarring (especially if it happens with no warning) and offers chances for the user
  to get lost or sidetracked along the way.
- Internal requests keep us in control of the login session, so setting up multiple accounts is
  possible without having to juggle accounts in the browser.
- For an internal request all communication is directly between Thunderbird and the web server —
  there's no other applications involved — so this reduces the possibilities for credential theft.
  An external request uses another piece of software (the browser) and relies on trustworthy
  communication between it and Thunderbird.
- The user's browser is likely _already_ logged in, so using it to authenticate avoids the need for
  the user to log in again. Even if that was necessary, the browser's password manager and other
  login features are there to help.
- External requests are now common for applications (e.g. Slack) so it is a process many users are
  familiar with.
- Using an external browser prevents Thunderbird (or a security exploit in Thunderbird) from
  intercepting a username or password. This shifts the security burden to the browser, which is
  (hopefully) better equipped to deal with it. It also frees Thunderbird from the suspicion of
  stealing passwords.

### Private internal browser

Internal authentication uses Thunderbird's default browsing session, and this can be problematic
for some providers when authenticating multiple accounts (e.g. if cookies tell the web server that
a user is already logged in). If `mailnews.oauth.usePrivateBrowser` is set, a private browsing
session can be used instead.

We _could_ use a separate container (see Firefox's account containers feature) for each username,
in the same way Thunderbird's CalDAV and CardDAV implementations do, but this has not yet been
implemented.

[identity api]: https://webextension-api.thunderbird.net/en/latest/identity.html
[provider api]: https://webextension-api.thunderbird.net/en/latest/oauthProvider.html

## Request caching

If an authentication request matches an existing one (same username, same endpoint, matching
scopes), the existing request will be reused. This prevents multiple authentication prompts for the
same provider.

In most cases this is fine, but it is worth being aware of. Tests that authenticate multiple times
should call `OAuth2TestUtils.forgetObjects` if necessary.

## Testing

Testing a with bunch of external services can be complicated, so `OAuth2TestUtils` is here to help.
To test the authentication flow using an internal request, it's necessary to use a Mochitest
(because we have to display the authentication form and fill it in). For anything else an XPCShell
test should be sufficient.

A basic test of an internal authentication looks like this.

```js
// Start the server:
await OAuth2TestUtils.startServer();

// Begin authentication:
const oAuthPromise = OAuth2TestUtils.promiseOAuthWindow();
/* [Add the code that triggers authentication.] */
const oAuthWindow = await oAuthPromise;

// Fill in and submit the authentication form:
await SpecialPowers.spawn(
  oAuthWindow.getBrowser(),
  [{ expectedHint: "user", username: "user", password: "password" }], // submitOAuthLogin arguments
  OAuth2TestUtils.submitOAuthLogin
);

/* [Add the code that uses the service you're testing.] */

// Stop the server:
OAuth2TestUtils.stopServer();
```

An external request is similar:

```js
// Start the server:
await OAuth2TestUtils.startServer();

// Begin authentication:
const oAuthPromise = OAuth2TestUtils.promiseExternalOAuthURL();
/* [Add the code that triggers authentication.] */
const url = await oAuthPromise;

// Simulate filling in and submitting the authentication form in the browser:
await OAuth2TestUtils.submitOAuthURL(url, {
  username: "user",
  password: "password",
});

/* [Add the code that uses the service you're testing.] */

// Stop the server:
OAuth2TestUtils.stopServer();
```

A number of variations are possible, mostly by modifying the mock server object. If you don't call
`stopServer`, it will automatically be cleaned up at the end of the test.

To validate an access token (e.g. in a mock mail server), call `OAuth2TestUtils.validateToken` with
the token and a scope you require for access. The existing mock mail servers already implement this,
if configured correctly.

```{note}
Please add `tags = ["oauth"]` to your test, in the test manifest. This helps us to easily run any
test that might be affected by changes to the OAuth code.
```

## Telemetry

Authentication requests, successful or otherwise, are recorded in Telemetry. We record:

- which authentication provider (requests to add-on defined providers are not recorded),
- the reason why the user is being asked to authenticate (e.g. missing or expired token),
- if the request succeeded, or why it failed (e.g. the user cancelled),
- where the user was asked to authenticate (in Thunderbird, or in a browser).

We aggregate this telemetry data and use it to determine whether there are issues with a provider
or our code that we need to respond to.
