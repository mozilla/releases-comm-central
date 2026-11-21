/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Support for mailnews tests that need to hook into the alerts system without
 * showing any UI.
 *
 * Mocks nsIWindowWatcher::getNewPrompter, the prompt service and the mailnews
 * auth prompt, and forwards each call to a handler supplied by the test:
 *
 *   AlertTestUtils.register({
 *     alert(title, text) {},
 *     confirmExPS(parent, title, text, ...rest) {
 *       return 0;
 *     },
 *   });
 *
 * nsIPrompt calls go to handlers named after the interface method (`alert`,
 * `confirmEx`, ...). nsIPromptService calls go to the same name with a `PS`
 * suffix (`alertPS`, `confirmExPS`, ...). Calling a method that has no
 * handler fails the test.
 */

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { MockRegistrar } from "resource://testing-common/MockRegistrar.sys.mjs";

const LoginInfo = Components.Constructor(
  "@mozilla.org/login-manager/loginInfo;1",
  "nsILoginInfo",
  "init"
);

/**
 * Forwards prompt calls to the handlers supplied by the test.
 */
class HandlerDispatcher {
  /** @type {{[name: string]: Function}} */
  handlers = {};

  /**
   * @param {string} name - The handler to call.
   * @param {string} text - The prompt text, used if the handler is missing.
   * @param {Array} args - The arguments to pass to the handler.
   * @returns {any} The handler's return value.
   */
  call(name, text, args) {
    if (typeof this.handlers[name] != "function") {
      Assert.ok(
        false,
        `${name} should not be called without a handler: ${text}`
      );
    }
    return this.handlers[name](...args);
  }
}

/**
 * nsIPrompt mock, forwarding to handlers named after each method.
 */
class MockPrompter {
  QueryInterface = ChromeUtils.generateQI(["nsIPrompt"]);

  #dispatcher;

  /**
   * @param {HandlerDispatcher} dispatcher
   */
  constructor(dispatcher) {
    this.#dispatcher = dispatcher;
  }

  /**
   * @param {string} name - The nsIPrompt method that was called.
   * @param {Array} args - Its arguments, with the prompt text second.
   * @returns {any} The handler's return value.
   */
  #call(name, args) {
    return this.#dispatcher.call(name, args[1], args);
  }

  /**
   * @param {...any} args - The nsIPrompt.alert arguments.
   * @returns {any} The handler's return value.
   */
  alert(...args) {
    return this.#call(this.alert.name, args);
  }

  /**
   * @param {...any} args - The nsIPrompt.alertCheck arguments.
   * @returns {any} The handler's return value.
   */
  alertCheck(...args) {
    return this.#call(this.alertCheck.name, args);
  }

  /**
   * @param {...any} args - The nsIPrompt.confirm arguments.
   * @returns {any} The handler's return value.
   */
  confirm(...args) {
    return this.#call(this.confirm.name, args);
  }

  /**
   * @param {...any} args - The nsIPrompt.confirmCheck arguments.
   * @returns {any} The handler's return value.
   */
  confirmCheck(...args) {
    return this.#call(this.confirmCheck.name, args);
  }

  /**
   * @param {...any} args - The nsIPrompt.confirmEx arguments.
   * @returns {any} The handler's return value.
   */
  confirmEx(...args) {
    return this.#call(this.confirmEx.name, args);
  }

  /**
   * @param {...any} args - The nsIPrompt.prompt arguments.
   * @returns {any} The handler's return value.
   */
  prompt(...args) {
    return this.#call(this.prompt.name, args);
  }

  /**
   * @param {...any} args - The nsIPrompt.promptUsernameAndPassword arguments.
   * @returns {any} The handler's return value.
   */
  promptUsernameAndPassword(...args) {
    return this.#call(this.promptUsernameAndPassword.name, args);
  }

  /**
   * @param {...any} args - The nsIPrompt.promptPassword arguments.
   * @returns {any} The handler's return value.
   */
  promptPassword(...args) {
    return this.#call(this.promptPassword.name, args);
  }

  /**
   * @param {...any} args - The nsIPrompt.select arguments.
   * @returns {any} The handler's return value.
   */
  select(...args) {
    return this.#call(this.select.name, args);
  }
}

/**
 * nsIPromptService mock, forwarding to handlers named after each method with
 * a `PS` suffix.
 */
