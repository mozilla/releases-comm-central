/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";

import { fetchConfigFromExchange } from "resource:///modules/accountcreation/ExchangeAutoDiscover.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FetchConfig: "resource:///modules/accountcreation/FetchConfig.sys.mjs",
  OAuth2Providers: "resource:///modules/OAuth2Providers.sys.mjs",
});

const {
  CancelledException,
  gAccountSetupLogger,
  ParallelAbortable,
  PriorityOrderAbortable,
} = AccountCreationUtils;

/**
 * Finds and returns an AccountConfig, including incoming exchange
 * exchange alternatives, from a domain and email address. If autoconfig or
 * autodiscovery finds nothing, returns null.
 *
 * @param {SuccessiveAbortable} successiveAbortable - Encapsulates abortables
 * in function call.
 * @param {String} domain - The domain of the emailAddress used for discovery.
 * @param {String} emailAddress - The emailAddress used for discovery.
 *
 * @returns {?AccountConfig} @see AccountConfig.sys.mjs
 */
async function parallelAutoDiscovery(
  successiveAbortable,
  domain,
  emailAddress
) {
  // We use several discovery mechanisms running in parallel in order to avoid
  // excess delays if several of them in a row fail to find an appropriate
  // configuration.
  const discoveryTasks = new ParallelAbortable();

  // Set up abortable calls before kicking off tasks so that our observer is
  // guaranteed to not miss completion of any of them.
  const priorityCall = discoveryTasks.addCall();
  const autodiscoverCall = discoveryTasks.addCall();
  successiveAbortable.current = discoveryTasks;

  // We prefer some discovery mechanisms over others to allow for local
  // configuration and to attempt to favor more up-to-date/accurate configs.
  // These will be run in parallel for speed, with successful discovery from a
  // source resulting in all lower-priority sources being cancelled. The
  // highest-priority mechanism to succeed wins.
  const priorityQueue = new PriorityOrderAbortable(
    priorityCall.successCallback(),
    priorityCall.errorCallback()
  );
  priorityCall.setAbortable(priorityQueue);

  // These are in order of importance.
  const lookups = ["fromDisk", "fromISP", "fromDB", "forMX"];

  for (const lookup of lookups) {
    const call = priorityQueue.addCall();
    const args = [
      domain,
      emailAddress,
      call.successCallback(),
      call.errorCallback(),
    ];

    if (lookup === "fromDB" || lookup === "fromDisk") {
      args.splice(1, 1);
    }

    gAccountSetupLogger.debug(`Looking up configuration: using ${lookup}`);
    const fetchConfiguration = lazy.FetchConfig[lookup](...args);
    call.setAbortable(fetchConfiguration);
  }

  // Microsoft Autodiscover is outside the priority ordering, as most of
  // those mechanisms are unlikely to produce an Exchange configuration even
  // when using Exchange is possible. Autodiscover should always produce an
  // Exchange config if available, so we want it to always complete.
  gAccountSetupLogger.debug("Looking up configuration: Exchange server…");
  const { promise, resolve, reject } = Promise.withResolvers();
  const autodiscoverTask = fetchConfigFromExchange(
    domain,
    emailAddress,
    "",
    "",
    () => {},
    (...args) => {
      autodiscoverCall.successCallback()(...args);
      resolve();
    },
    (e, allErrors) => {
      // Must call error callback in any case to stop the discover mode.
      const errorCallback = autodiscoverCall.errorCallback();
      if (e instanceof CancelledException) {
        reject(e);
        errorCallback(e);
      } else if (allErrors && allErrors.some(error => error.code == 401)) {
        // Auth failed.
        reject(new Error("Exchange auth error"));
        errorCallback(new CancelledException());
      } else {
        // This needs to resolve here so the logic for having all of the
        // priority calls completed can run. Even if the autodiscover fails,
        // we need to check the status of the priorty calls below. The outside
        // function can throw an error for the other instances of autodiscover
        // failing (the two instances above).
        resolve();
        errorCallback(e);
      }
    }
  );

  autodiscoverCall.setAbortable(autodiscoverTask);

  await new Promise(resolvePromise => {
    discoveryTasks.addAllFinishedObserver(() => resolvePromise());
  });

  // If there is a 401 error with fetchConfigWithExchange, we need to throw an
  // error back to the function caller.
  try {
    await promise;
  } catch (error) {
    if (error instanceof CancelledException) {
      return null;
    }
    throw error;
  }

  // Wait for both our priority discovery and Autodiscover search to complete
  // before deciding on a configuration to ensure we get an Exchange config if
  // one exists.
  let config;

  if (priorityCall.succeeded) {
    // One of the priority-ordered discovery mechanisms has succeeded. If
    // that mechanism did not produce an Exchange configuration and
    // Autodiscover also succeeded, we will add any Exchange configuration
    // it produced as an alternative.
    config = priorityCall.result;

    if (!getIncomingExchangeConfig(config) && autodiscoverCall.succeeded) {
      const autodiscoverConfig = autodiscoverCall.result;
      const exchangeIncoming = getIncomingExchangeConfig(autodiscoverConfig);

      if (exchangeIncoming) {
        config.incomingAlternatives.push(exchangeIncoming);
      }
    }
  } else {
    // None of the priority-ordered mechanisms produced a config.
    if (!autodiscoverCall.succeeded) {
      return null;
    }

    config = autodiscoverCall.result;
  }

  return config;
}

