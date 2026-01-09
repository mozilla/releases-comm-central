/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";

import { fetchConfigFromExchange } from "resource:///modules/accountcreation/ExchangeAutoDiscover.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FetchConfig: "resource:///modules/accountcreation/FetchConfig.sys.mjs",
});

const {
  CancelledException,
  gAccountSetupLogger,
  ParallelAbortable,
  PriorityOrderAbortable,
  UserCancelledException,
} = AccountCreationUtils;

/**
 * Finds and returns an AccountConfig, including incoming exchange
 * exchange alternatives, from a domain and email address. If autoconfig or
 * autodiscovery finds nothing, returns null. This is an async generator
 * function, as we need to pause the function in case we need to wait for
 * confirmation to continue with autodiscovery if the domain is hosted by a 3rd
 * party.
 *
 * @generator
 *
 * @param {SuccessiveAbortable} successiveAbortable - Encapsulates abortables
 *   in function call.
 * @param {string} domain - The domain of the emailAddress used for discovery.
 * @param {string} emailAddress - The emailAddress used for discovery.
 * @param {string} [password] - Password if available, used for exchange.
 * @param {string} [exchangeUsername] - Separate username to authenticate
 *   exchange autodiscovery lookups with.
 * @yields {object} - May yield object saying redirect is required with host.
 *
 * @returns {?AccountConfig} @see AccountConfig.sys.mjs
 */
async function* parallelAutoDiscovery(
  successiveAbortable,
  domain,
  emailAddress,
  password,
  exchangeUsername
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
  const redirectCallbackResolvers = Promise.withResolvers();
  const { promise, resolve, reject } = Promise.withResolvers();
  let acceptRedirect, cancelRedirect;
  const autodiscoverTask = fetchConfigFromExchange(
    domain,
    emailAddress,
    exchangeUsername,
    password,
    (host, accept, cancel, scheme) => {
      acceptRedirect = accept;
      cancelRedirect = cancel;
      redirectCallbackResolvers.resolve({ host, scheme });
    },
    (...args) => {
      autodiscoverCall.successCallback()(...args);
      resolve();
    },
    (e, allErrors) => {
      // Must call error callback in any case to stop the discover mode.
      const errorCallback = autodiscoverCall.errorCallback();
      if (e instanceof CancelledException) {
        // If we've cancelled a redirect, we must resolve so the logic for
        // having all of the priorty calls completed can run.
        if (cancelRedirect) {
          resolve();
        } else {
          reject(e);
        }

        errorCallback(e);
      } else if (allErrors && allErrors.some(error => error.code == 401)) {
        // Auth failed.
        reject(
          new Error("Exchange auth error", {
            cause: {
              fluentTitleId: "account-setup-credentials-wrong",
            },
          })
        );

        errorCallback(new CancelledException());
      } else {
        // This needs to resolve here so the logic for having all of the
        // priority calls completed can run. Even if the autodiscover fails,
        // we need to check the status of the priority calls below. The outside
        // function can throw an error for the other instances of autodiscover
        // failing (the two instances above).
        resolve();
        errorCallback(
          new Error(e.message, {
            ...e,
            cause: {
              error: e,
              fluentTitleId: "account-setup-credentials-wrong",
            },
          })
        );
      }
    }
  );

  autodiscoverCall.setAbortable(autodiscoverTask);

  const allFinishedPromise = new Promise(resolvePromise => {
    discoveryTasks.addAllFinishedObserver(() => resolvePromise());
  });

  // If there is a 401 error with fetchConfigWithExchange, we need to throw an
  // error back to the function caller. If there is a 301 error, autodiscovery
  // will resolve the redirectCallbackResovlers promise, and we will yield here
  // to make sure the user confirms they want to submit their credentials.
  try {
    // Handle the 3rd party redirect callback as a promise.
    await Promise.race([promise, redirectCallbackResolvers.promise]);
    // acceptRedirect is set when exchange autodiscover requires confirmation
    // for submitting credentials to a 3rd party host.
    if (acceptRedirect) {
      const { host, scheme } = await redirectCallbackResolvers.promise;
      const result = yield {
        isRedirect: true,
        host,
        scheme,
      };
      // The generator waits for the user to either accept or reject submitting
      // their credentials, and then continues with autodiscovery after they
      // respond.
      if (result) {
        if (result.acceptRedirect) {
          acceptRedirect();
        } else {
          cancelRedirect(new UserCancelledException());
        }
      }

      // If we handled the redirect promise first, we need to make sure we handle
      // the audodiscovery promise right after in case there were any errors.
      await promise;
    }
  } catch (error) {
    if (error instanceof CancelledException) {
      throw new UserCancelledException();
    }

    let newError;
    if (!error.cause.fluentTitleId) {
      newError = new Error(error.message, {
        ...error,
        cause: { error, fluentTitleId: "account-setup-credentials-incomplete" },
      });
    }

    discoveryTasks.cancel(error);

    throw newError || error;
  }

  await allFinishedPromise;

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
  // When using an add-on for Exchange, we need to explicitly tell the
  // CreateInBackend module to create an outgoing server because the addon will
  // not create one (and instead override the `nsIMsgSend` instance used to send
  // a message). This is not the case here, so we explicitly set this to false.
  // We do it on the incoming config, as at this point we don't have an outgoing
  // one, and for Exchange the incoming config is used for the outgoing config.
  ewsIncoming.useGlobalPreferredServer = false;

  config.incomingAlternatives.push(ewsIncoming);
}

/**
 * Returns the exchange config object if available.
 *
 * @param {AccountConfig} config - The found AccountConfig object.
 * @returns {?object} An object containing the exchange config, or undefined.
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
