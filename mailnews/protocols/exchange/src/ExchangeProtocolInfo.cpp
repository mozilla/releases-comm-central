/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExchangeProtocolInfo.h"

#include "ExchangeIncomingServer.h"
#include "nsMailDirServiceDefs.h"
#include "nsMsgUtils.h"

#define PREF_MAIL_ROOT_EWS_REL "mail.root.ews-rel"

// This is for the sake of backward compatibility via NS_GetPersistentFile. What
// that backward compatibility is, it doesn't say, so who knows if we can remove
// it?
#define PREF_MAIL_ROOT_EWS "mail.root.ews"

NS_IMPL_ISUPPORTS(ExchangeProtocolInfo, nsIMsgProtocolInfo)

ExchangeProtocolInfo::ExchangeProtocolInfo() = default;

ExchangeProtocolInfo::~ExchangeProtocolInfo() {}

NS_IMETHODIMP
ExchangeProtocolInfo::GetDefaultLocalPath(nsIFile** aDefaultLocalPath) {
  // There's no shared implementation of this method, even though it seems to be
  // protocol agnostic. This is cribbed directly from `nsImapService.cpp`.

  NS_ENSURE_ARG_POINTER(aDefaultLocalPath);
  *aDefaultLocalPath = nullptr;

  bool havePref;
  nsCOMPtr<nsIFile> localFile;
  nsresult rv = NS_GetPersistentFile(PREF_MAIL_ROOT_EWS_REL, PREF_MAIL_ROOT_EWS,
                                     NS_APP_MAIL_50_DIR, havePref,
                                     getter_AddRefs(localFile));
  if (NS_FAILED(rv)) return rv;

  bool exists;
  rv = localFile->Exists(&exists);
  if (NS_SUCCEEDED(rv) && !exists) {
    rv = localFile->Create(nsIFile::DIRECTORY_TYPE, 0775);
  }

  if (NS_FAILED(rv)) return rv;

  if (!havePref || !exists) {
    rv = NS_SetPersistentFile(PREF_MAIL_ROOT_EWS_REL, PREF_MAIL_ROOT_EWS,
                              localFile);
    NS_ASSERTION(NS_SUCCEEDED(rv), "Failed to set root dir pref.");
  }

  localFile.forget(aDefaultLocalPath);

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::SetDefaultLocalPath(
    nsIFile* aDefaultLocalPath) {
  NS_ENSURE_ARG(aDefaultLocalPath);
  return NS_SetPersistentFile(PREF_MAIL_ROOT_EWS_REL, PREF_MAIL_ROOT_EWS,
                              aDefaultLocalPath);
}

NS_IMETHODIMP ExchangeProtocolInfo::GetServerIID(nsIID& aServerIID) {
  aServerIID = NS_GET_IID(ExchangeIncomingServer);

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetRequiresUsername(
    bool* aRequiresUsername) {
  NS_ENSURE_ARG_POINTER(aRequiresUsername);
  *aRequiresUsername = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetPreflightPrettyNameWithEmailAddress(
    bool* aPreflightPrettyNameWithEmailAddress) {
  NS_ENSURE_ARG_POINTER(aPreflightPrettyNameWithEmailAddress);
  *aPreflightPrettyNameWithEmailAddress = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetCanDelete(bool* aCanDelete) {
  NS_ENSURE_ARG_POINTER(aCanDelete);
  *aCanDelete = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetCanLoginAtStartUp(
    bool* aCanLoginAtStartUp) {
  NS_ENSURE_ARG_POINTER(aCanLoginAtStartUp);
  *aCanLoginAtStartUp = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetCanDuplicate(bool* aCanDuplicate) {
  NS_ENSURE_ARG_POINTER(aCanDuplicate);
  *aCanDuplicate = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetDefaultServerPort(bool isSecure,
                                                         int32_t* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  // We'll likely end up ignoring this completely because we use the EWS URL
  // supplied during account setup, but return HTTP(S) ports anyhow.
  if (isSecure) {
    *_retval = 443;
  } else {
    *_retval = 80;
  }

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetCanGetMessages(bool* aCanGetMessages) {
  NS_ENSURE_ARG_POINTER(aCanGetMessages);
  *aCanGetMessages = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetCanGetIncomingMessages(
    bool* aCanGetIncomingMessages) {
  NS_ENSURE_ARG_POINTER(aCanGetIncomingMessages);
  *aCanGetIncomingMessages = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetDefaultDoBiff(bool* aDefaultDoBiff) {
  NS_ENSURE_ARG_POINTER(aDefaultDoBiff);
  *aDefaultDoBiff = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetShowComposeMsgLink(
    bool* aShowComposeMsgLink) {
  NS_ENSURE_ARG_POINTER(aShowComposeMsgLink);
  *aShowComposeMsgLink = true;

  return NS_OK;
}

NS_IMETHODIMP ExchangeProtocolInfo::GetFoldersCreatedAsync(
    bool* aFoldersCreatedAsync) {
  NS_ENSURE_ARG_POINTER(aFoldersCreatedAsync);
  *aFoldersCreatedAsync = true;

  return NS_OK;
}
