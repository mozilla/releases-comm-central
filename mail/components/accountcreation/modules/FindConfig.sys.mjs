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
  UserCancelledException,
  promiseFirstSuccessful,
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
 * @param {string} domain - The domain of the emailAddress used for discovery.
 * @param {string} emailAddress - The emailAddress used for discovery.
 * @param {AbortSignal} abortSignal
 * @param {string} [password] - Password if available, used for exchange.
 * @param {string} [exchangeUsername] - Separate username to authenticate
 *   exchange autodiscovery lookups with.
 * @yields {object} - May yield object saying redirect is required with host.
 *
 * @returns {?AccountConfig} @see AccountConfig.sys.mjs. If this returns null,
 *   no valid config was found but there's also no error the user can take an
 *   action on to change the outcome.
 */
async function* parallelAutoDiscovery(
  domain,
  emailAddress,
  abortSignal,
  password,
  exchangeUsername
) {
  // We prefer some discovery mechanisms over others to allow for local
  // configuration and to attempt to favor more up-to-date/accurate configs.
  // These will be run in parallel for speed, with successful discovery from a
  // source resulting in all lower-priority sources being cancelled. The
  // highest-priority mechanism to succeed wins.

  const abortController = new AbortController();
  // Construct a signal that will abort if either this code or external code
  // requests an abort.
  const signal = AbortSignal.any([abortSignal, abortController.signal]);

  // These are in order of importance.
  const lookups = ["fromDisk", "fromISP", "fromDB", "forMX"];
  const allFinishedPromise = promiseFirstSuccessful(
    lookups.map(lookup => {
      const args = [domain, emailAddress, signal];

      if (lookup === "fromDB" || lookup === "fromDisk") {
        args.splice(1, 1);
      }

      gAccountSetupLogger.debug(`Looking up configuration: using ${lookup}`);
      return lazy.FetchConfig[lookup](...args);
    }),
    abortController
  );

  // Microsoft Autodiscover is outside the priority ordering, as most of
  // those mechanisms are unlikely to produce an Exchange configuration even
  // when using Exchange is possible. Autodiscover should always produce an
  // Exchange config if available, so we want it to always complete.
  gAccountSetupLogger.debug("Looking up configuration: Exchange server…");
  const redirectCallbackResolvers = Promise.withResolvers();
  let redirectResultResolvers;
  const exchangePromise = fetchConfigFromExchange(
    domain,
    emailAddress,
    abortSignal,
    exchangeUsername,
    password,
    async (host, scheme, redirectSignal) => {
      redirectResultResolvers = Promise.withResolvers();
      redirectCallbackResolvers.resolve({ host, scheme });
      const result = await redirectResultResolvers.promise;
      redirectSignal.throwIfAborted();
      return result;
    }
  ).catch(exchangeError => {
    // Extract authentication errors from the aggregate error.
    if (
      exchangeError instanceof AggregateError &&
      exchangeError.errors.some(error => error.code == 401)
    ) {
      // Auth failed.
      throw new Error("Exchange auth error", {
        cause: {
          fluentTitleId: "account-hub-credentials-wrong",
        },
      });
    }
    throw exchangeError;
  });

  // If there is a 301 error, autodiscovery will resolve the
  // redirectCallbackResolvers promise, and we will yield here to make sure the
  // user confirms they want to submit their credentials.
  try {
    // Handle the 3rd party redirect callback as a promise.
    await Promise.race([exchangePromise, redirectCallbackResolvers.promise]);
    // acceptRedirect is set when exchange autodiscover requires confirmation
    // for submitting credentials to a 3rd party host.
    if (redirectResultResolvers) {
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
          redirectResultResolvers.resolve();
        } else {
          redirectResultResolvers.reject(new UserCancelledException());
        }
      }
    }
  } catch (error) {
    if (error instanceof CancelledException) {
      // "Handle" the rejections from the priority queue, by ignoring them.
      exchangePromise.catch(rejectionError =>
        gAccountSetupLogger.debug(rejectionError)
      );
      allFinishedPromise.catch(rejectionError =>
        gAccountSetupLogger.debug(rejectionError)
      );
      throw new UserCancelledException();
    }
    // else let error handling fall through to config handling.
  }

  // Wait for both our priority discovery and Autodiscover search to complete
  // before deciding on a configuration to ensure we get an Exchange config if
  // one exists.
  const [autoconfigResult, autodiscoverResult] = await Promise.allSettled([
    allFinishedPromise,
    exchangePromise,
  ]);

  // No point in doing any more work if this was aborted.
  if (abortSignal.aborted) {
    return null;
  }

  if (autoconfigResult.status == "fulfilled") {
    const config = autoconfigResult.value.value;

    // One of the priority-ordered discovery mechanisms has succeeded. If
    // that mechanism did not produce an Exchange configuration and
    // Autodiscover also succeeded, we will add any Exchange configuration
    // it produced as an alternative.
    if (
      !getIncomingExchangeConfig(config) &&
      autodiscoverResult.status == "fulfilled" &&
      autodiscoverResult.value
    ) {
      const autodiscoverConfig = autodiscoverResult.value;

      const exchangeIncoming = getIncomingExchangeConfig(autodiscoverConfig);
      if (exchangeIncoming) {
        config.incomingAlternatives.push(exchangeIncoming);
      }
    }
    // If we have a valid config, return that and ignore any errors.
    return config;
  }

  gAccountSetupLogger.debug(
    "All priority-ordered config fetching mechanisms failed.",
    autoconfigResult.reason
  );

  if (autodiscoverResult.status != "fulfilled") {
    // Only throw the exchange discovery error if it has a user facing string
    // set. This is usually the 401 unauthorized error.
    if (autodiscoverResult.reason.cause?.fluentTitleId) {
      throw autodiscoverResult.reason;
    }
    gAccountSetupLogger.debug(
      "Autodiscover failed with",
      autodiscoverResult.reason
    );
    return null;
  }

  return autodiscoverResult.value;
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
