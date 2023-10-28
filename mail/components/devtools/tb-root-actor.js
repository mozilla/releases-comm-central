/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals loader, require, exports */

/**
 * Actors for Thunderbird Developer Tools, for example the root actor or tab
 * list actor.
 */

var { ActorRegistry } = require("devtools/server/actors/utils/actor-registry");

loader.lazyRequireGetter(
  this,
  "RootActor",
  "devtools/server/actors/root",
  true
);
loader.lazyRequireGetter(
  this,
  "BrowserTabList",
  "devtools/server/actors/webbrowser",
  true
);
loader.lazyRequireGetter(
  this,
  "BrowserAddonList",
  "devtools/server/actors/webbrowser",
  true
);
loader.lazyRequireGetter(
  this,
  "sendShutdownEvent",
  "devtools/server/actors/webbrowser",
  true
);
loader.lazyRequireGetter(
  this,
  "WorkerDescriptorActorList",
  "devtools/server/actors/worker/worker-descriptor-actor-list",
  true
);
loader.lazyRequireGetter(
  this,
  "ServiceWorkerRegistrationActorList",
  "devtools/server/actors/worker/service-worker-registration-list",
  true
);
loader.lazyRequireGetter(
  this,
  "ProcessActorList",
  "devtools/server/actors/process",
  true
);

/**
 * Create the root actor for Thunderbird.
 *
 * @param aConnection       The debugger connection to create the actor for.
 * @returns The mail actor for the connection.
 */
exports.createRootActor = function (aConnection) {
  const parameters = {
    tabList: new TBTabList(aConnection),
    addonList: new BrowserAddonList(aConnection),
    workerList: new WorkerDescriptorActorList(aConnection, {}),
    serviceWorkerRegistrationList: new ServiceWorkerRegistrationActorList(
      aConnection
    ),
    processList: new ProcessActorList(),
    globalActorFactories: ActorRegistry.globalActorFactories,
    onShutdown: sendShutdownEvent,
  };

  // Create the root actor and set the application type
  const rootActor = new RootActor(aConnection, parameters);
  rootActor.applicationType = "mail";

  return rootActor;
};

/**
 * Thunderbird's version of the tab list. We don't have gBrowser, but tabmail has similar functions
 * that will be helpful. The tabs displayed are those tabs in tabmail that have a browser element.
 * This is mainly the contentTabs, but can also be others such as the start page.
 */
class TBTabList extends BrowserTabList {
  _getSelectedBrowser(window) {
    const tabmail = window.document.getElementById("tabmail");
    return tabmail ? tabmail.selectedBrowser : null;
  }

  _getChildren(window) {
    const tabmail = window.document.getElementById("tabmail");
    if (!tabmail) {
      return [];
    }

    return tabmail.tabInfo
      .map(tab => tabmail.getBrowserForTab(tab))
      .filter(Boolean);
  }
}
