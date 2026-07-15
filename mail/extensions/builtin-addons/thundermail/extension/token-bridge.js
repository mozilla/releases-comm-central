const PING = 'TB/PING';
const BRIDGE_PING = 'APP/PING';
const BRIDGE_READY = 'TB/BRIDGE_READY';
const OIDC_USER = 'TB/OIDC_USER';
const OIDC_TOKEN = 'TB/OIDC_TOKEN';
const SIGN_IN_COMPLETE = 'SIGN_IN_COMPLETE';
const SIGN_OUT = 'SIGN_OUT';
const SEND_MESSAGE_TO_BRIDGE = 'SEND_MESSAGE_TO_BRIDGE';
const GET_LOGIN_STATE = 'GET_LOGIN_STATE';
const LOGIN_STATE_RESPONSE = 'LOGIN_STATE_RESPONSE';
const SIGN_IN = 'SIGN_IN';
const FORCE_CLOSE_WINDOW = 'FORCE_CLOSE_WINDOW';
const OPEN_MANAGEMENT_PAGE = 'OPEN_MANAGEMENT_PAGE';
// Add-On to Web — request/response pair for fetching the staged OIDC token set.
// The web page cannot call browser.storage.local directly, so it asks the
// background script to read it on its behalf via these two message types:
//   GET_PENDING_ADDON_TOKEN  : web page → bridge → background  ("give me the token")
//   PENDING_ADDON_TOKEN_RESPONSE : background → bridge → web page ("here it is")
const GET_PENDING_ADDON_TOKEN = 'TB/GET_PENDING_ADDON_TOKEN';
const PENDING_ADDON_TOKEN_RESPONSE = 'TB/PENDING_ADDON_TOKEN_RESPONSE';
// Telemetry pref bridge (issue #952). The hosted Send dashboard cannot call the
// browser.thundermailTelemetry experiment API, so it asks the background for the pref:
//   GET_TELEMETRY_STATE      : web page → bridge → background
//   TELEMETRY_STATE_RESPONSE : background → bridge → web page
//   TELEMETRY_STATE_CHANGED  : background → bridge → web page (runtime change)
const GET_TELEMETRY_STATE = 'TB/GET_TELEMETRY_STATE';
const TELEMETRY_STATE_RESPONSE = 'TB/TELEMETRY_STATE_RESPONSE';
const TELEMETRY_STATE_CHANGED = 'TB/TELEMETRY_STATE_CHANGED';

window.postMessage({ type: BRIDGE_READY }, window.location.origin);
console.log(`[🌉 token-bridge] the token bridge has loaded.`);

// Initial message to the background
browser.runtime.sendMessage({
  type: PING,
  text: 'This got sent from the bridge to the background.',
});

