/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["MsgAsyncPrompter"];

var { Deprecated } = ChromeUtils.import(
  "resource://gre/modules/Deprecated.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function runnablePrompter(asyncPrompter, hashKey) {
  this._asyncPrompter = asyncPrompter;
  this._hashKey = hashKey;
}

runnablePrompter.prototype = {
  _asyncPrompter: null,
  _hashKey: null,

  _promiseAuthPrompt(listener) {
    return new Promise((resolve, reject) => {
      try {
        listener.onPromptStartAsync({ onAuthResult: resolve });
      } catch (e) {
        if (e.result == Cr.NS_ERROR_XPC_JSOBJECT_HAS_NO_FUNCTION_NAMED) {
          // Fall back to onPromptStart, for add-ons compat
          Deprecated.warning(
            "onPromptStart has been replaced by onPromptStartAsync",
            "https://bugzilla.mozilla.org/show_bug.cgi?id=1176399"
          );
          let ok = listener.onPromptStart();
          resolve(ok);
        } else {
          reject(e);
        }
      }
    });
  },

  async run() {
    await Services.logins.initializationPromise;
    this._asyncPrompter._log.debug("Running prompt for " + this._hashKey);
    let prompter = this._asyncPrompter._pendingPrompts[this._hashKey];
    let ok = false;
    try {
      ok = await this._promiseAuthPrompt(prompter.first);
    } catch (ex) {
      Cu.reportError("runnablePrompter:run: " + ex + "\n");
      prompter.first.onPromptCanceled();
    }

    delete this._asyncPrompter._pendingPrompts[this._hashKey];

    for (var consumer of prompter.consumers) {
      try {
        if (ok) {
          consumer.onPromptAuthAvailable();
        } else {
          consumer.onPromptCanceled();
        }
      } catch (ex) {
        // Log the error for extension devs and others to pick up.
        Cu.reportError(
          "runnablePrompter:run: consumer.onPrompt* reported an exception: " +
            ex +
            "\n"
        );
      }
    }
    this._asyncPrompter._asyncPromptInProgress--;

    this._asyncPrompter._log.debug(
      "Finished running prompter for " + this._hashKey
    );
    this._asyncPrompter._doAsyncAuthPrompt();
  },
};

function MsgAsyncPrompter() {
  this._pendingPrompts = {};
  // By default, only log warnings to the error console
  // You can use the preference:
  //   msgAsyncPrompter.loglevel
  // To change this up.  Values should be one of:
  //   Fatal/Error/Warn/Info/Config/Debug/Trace/All
  this._log = console.createInstance({
    prefix: "mail.asyncprompter",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.asyncprompter.loglevel",
  });
}

MsgAsyncPrompter.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIMsgAsyncPrompter"]),

  _pendingPrompts: null,
  _asyncPromptInProgress: 0,
  _log: null,

  queueAsyncAuthPrompt(aKey, aJumpQueue, aCaller) {
    if (aKey in this._pendingPrompts) {
      this._log.debug(
        "Prompt bound to an existing one in the queue, key: " + aKey
      );
      this._pendingPrompts[aKey].consumers.push(aCaller);
      return;
    }

    this._log.debug("Adding new prompt to the queue, key: " + aKey);
    let asyncPrompt = {
      first: aCaller,
      consumers: [],
    };

    this._pendingPrompts[aKey] = asyncPrompt;
    if (aJumpQueue) {
      this._asyncPromptInProgress++;

      this._log.debug("Forcing runnablePrompter for " + aKey);

      let runnable = new runnablePrompter(this, aKey);
      Services.tm.mainThread.dispatch(runnable, Ci.nsIThread.DISPATCH_NORMAL);
    } else {
      this._doAsyncAuthPrompt();
    }
  },

  _doAsyncAuthPrompt() {
    if (this._asyncPromptInProgress > 0) {
      this._log.debug(
        "_doAsyncAuthPrompt bypassed - prompt already in progress"
      );
      return;
    }

    // Find the first prompt key we have in the queue.
    let hashKey = null;
    for (hashKey in this._pendingPrompts) {
      break;
    }

    if (!hashKey) {
      return;
    }

    this._asyncPromptInProgress++;

    this._log.debug("Dispatching runnablePrompter for " + hashKey);

    let runnable = new runnablePrompter(this, hashKey);
    Services.tm.mainThread.dispatch(runnable, Ci.nsIThread.DISPATCH_NORMAL);
  },
};
