/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MsgPasswordAuthModule.h"
#include "nsCOMPtr.h"
#include "nsIAuthPrompt.h"
#include "nsILoginInfo.h"
#include "nsILoginManager.h"
#include "nsINetUtil.h"
#include "nsMsgUtils.h"
#include "nsServiceManagerUtils.h"

NS_IMPL_ISUPPORTS(MsgPasswordAuthModule, msgIPasswordAuthModule)

NS_IMETHODIMP MsgPasswordAuthModule::SetCachedPassword(
    const nsACString& password) {
  mPassword = NS_ConvertUTF8toUTF16(password);
  return NS_OK;
}

NS_IMETHODIMP MsgPasswordAuthModule::GetCachedPassword(nsACString& password) {
  password = NS_ConvertUTF16toUTF8(mPassword);
  return NS_OK;
}

NS_IMETHODIMP
MsgPasswordAuthModule::QueryPasswordFromUserAndCache(
    const nsACString& username, const nsACString& hostname,
    const nsACString& localStoreType, const nsACString& promptMessage,
    const nsACString& promptTitle, nsACString& password) {
  nsresult rv = NS_OK;

  if (mPassword.IsEmpty()) {
    // let's see if we have the password in the password manager and
    // can avoid this prompting thing. This makes it easier to get embedders
    // to get up and running w/o a password prompting UI.
    nsAutoCString managerPassword;
    rv = QueryPasswordFromManagerAndCache(username, hostname, localStoreType,
                                          managerPassword);
    // If GetPasswordWithoutUI returns NS_ERROR_ABORT, the most likely case
    // is the user canceled getting the master password, so just return
    // straight away, as they won't want to get prompted again.
    if (rv == NS_ERROR_ABORT) return NS_MSG_PASSWORD_PROMPT_CANCELLED;
  }
  if (mPassword.IsEmpty()) {
    nsCOMPtr<nsIAuthPrompt> authPrompt =
        do_GetService("@mozilla.org/messenger/msgAuthPrompt;1");
    if (authPrompt) {
      // prompt the user for the password
      nsCString serverUri{localStoreType};

      serverUri.AppendLiteral("://");

      if (!username.IsEmpty()) {
        nsCString escapedUsername;
        MsgEscapeString(username, nsINetUtil::ESCAPE_XALPHAS, escapedUsername);
        serverUri.Append(escapedUsername);
        serverUri.Append('@');
      }

      serverUri.Append(hostname);

      // we pass in the previously used password, if any, into PromptPassword
      // so that it will appear as ******. This means we can't use an nsString
      // and getter_Copies.
      char16_t* uniPassword = nullptr;
      if (!password.IsEmpty()) uniPassword = ToNewUnicode(password);

      bool okayValue = true;
      rv = authPrompt->PromptPassword(
          PromiseFlatString(NS_ConvertUTF8toUTF16(promptTitle)).get(),
          PromiseFlatString(NS_ConvertUTF8toUTF16(promptMessage)).get(),
          NS_ConvertASCIItoUTF16(serverUri).get(),
          nsIAuthPrompt::SAVE_PASSWORD_PERMANENTLY, &uniPassword, &okayValue);
      NS_ENSURE_SUCCESS(rv, rv);

      if (!okayValue)  // if the user pressed cancel, just return an empty
                       // string;
      {
        password.Truncate();
        return NS_MSG_PASSWORD_PROMPT_CANCELLED;
      }

      // we got a password back...so remember it
      rv = SetCachedPassword(
          NS_ConvertUTF16toUTF8(nsDependentString(uniPassword)));
      NS_ENSURE_SUCCESS(rv, rv);

      PR_FREEIF(uniPassword);
    }  // if we got a prompt dialog
    else {
      return NS_ERROR_FAILURE;
    }
  }  // if the password is empty
  return GetCachedPassword(password);
}

// This sets m_password if we find a password in the pw mgr.
NS_IMETHODIMP MsgPasswordAuthModule::QueryPasswordFromManagerAndCache(
    const nsACString& username, const nsACString& hostname,
    const nsACString& localStoreType, nsACString& returnPassword) {
  returnPassword.Truncate();

  nsresult rv;
  nsCOMPtr<nsILoginManager> loginMgr(
      do_GetService(NS_LOGINMANAGER_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // Get the current server URI
  nsCString currServerUri{localStoreType};

  currServerUri.AppendLiteral("://");

  currServerUri.Append(hostname);

  NS_ConvertUTF8toUTF16 currServer(currServerUri);

  nsTArray<RefPtr<nsILoginInfo>> logins;
  rv = loginMgr->FindLogins(currServer, EmptyString(), currServer, logins);

  // Login manager can produce valid fails, e.g. NS_ERROR_ABORT when a user
  // cancels the master password dialog. Therefore handle that here, but don't
  // warn about it.
  if (NS_FAILED(rv)) return rv;
  uint32_t numLogins = logins.Length();

  // Don't abort here, if we didn't find any or failed, then we'll just have
  // to prompt.
  if (numLogins > 0) {
    NS_ConvertUTF8toUTF16 serverUsername(username);

    nsString username;
    for (uint32_t i = 0; i < numLogins; ++i) {
      rv = logins[i]->GetUsername(username);
      NS_ENSURE_SUCCESS(rv, rv);

      if (username.Equals(serverUsername)) {
        nsString password;
        rv = logins[i]->GetPassword(password);
        NS_ENSURE_SUCCESS(rv, rv);

        returnPassword = NS_ConvertUTF16toUTF8(password);
        mPassword = password;
        break;
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
MsgPasswordAuthModule::ForgetPassword(const nsACString& username,
                                      const nsACString& hostname,
                                      const nsACString& localStoreType) {
  nsresult rv;
  nsCOMPtr<nsILoginManager> loginMgr =
      do_GetService(NS_LOGINMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // Get the current server URI
  nsCString currServerUri{localStoreType};

  currServerUri.AppendLiteral("://");

  currServerUri.Append(hostname);

  NS_ConvertUTF8toUTF16 currServer(currServerUri);

  NS_ConvertUTF8toUTF16 serverUsername(username);

  nsTArray<RefPtr<nsILoginInfo>> logins;
  rv = loginMgr->FindLogins(currServer, EmptyString(), currServer, logins);
  NS_ENSURE_SUCCESS(rv, rv);

  // There should only be one-login stored for this url, however just in case
  // there isn't.
  nsString loginUsername;
  for (uint32_t i = 0; i < logins.Length(); ++i) {
    rv = logins[i]->GetUsername(loginUsername);
    int32_t atPos = serverUsername.FindChar('@');
    if (NS_SUCCEEDED(rv) &&
        (loginUsername.Equals(serverUsername) ||
         StringHead(serverUsername, atPos).Equals(loginUsername))) {
      // If this fails, just continue, we'll still want to remove the password
      // from our local cache.
      loginMgr->RemoveLogin(logins[i]);
    }
  }

  return SetCachedPassword(NS_ConvertUTF16toUTF8(EmptyString()));
}

NS_IMETHODIMP
MsgPasswordAuthModule::ForgetSessionPassword() {
  mPassword.Truncate();
  return NS_OK;
}

const nsString& MsgPasswordAuthModule::cachedPassword() const {
  return mPassword;
}