class MockPromptService {
  QueryInterface = ChromeUtils.generateQI([
    "nsIPromptService",
    "nsIPromptService2",
  ]);

  #dispatcher;

  /**
   * @param {HandlerDispatcher} dispatcher
   */
  constructor(dispatcher) {
    this.#dispatcher = dispatcher;
  }

  /**
   * @param {string} name - The nsIPromptService method that was called.
   * @param {Array} args - Its arguments, with the prompt text third.
   * @returns {any} The handler's return value.
   */
  #call(name, args) {
    return this.#dispatcher.call(`${name}PS`, args[2], args);
  }

  /**
   * @param {...any} args - The nsIPromptService.alert arguments.
   * @returns {any} The handler's return value.
   */
  alert(...args) {
    return this.#call(this.alert.name, args);
  }

  /**
   * @param {...any} args - The nsIPromptService.alertCheck arguments.
   * @returns {any} The handler's return value.
   */
  alertCheck(...args) {
    return this.#call(this.alertCheck.name, args);
  }

  /**
   * @param {...any} args - The nsIPromptService.confirm arguments.
   * @returns {any} The handler's return value.
   */
  confirm(...args) {
    return this.#call(this.confirm.name, args);
  }

  /**
   * @param {...any} args - The nsIPromptService.confirmCheck arguments.
   * @returns {any} The handler's return value.
   */
  confirmCheck(...args) {
    return this.#call(this.confirmCheck.name, args);
  }

  /**
   * @param {...any} args - The nsIPromptService.confirmEx arguments.
   * @returns {any} The handler's return value.
   */
  confirmEx(...args) {
    return this.#call(this.confirmEx.name, args);
  }

  /**
   * @param {...any} args - The nsIPromptService.prompt arguments.
   * @returns {any} The handler's return value.
   */
  prompt(...args) {
    return this.#call(this.prompt.name, args);
  }

  /**
   * @param {...any} args - The nsIPromptService.promptUsernameAndPassword arguments.
   * @returns {any} The handler's return value.
   */
  promptUsernameAndPassword(...args) {
    return this.#call(this.promptUsernameAndPassword.name, args);
  }

  /**
   * @param {...any} args - The nsIPromptService.promptPassword arguments.
   * @returns {any} The handler's return value.
   */
  promptPassword(...args) {
    return this.#call(this.promptPassword.name, args);
  }

  /**
   * @param {...any} args - The nsIPromptService.select arguments.
   * @returns {any} The handler's return value.
   */
  select(...args) {
    return this.#call(this.select.name, args);
  }
}

/**
 * nsIWindowWatcher mock, handing out the mock prompter and the real login
 * manager auth prompter.
 */
class MockWindowWatcher {
  QueryInterface = ChromeUtils.generateQI(["nsIWindowWatcher"]);

  #prompter;

  /**
   * @param {MockPrompter} prompter
   */
  constructor(prompter) {
    this.#prompter = prompter;
  }

  /**
   * @returns {MockPrompter}
   */
  getNewPrompter() {
    return this.#prompter;
  }

  /**
   * @returns {nsIAuthPrompt} The real login manager auth prompter.
   */
  getNewAuthPrompter() {
    return Cc["@mozilla.org/login-manager/authprompter;1"].getService(
      Ci.nsIAuthPrompt
    );
  }
}

/**
 * Mailnews auth prompt mock. Calls the promptPasswordPS and
 * promptUsernameAndPasswordPS handlers directly, rather than through the
 * prompt service, because the prompt service's signature no longer allows a
 * "save password" check box.
 */
class MockMsgAuthPrompt {
  QueryInterface = ChromeUtils.generateQI(["nsIAuthPrompt"]);

  #dispatcher;

  /**
   * @param {HandlerDispatcher} dispatcher
   */
  constructor(dispatcher) {
    this.#dispatcher = dispatcher;
  }

