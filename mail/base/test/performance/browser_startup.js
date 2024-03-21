/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/* This test records at which phase of startup the JS modules are first
 * loaded.
 * If you made changes that cause this test to fail, it's likely because you
 * are loading more JS code during startup.
 * Most code has no reason to run off of the app-startup notification
 * (this is very early, before we have selected the user profile, so
 *  preferences aren't accessible yet).
 * If your code isn't strictly required to show the first browser window,
 * it shouldn't be loaded before we are done with first paint.
 * Finally, if your code isn't really needed during startup, it should not be
 * loaded before we have started handling user events.
 */

"use strict";

/* Set this to true only for debugging purpose; it makes the output noisy. */
const kDumpAllStacks = false;

const startupPhases = {
  // For app-startup, we have an allowlist of acceptable JS files.
  // Anything loaded during app-startup must have a compelling reason
  // to run before we have even selected the user profile.
  // Consider loading your code after first paint instead,
  // eg. from MailGlue.sys.mjs' _onFirstWindowLoaded method).
  "before profile selection": {
    allowlist: {
      modules: new Set([
        "resource:///modules/MailGlue.sys.mjs",
        "resource:///modules/StartupRecorder.sys.mjs",
        "resource://gre/modules/ActorManagerParent.sys.mjs",
        "resource://gre/modules/AppConstants.sys.mjs",
        "resource://gre/modules/CustomElementsListener.sys.mjs",
        "resource://gre/modules/MainProcessSingleton.sys.mjs",
        "resource://gre/modules/XPCOMUtils.sys.mjs",
      ]),
    },
  },

  // For the following phases of startup we have only a list of files that
  // are **not** allowed to load in this phase, as too many other scripts
  // load during this time.

  // We are at this phase after creating the first browser window (ie. after final-ui-startup).
  "before opening first browser window": {
    denylist: {
      modules: new Set([
        "chrome://openpgp/content/modules/constants.sys.mjs",
        "resource:///modules/IMServices.sys.mjs",
        "resource:///modules/imXPCOMUtils.sys.mjs",
        "resource:///modules/jsProtoHelper.sys.mjs",
        "resource:///modules/logger.sys.mjs",
        "resource:///modules/MailNotificationManager.sys.mjs",
        "resource:///modules/MailNotificationService.sys.mjs",
        "resource:///modules/MsgIncomingServer.sys.mjs",
      ]),
      services: new Set([
        "@mozilla.org/mail/notification-manager;1",
        "@mozilla.org/newMailNotificationService;1",
      ]),
    },
  },

  // We reach this phase right after showing the first browser window.
  // This means that anything already loaded at this point has been loaded
  // before first paint and delayed it.
  "before first paint": {
    denylist: {
      modules: new Set([
        "chrome://openpgp/content/BondOpenPGP.sys.mjs",
        "chrome://openpgp/content/modules/core.sys.mjs",
        "resource:///modules/index_im.sys.mjs",
        "resource:///modules/MsgDBCacheManager.sys.mjs",
        "resource:///modules/PeriodicFilterManager.sys.mjs",
        "resource://gre/modules/Blocklist.sys.mjs",
        "resource://gre/modules/NewTabUtils.sys.mjs",
        "resource://gre/modules/Sqlite.sys.mjs",
        // Bug 1660907: These core modules shouldn't really be being loaded
        // until sometime after first paint.
        // "resource://gre/modules/PlacesUtils.sys.mjs",
        // "resource://gre/modules/Preferences.sys.mjs",
        // These can probably be pushed back even further.
      ]),
      services: new Set([
        "@mozilla.org/browser/search-service;1",
        "@mozilla.org/msgDatabase/msgDBService;1",
      ]),
    },
  },

  // We are at this phase once we are ready to handle user events.
  // Anything loaded at this phase or before gets in the way of the user
  // interacting with the first mail window.
  "before handling user events": {
    denylist: {
      modules: new Set([
        "resource:///modules/gloda/Everybody.sys.mjs",
        "resource:///modules/gloda/Gloda.sys.mjs",
        "resource:///modules/gloda/GlodaContent.sys.mjs",
        "resource:///modules/gloda/GlodaDatabind.sys.mjs",
        "resource:///modules/gloda/GlodaDataModel.sys.mjs",
        "resource:///modules/gloda/GlodaDatastore.sys.mjs",
        "resource:///modules/gloda/GlodaExplicitAttr.sys.mjs",
        "resource:///modules/gloda/GlodaFundAttr.sys.mjs",
        "resource:///modules/gloda/GlodaMsgIndexer.sys.mjs",
        "resource:///modules/gloda/GlodaPublic.sys.mjs",
        "resource:///modules/gloda/GlodaQueryClassFactory.sys.mjs",
        "resource:///modules/gloda/GlodaUtils.sys.mjs",
        "resource:///modules/gloda/IndexMsg.sys.mjs",
        "resource:///modules/gloda/MimeMessage.sys.mjs",
        "resource:///modules/gloda/NounFreetag.sys.mjs",
        "resource:///modules/gloda/NounMimetype.sys.mjs",
        "resource:///modules/gloda/NounTag.sys.mjs",
        "resource:///modules/index_im.sys.mjs",
        "resource:///modules/jsmime.sys.mjs",
        "resource:///modules/MimeJSComponents.sys.mjs",
        "resource:///modules/mimeParser.sys.mjs",
        "resource://gre/modules/BookmarkHTMLUtils.sys.mjs",
        "resource://gre/modules/Bookmarks.sys.mjs",
        "resource://gre/modules/ContextualIdentityService.sys.mjs",
        "resource://gre/modules/CrashSubmit.sys.mjs",
        "resource://gre/modules/FxAccounts.sys.mjs",
        "resource://gre/modules/FxAccountsStorage.sys.mjs",
        "resource://gre/modules/PlacesBackups.sys.mjs",
        "resource://gre/modules/PlacesSyncUtils.sys.mjs",
        "resource://gre/modules/PushComponents.sys.mjs",
      ]),
      services: new Set([
        "@mozilla.org/browser/annotation-service;1",
        "@mozilla.org/browser/nav-bookmarks-service;1",
        "@mozilla.org/messenger/filter-plugin;1?name=bayesianfilter",
        "@mozilla.org/messenger/fts3tokenizer;1",
        "@mozilla.org/messenger/headerparser;1",
      ]),
    },
  },

  // Things that are expected to be completely out of the startup path
  // and loaded lazily when used for the first time by the user should
  // be listed here.
  "before becoming idle": {
    denylist: {
      modules: new Set([
        "resource:///modules/AddrBookManager.sys.mjs",
        "resource:///modules/DisplayNameUtils.sys.mjs",
        "resource:///modules/gloda/Facet.sys.mjs",
        "resource:///modules/gloda/GlodaMsgSearcher.sys.mjs",
        "resource:///modules/gloda/SuffixTree.sys.mjs",
        "resource:///modules/GlodaAutoComplete.sys.mjs",
        "resource:///modules/ImapIncomingServer.sys.mjs",
        "resource:///modules/ImapMessageMessageService.sys.mjs",
        "resource:///modules/ImapMessageService.sys.mjs",
        // Skipped due to the way ImapModuleLoader and registerProtocolHandler
        // works, uncomment once ImapModuleLoader is removed and imap-js becomes
        // the only IMAP implemention.
        // "resource:///modules/ImapProtocolHandler.sys.mjs",
        "resource:///modules/ImapService.sys.mjs",
        "resource:///modules/NntpIncomingServer.sys.mjs",
        "resource:///modules/NntpMessageService.sys.mjs",
        "resource:///modules/NntpProtocolHandler.sys.mjs",
        "resource:///modules/NntpProtocolInfo.sys.mjs",
        "resource:///modules/NntpService.sys.mjs",
        "resource:///modules/Pop3IncomingServer.sys.mjs",
        "resource:///modules/Pop3ProtocolHandler.sys.mjs",
        "resource:///modules/Pop3ProtocolInfo.sys.mjs",
        // "resource:///modules/Pop3Service.sys.mjs",
        "resource:///modules/SmtpClient.sys.mjs",
        "resource:///modules/SMTPProtocolHandler.sys.mjs",
        "resource:///modules/SmtpServer.sys.mjs",
        "resource:///modules/SmtpService.sys.mjs",
        "resource:///modules/TemplateUtils.sys.mjs",
        "resource://gre/modules/AsyncPrefs.sys.mjs",
        "resource://gre/modules/LoginManagerContextMenu.sys.mjs",
        "resource://pdf.js/PdfStreamConverter.sys.mjs",
      ]),
      services: new Set(["@mozilla.org/autocomplete/search;1?name=gloda"]),
    },
  },
};

