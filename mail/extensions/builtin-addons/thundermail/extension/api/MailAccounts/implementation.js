'use strict';

(function (exports) {
  var { CreateInBackend } = ChromeUtils.importESModule(
    'resource:///modules/accountcreation/CreateInBackend.sys.mjs'
  );
  var { OAuth2Module } = ChromeUtils.importESModule(
    'resource:///modules/OAuth2Module.sys.mjs'
  );
  var { AccountConfig } = ChromeUtils.importESModule(
    'resource:///modules/accountcreation/AccountConfig.sys.mjs'
  );
  var { MailServices } = ChromeUtils.importESModule(
    'resource:///modules/MailServices.sys.mjs'
  );

  // Return customized account config, starting from defaults.
  function createAccountConfig(email, realname, hostname, displayName) {
    const accountConfig = new AccountConfig();

    accountConfig.incoming.type = 'imap';
    accountConfig.incoming.hostname = hostname;
    accountConfig.incoming.port = 993;
    accountConfig.incoming.username = email;
    accountConfig.incoming.password = '';
    accountConfig.incoming.socketType = 3; // SSL
    accountConfig.incoming.auth = 10; // OAuth2

    accountConfig.outgoing.type = 'smtp';
    accountConfig.outgoing.hostname = hostname;
    accountConfig.outgoing.port = 587;
    accountConfig.outgoing.username = email;
    accountConfig.outgoing.password = '';
    accountConfig.outgoing.socketType = 2; // STARTTLS
    accountConfig.outgoing.auth = 10; // OAuth2
    accountConfig.outgoing.addThisServer = true;

    accountConfig.identity.realname = realname;
    accountConfig.identity.emailAddress = email;
    accountConfig.displayName = displayName;

    return accountConfig;
  }

  function accountExists(email, hostname) {
    try {
      const server = MailServices.accounts.findServer(email, hostname, 'imap');
      return !!server;
    } catch {
      // findServer throws if not found
      return false;
    }
  }

  class MailAccounts extends ExtensionCommon.ExtensionAPI {
    getAPI(_context) {
      return {
        MailAccounts: {
          async createAccount(email, realname, hostname, displayName) {
            try {
              // Check if account already exists
              if (accountExists(email, hostname)) {
                console.log(
                  `Account already exists for ${email} on ${hostname}`
                );
                return {
                  success: true,
                  alreadyExists: true,
                  message: 'Account already exists',
                };
              }

              const accountConfig = createAccountConfig(
                email,
                realname,
                hostname,
                displayName
              );
              await CreateInBackend.createAccountInBackend(accountConfig);
              console.log(`Successfully created account for ${email}`);
              return { success: true, alreadyExists: false };
            } catch (e) {
              console.error('Error creating account:', e);
              return { success: false, error: e.message };
            }
          },

          async setToken(refreshToken, email, hostname) {
            try {
              const incomingServer = MailServices.accounts.findServer(
                email,
                hostname,
                'imap'
              );

              if (!incomingServer) {
                console.error('Server not found');
                return { success: false, error: 'Server not found' };
              }

              const oauth2Module = new OAuth2Module();
              const initialized = oauth2Module.initFromMail(incomingServer);

              if (!initialized) {
                console.error('Failed to initialize OAuth2Module');
                return { success: false, error: 'OAuth2Module init failed' };
              }

              await oauth2Module.setRefreshToken(refreshToken);
              // Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=1998099
              oauth2Module._oauth.refreshToken = refreshToken;
              console.log(`Using workaround for refreshToken`);

              return { success: true };
            } catch (e) {
              console.error('Error in setToken:', e);
              return { success: false, error: e.message };
            }
          },
        },
      };
    }
  }

  exports.MailAccounts = MailAccounts;
})(this);