/**
 * Makes a configuration including an "exchange" incoming server suitable for
 * use with our internal Exchange Web Services implementation.
 *
 * @param {AccountConfig} config - The configuration to revise.
 */
function ewsifyConfig(config) {
  // At present, account setup code uses the "exchange" incoming server type
  // to store a configuration suitable for OWL. In order to avoid breaking
  // OWL (which uses some config fields in an idiosyncratic manner), we use
  // the "ews" type. So that both are presented in the UI, we duplicate the
  // "exchange" config and adjust its fields as needed.
  const exchangeIncoming = getIncomingExchangeConfig(config);

  if (!exchangeIncoming) {
    return;
  }

  const ewsIncoming = structuredClone(exchangeIncoming);
  ewsIncoming.type = "ews";
  // When using the native EWS support, we want to reuse the incoming config
  // for the outgoing server, since there is no difference in settings between
  // receiving and sending mail.
  ewsIncoming.handlesOutgoing = true;
  // When using an add-on for Exchange, we need to explicitly tell the
  // CreateInBackend module to create an outgoing server because the addon
  // will not create one (and instead override the `nsIMsgSend` instance used
  // to send a message). This is not the case here, so we explicitly set this
  // to false. We do it on the incoming config, as at this point we don't have
  // an outgoing one, and we've just toggled `handlesOutgoing`.
  ewsIncoming.useGlobalPreferredServer = false;

  if (ewsIncoming.oauthSettings) {
    // OWL uses these fields in such a way that their values won't work with
    // our OAuth2 implementation. Replace them with settings from our OAuth2
    // implementation.
    const oauthSettings = lazy.OAuth2Providers.getHostnameDetails(
      ewsIncoming.hostname
    );

    if (oauthSettings) {
      // EWS needs more scope. Don't request it for other protocols, as
      // it may be disallowed for some users.
      ewsIncoming.oauthSettings.scope +=
        " https://outlook.office.com/EWS.AccessAsUser.All";
      [ewsIncoming.oauthSettings.issuer, ewsIncoming.oauthSettings.scope] =
        oauthSettings;
    } else {
      ewsIncoming.oauthSettings = null;
    }
  }

  config.incomingAlternatives.push(ewsIncoming);
}

/**
 * Returns the exchange config object if available.
 *
 * @param {AccountConfig} config - The found AccountConfig object.
 * @returns {?Object} An object containing the exchange config, or undefined.
 */
function getIncomingExchangeConfig(config) {
  return [config.incoming, ...config.incomingAlternatives].find(
    ({ type }) => type === "exchange"
  );
}

export const FindConfig = {
  parallelAutoDiscovery,
  ewsifyConfig,
};