  /**
   * @param {string} dialogTitle
   * @param {string} text
   * @param {string} passwordRealm - The realm the login is saved under.
   * @param {integer} savePassword - Unused, an nsIAuthPrompt SAVE_PASSWORD_*
   *   constant.
   * @param {{value: string}} username - Set to the entered username.
   * @param {{value: string}} password - Set to the entered password.
   * @returns {boolean} Whether the prompt was accepted.
   */
  promptUsernameAndPassword(
    dialogTitle,
    text,
    passwordRealm,
    savePassword,
    username,
    password
  ) {
    const checkBox = { value: false };
    const ok = this.#dispatcher.call("promptUsernameAndPasswordPS", text, [
      null,
      dialogTitle,
      text,
      username,
      password,
      null,
      checkBox,
    ]);
    if (ok && checkBox.value) {
      const { origin, realm } = this.#getRealmInfo(passwordRealm);
      this.#saveLogin(origin, realm, username.value, password.value);
    }
    return ok;
  }

  /**
   * @param {string} dialogTitle
   * @param {string} text
   * @param {string} passwordRealm - The realm the login is saved under, with
   *   the username in its user info.
   * @param {integer} savePassword - Unused, an nsIAuthPrompt SAVE_PASSWORD_*
   *   constant.
   * @param {{value: string}} password - Set to the entered password.
   * @returns {boolean} Whether the prompt was accepted.
   */
  promptPassword(dialogTitle, text, passwordRealm, savePassword, password) {
    const checkBox = { value: false };
    const ok = this.#dispatcher.call("promptPasswordPS", text, [
      null,
      dialogTitle,
      text,
      password,
      null,
      checkBox,
    ]);
    if (ok && checkBox.value) {
      const { origin, realm, username } = this.#getRealmInfo(passwordRealm);
      this.#saveLogin(
        origin,
        realm,
        decodeURIComponent(username),
        password.value
      );
    }
    return ok;
  }

  /**
   * @param {string} realmString - A URI, or an HTTP realm such as
   *   "host (realm)" for which no login is saved.
   * @returns {{origin: ?string, realm: ?string, username: ?string}}
   */
  #getRealmInfo(realmString) {
    // An HTTP realm such as "host (realm)" isn't a URI, so there's no origin
    // to save a login for. Without an origin, the caller saves nothing.
    if (/^.+ \(.+\)$/.test(realmString)) {
      return { origin: null, realm: null, username: null };
    }

    const uri = Services.io.newURI(realmString);
    const origin = `${uri.scheme}://${uri.displayHostPort}`;
    const pathname = uri.pathQueryRef == "/" ? "" : uri.pathQueryRef;
    return { origin, realm: origin + pathname, username: uri.username };
  }

  /**
   * Save a login, unless the origin or password is missing.
   *
   * @param {?string} origin
   * @param {?string} realm
   * @param {string} username
   * @param {string} password
   */
  #saveLogin(origin, realm, username, password) {
    if (!origin || !password) {
      return;
    }
    Services.logins.addLoginAsync(
      new LoginInfo(origin, null, realm, username, password)
    );
    Services.tm.spinEventLoopUntilEmpty();
  }
}

export class AlertTestUtils {
  static #dispatcher = new HandlerDispatcher();
  static #promptService = new MockPromptService(this.#dispatcher);
  static #mocks = new Map([
    [
      "@mozilla.org/embedcomp/window-watcher;1",
      new MockWindowWatcher(new MockPrompter(this.#dispatcher)),
    ],
    [
      "@mozilla.org/messenger/msgAuthPrompt;1",
      new MockMsgAuthPrompt(this.#dispatcher),
    ],
    ["@mozilla.org/prompter;1", this.#promptService],
  ]);
  static #mockCIDs = [];
  static #originalPromptService = null;

  /**
   * Replace the prompt services with mocks that forward to `handlers`.
   *
   * @param {{[name: string]: Function}} handlers - Handlers keyed by method
   *   name, e.g. `alert`, `confirmExPS`, `promptPasswordPS`. The object is
   *   kept by reference, so handlers can be added or replaced later.
   */
  static register(handlers) {
    this.#dispatcher.handlers = handlers;
    this.#originalPromptService = Services.prompt;
    this.#mockCIDs = Array.from(this.#mocks, ([contractID, mock]) =>
      MockRegistrar.register(contractID, mock)
    );
    Services.prompt = this.#promptService;
  }

  /**
   * Restore the real prompt services.
   */
  static cleanup() {
    for (const cid of this.#mockCIDs) {
      MockRegistrar.unregister(cid);
    }
    this.#mockCIDs = [];
    Services.prompt = this.#originalPromptService;
    this.#dispatcher.handlers = {};
  }
}