window.addEventListener('message', (e) => {
  // Security: this bridge forwards messages straight to the privileged add-on
  // background (OIDC tokens, the encryption passphrase, sign-in/out). Only trust
  // messages the app page posted to itself:
  //   • e.source !== window  → came from an embedded/cross-origin frame or
  //     another window, not the top app page. Reject.
  //   • e.origin !== window.location.origin → not same-origin. Reject.
  // Combined with the scoped content_scripts `matches` in the manifest (the
  // bridge is only injected on the Send app's own origins), this keeps a
  // third-party page or frame from driving the add-on.
  if (e.source !== window) return;
  if (e.origin !== window.location.origin) return;

  // ----- Web to add-on: Step 6b — refresh token → background (Thundermail) -----
  // handleOIDCCallback() posts OIDC_TOKEN with the refresh_token so that
  // background.ts can create/update the Thundermail mail account.
  if (e?.data?.type === OIDC_TOKEN) {
    browser.runtime.sendMessage({
      type: OIDC_TOKEN,
      token: String(e.data.token ?? ''),
      email: String(e.data.email ?? ''),
      name: String(e.data.name ?? ''),
    });
  }

  // ----- Web to add-on: Step 6c — full User object → background (auth storage) -----
  // handleOIDCCallback() posts OIDC_USER with the full oidc-client-ts User so
  // background.ts can persist it in browser.storage.local[STORAGE_KEY_AUTH].
  // This is what loadUser() reads back later to re-hydrate the OIDC session
  // in the extension popup without requiring a new login.
  if (e?.data?.type === OIDC_USER) {
    const userData = e.data.user;

    if (userData && typeof userData === 'object') {
      browser.runtime.sendMessage({
        type: OIDC_USER,
        user: userData,
      });
    }
  }

  if (e?.data?.type === SIGN_IN) {
    browser.runtime.sendMessage({
      type: SIGN_IN,
    });
  }

  if (e?.data?.type === SIGN_IN_COMPLETE) {
    browser.runtime.sendMessage({
      type: SIGN_IN_COMPLETE,
    });
  }

  if (e?.data?.type === BRIDGE_PING) {
    browser.runtime.sendMessage({
      type: PING,
      text: String(e.data.text ?? ''),
    });
  }

  if (e?.data?.type === SEND_MESSAGE_TO_BRIDGE) {
    browser.runtime.sendMessage({
      type: SEND_MESSAGE_TO_BRIDGE,
      value: e.data.value,
    });
  }

  if (e?.data?.type === GET_LOGIN_STATE) {
    browser.runtime.sendMessage({
      type: GET_LOGIN_STATE,
    });
  }

  if (e?.data?.type === FORCE_CLOSE_WINDOW) {
    browser.runtime.sendMessage({
      type: FORCE_CLOSE_WINDOW,
    });
  }

  if (e?.data?.type === OPEN_MANAGEMENT_PAGE) {
    browser.runtime.sendMessage({
      type: OPEN_MANAGEMENT_PAGE,
    });
  }

  if (e?.data?.type === SIGN_OUT) {
    browser.runtime.sendMessage({
      type: SIGN_OUT,
    });
  }

  // ----- Add-On to Web: fetch staged token from background -----
  // Step 4 of the Add-On to Web flow.
  // The /addon-auth web page posts this to ask the background script to read
  // PENDING_ADDON_TOKEN out of browser.storage.local on its behalf.
  // The background will respond with PENDING_ADDON_TOKEN_RESPONSE (see below).
  if (e?.data?.type === GET_PENDING_ADDON_TOKEN) {
    browser.runtime.sendMessage({
      type: GET_PENDING_ADDON_TOKEN,
    });
  }

  // ----- Web to add-on: hosted dashboard asks for the telemetry pref -----
  // The background returns the state as the sendMessage response (scoped to
  // this tab), which we relay back to the page. It answers only for our own
  // Send tabs, so a non-Send page gets no response and the page fails closed.
  if (e?.data?.type === GET_TELEMETRY_STATE) {
    browser.runtime
      .sendMessage({ type: GET_TELEMETRY_STATE })
      .then((response) => {
        if (response?.type === TELEMETRY_STATE_RESPONSE) {
          window.postMessage(
            { type: TELEMETRY_STATE_RESPONSE, enabled: response.enabled },
            window.location.origin
          );
        }
      })
      .catch(() => {
        // No handler / not our tab — the page-side timeout fails closed.
      });
  }
});

// Listen for responses from background script and forward to web app
browser.runtime.onMessage.addListener((message) => {
  if (message.type === LOGIN_STATE_RESPONSE) {
    window.postMessage(
      {
        type: LOGIN_STATE_RESPONSE,
        isLoggedIn: message.isLoggedIn,
        username: message.username,
      },
      window.location.origin
    );
  }

  // Forward an OIDC token obtained by the background (e.g. from the Accounts Hub)
  // to the web app so it can log the user in automatically.
  if (message.type === OIDC_TOKEN) {
    window.postMessage(
      {
        type: OIDC_TOKEN,
        token: message.token,
        email: message.email,
        name: message.name,
      },
      window.location.origin
    );
  }

  // ----- Add-On to Web: return staged token to the web page -----
  // Step 5 of the Add-On to Web flow.
  // The background has read PENDING_ADDON_TOKEN from storage and sends it here.
  // We forward it to the /addon-auth page so authenticateWithAddonToken()
  // can resolve its Promise and proceed with authentication.
  if (message.type === PENDING_ADDON_TOKEN_RESPONSE) {
    window.postMessage(
      {
        type: PENDING_ADDON_TOKEN_RESPONSE,
        tokenSet: message.tokenSet,
      },
      window.location.origin
    );
  }

  // ----- Add-on to Web: telemetry runtime change (issue #952) -----
  // The GET_TELEMETRY_STATE reply is handled inline as the sendMessage
  // response above; here we only forward unsolicited runtime changes the
  // background broadcasts to our Send tabs.
  if (message.type === TELEMETRY_STATE_CHANGED) {
    window.postMessage(
      {
        type: TELEMETRY_STATE_CHANGED,
        enabled: message.enabled,
      },
      window.location.origin
    );
  }
});