add_task(async function () {
  if (
    !AppConstants.NIGHTLY_BUILD &&
    !AppConstants.MOZ_DEV_EDITION &&
    !AppConstants.DEBUG
  ) {
    ok(
      !("@mozilla.org/test/startuprecorder;1" in Cc),
      "the startup recorder component shouldn't exist in this non-nightly/non-devedition/" +
        "non-debug build."
    );
    return;
  }

  const startupRecorder =
    Cc["@mozilla.org/test/startuprecorder;1"].getService().wrappedJSObject;
  await startupRecorder.done;

  const data = Cu.cloneInto(startupRecorder.data.code, {});
  function getStack(scriptType, name) {
    if (scriptType == "modules") {
      return Cu.getModuleImportStack(name);
    }
    return "";
  }

  // This block only adds debug output to help find the next bugs to file,
  // it doesn't contribute to the actual test.
  SimpleTest.requestCompleteLog();
  let previous;
  for (const phase in data) {
    for (const scriptType in data[phase]) {
      for (const f of data[phase][scriptType].sort()) {
        // phases are ordered, so if a script wasn't loaded yet at the immediate
        // previous phase, it wasn't loaded during any of the previous phases
        // either, and is new in the current phase.
        if (!previous || !data[previous][scriptType].includes(f)) {
          info(`${scriptType} loaded ${phase}: ${f}`);
          if (kDumpAllStacks) {
            info(getStack(scriptType, f));
          }
        }
      }
    }
    previous = phase;
  }

  for (const phase in startupPhases) {
    const loadedList = data[phase];
    const allowlist = startupPhases[phase].allowlist || null;
    if (allowlist) {
      for (const scriptType in allowlist) {
        loadedList[scriptType] = loadedList[scriptType].filter(c => {
          if (!allowlist[scriptType].has(c)) {
            return true;
          }
          allowlist[scriptType].delete(c);
          return false;
        });
        is(
          loadedList[scriptType].length,
          0,
          `should have no unexpected ${scriptType} loaded ${phase}`
        );
        for (const script of loadedList[scriptType]) {
          const message = `unexpected ${scriptType}: ${script}`;
          record(false, message, undefined, getStack(scriptType, script));
        }
        is(
          allowlist[scriptType].size,
          0,
          `all ${scriptType} allowlist entries should have been used`
        );
        for (const script of allowlist[scriptType]) {
          ok(false, `unused ${scriptType} allowlist entry: ${script}`);
        }
      }
    }
    const denylist = startupPhases[phase].denylist || null;
    if (denylist) {
      for (const scriptType in denylist) {
        for (const file of denylist[scriptType]) {
          const loaded = loadedList[scriptType].includes(file);
          const message = `${file} is not allowed ${phase}`;
          if (!loaded) {
            ok(true, message);
          } else {
            record(false, message, undefined, getStack(scriptType, file));
          }
        }
      }
    }
  }
});
