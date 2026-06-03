/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

(function (exports) {
  var { cloudFileAccounts } = ChromeUtils.importESModule(
    'resource:///modules/cloudFileAccounts.sys.mjs'
  );

  exports.CloudFileAccounts = class extends ExtensionCommon.ExtensionAPI {
    onStartup() {
      // Ensure provider is registered during startup
      this._cloudProviderRegistered = this._cloudProviderRegistered.bind(this);
      cloudFileAccounts.on('providerRegistered', this._cloudProviderRegistered);
      this._cloudProviderRegistered('ext-' + this.extension.id);
    }

    onShutdown(isAppShutdown) {
      if (isAppShutdown) {
        return;
      }

      cloudFileAccounts.off(
        'providerRegistered',
        this._cloudProviderRegistered
      );
    }

    _cloudProviderRegistered(providerType) {
      if (providerType != 'ext-' + this.extension.id) {
        return;
      }

      let provider = cloudFileAccounts.getProviderForType(
        'ext-' + this.extension.id
      );
      if (!provider) {
        return;
      }

      // Provider is registered and ready
      console.log(`Cloud file provider registered: ${providerType}`);
    }

    getAPI(_context) {
      return {
        CloudFileAccounts: {
          async createAccount(type, configured) {
            try {
              // Check if the provider is registered
              const provider = cloudFileAccounts.getProviderForType(type);
              if (!provider) {
                return {
                  success: false,
                  error: `Cloud file provider '${type}' is not registered. The extension may not be fully loaded yet.`,
                };
              }

              // Check if an account with this type already exists
              const existingAccount = cloudFileAccounts.accounts.find(
                (account) => account.type === type
              );

              if (existingAccount) {
                return {
                  success: true,
                  alreadyExists: true,
                  accountId: existingAccount.accountKey,
                  message: `Cloud file account of type '${type}' already exists.`,
                };
              }

              // Create the account
              const account = cloudFileAccounts.createAccount(type);

              if (!account) {
                return {
                  success: false,
                  error: `Failed to create cloud file account of type '${type}'.`,
                };
              }

              // Set the configured status
              account.configured = configured;

              return {
                success: true,
                accountId: account.accountKey,
                message: `Cloud file account created successfully with type '${type}'.`,
              };
            } catch (error) {
              return {
                success: false,
                error: `Error creating cloud file account: ${error.message}`,
              };
            }
          },
        },
      };
    }
  };
})(this);
