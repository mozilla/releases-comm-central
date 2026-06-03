/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

(function (exports) {
  var { cloudFileAccounts } = ChromeUtils.importESModule(
    'resource:///modules/cloudFileAccounts.sys.mjs'
  );

  exports.ProTweaks = class extends ExtensionCommon.ExtensionAPI {
    // Work around https://bugzilla.mozilla.org/show_bug.cgi?id=1999233

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

      Object.defineProperty(provider, 'iconURL', {
        configurable: true,
        enumerable: true,
        get: () => {
          return this.extension.getURL('icons/send-glyph.svg');
        },
      });
    }

    _cloudAccountAdded(event, account) {
      if (account.type != 'ext-' + this.extension.id) {
        return;
      }

      Object.defineProperty(account, 'iconURL', {
        configurable: true,
        enumerable: true,
        get: () => {
          return this.extension.getURL('icons/send-glyph.svg');
        },
      });
    }

    onStartup() {
      this._cloudProviderRegistered = this._cloudProviderRegistered.bind(this);
      cloudFileAccounts.on('providerRegistered', this._cloudProviderRegistered);
      this._cloudProviderRegistered('ext-' + this.extension.id);

      this._cloudAccountAdded = this._cloudAccountAdded.bind(this);
      cloudFileAccounts.on('accountAdded', this._cloudAccountAdded);
      cloudFileAccounts.accounts.forEach((account) =>
        this._cloudAccountAdded(null, account)
      );
    }

    onShutdown(isAppShutdown) {
      if (isAppShutdown) {
        return;
      }

      cloudFileAccounts.off(
        'providerRegistered',
        this._cloudProviderRegistered
      );
      cloudFileAccounts.off('accountAdded', this._cloudAccountAdded);
    }

    getAPI(_context) {
      return {
        ProTweaks: {},
      };
    }
  };
})(this);
