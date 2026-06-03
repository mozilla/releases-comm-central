/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

/**
 * AccountHub Experiment API
 *
 * Listens for new incoming-server registrations from Thunderbird's Accounts Hub.
 * When a Thundermail account is added, retrieves its OIDC/OAuth2 refresh token
 * and fires the onAccountAdded event so the add-on can log the user in automatically.
 */

(function (exports) {
    var { MailServices } = ChromeUtils.importESModule(
        'resource:///modules/MailServices.sys.mjs'
    );
    var { OAuth2Module } = ChromeUtils.importESModule(
        'resource:///modules/OAuth2Module.sys.mjs'
    );

    /** Matches both production (mail.thundermail.com) and staging (mail.stage-thundermail.com) hosts. */
    const THUNDERMAIL_HOST_PATTERN = /thundermail\.com$/i;

    class AccountHub extends ExtensionCommon.ExtensionAPI {
        getAPI(context) {
            return {
                AccountHub: {
                    onAccountAdded: new ExtensionCommon.EventManager({
                        context,
                        name: 'AccountHub.onAccountAdded',
                        register(fire) {
                            const serverListener = {
                                QueryInterface: ChromeUtils.generateQI([
                                    'nsIIncomingServerListener',
                                ]),

                                onServerLoaded(server) {
                                    try {
                                        const hostname = server.hostName;
                                        console.log(`[AccountHub] onServerLoaded: ${hostname}`);
                                        if (!THUNDERMAIL_HOST_PATTERN.test(hostname)) {
                                            return;
                                        }

                                        const email = server.username;

                                        const oauth2Module = new OAuth2Module();
                                        if (!oauth2Module.initFromMail(server)) {
                                            console.warn(
                                                `[AccountHub] Failed to initialize OAuth2Module for ${hostname}`
                                            );
                                            return;
                                        }

                                        // getRefreshToken() reads the stored token directly from
                                        // the Thunderbird login manager (password manager).
                                        // The token is guaranteed to be stored already because
                                        // verifyConfig() (which runs OAuth2 auth) completes before
                                        // createAccountInBackend() fires NotifyServerLoaded.
                                        const token = oauth2Module.getRefreshToken();

                                        if (!token) {
                                            console.warn(
                                                `[AccountHub] No OIDC token available for ${email} — skipping auto-login`
                                            );
                                            return;
                                        }

                                        // Retrieve the display name from the account's default identity.
                                        const account =
                                            MailServices.accounts.findAccountForServer(server);
                                        const name = account?.defaultIdentity?.fullName ?? '';

                                        console.log(
                                            `[AccountHub] New Thundermail account detected: ${email}. Firing onAccountAdded.`
                                        );
                                        fire.async({ token, email, name });
                                    } catch (e) {
                                        console.error(
                                            '[AccountHub] Error in onServerLoaded handler:',
                                            e
                                        );
                                    }
                                },

                                // Required by nsIMsgIncomingServerListener but not used here.
                                onServerUnloaded(_server) { },
                                onServerChanged(_server) { },
                            };

                            MailServices.accounts.addIncomingServerListener(serverListener);

                            // Return cleanup function — called when the listener is removed.
                            return () => {
                                MailServices.accounts.removeIncomingServerListener(
                                    serverListener
                                );
                            };
                        },
                    }).api(),
                },
            };
        }
    }

    exports.AccountHub = AccountHub;
})(this);
