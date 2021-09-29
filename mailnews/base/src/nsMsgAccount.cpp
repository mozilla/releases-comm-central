/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prprf.h"
#include "plstr.h"
#include "prmem.h"
#include "nsIComponentManager.h"
#include "nsIServiceManager.h"
#include "nsCRTGlue.h"
#include "nsCOMPtr.h"
#include "nsIMsgFolderNotificationService.h"

#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsMsgBaseCID.h"
#include "nsMsgAccount.h"
#include "nsIMsgAccount.h"
#include "nsIMsgAccountManager.h"
#include "nsIObserverService.h"
#include "mozilla/Services.h"
#include "nsServiceManagerUtils.h"
#include "nsMemory.h"
#include "nsComponentManagerUtils.h"
#include "nsMsgUtils.h"

NS_IMPL_ISUPPORTS(nsMsgAccount, nsIMsgAccount)

nsMsgAccount::nsMsgAccount()
    : m_identitiesValid(false), mTriedToGetServer(false) {}

nsMsgAccount::~nsMsgAccount() {}

nsresult nsMsgAccount::getPrefService() {
  if (m_prefs) return NS_OK;

  nsresult rv;
  NS_ENSURE_FALSE(m_accountKey.IsEmpty(), NS_ERROR_NOT_INITIALIZED);
  nsCOMPtr<nsIPrefService> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString accountRoot("mail.account.");
  accountRoot.Append(m_accountKey);
  accountRoot.Append('.');
  return prefs->GetBranch(accountRoot.get(), getter_AddRefs(m_prefs));
}

NS_IMETHODIMP
nsMsgAccount::GetIncomingServer(nsIMsgIncomingServer** aIncomingServer) {
  NS_ENSURE_ARG_POINTER(aIncomingServer);

  // create the incoming server lazily
  if (!mTriedToGetServer && !m_incomingServer) {
    mTriedToGetServer = true;
    // ignore the error (and return null), but it's still bad so warn
    mozilla::DebugOnly<nsresult> rv = createIncomingServer();
    NS_WARNING_ASSERTION(NS_SUCCEEDED(rv),
                         "couldn't lazily create the server\n");
  }

  NS_IF_ADDREF(*aIncomingServer = m_incomingServer);

  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccount::CreateServer() {
  if (m_incomingServer) return NS_ERROR_ALREADY_INITIALIZED;
  return createIncomingServer();
}

nsresult nsMsgAccount::createIncomingServer() {
  // from here, load mail.account.myaccount.server
  // Load the incoming server
  //
  // ex) mail.account.myaccount.server = "myserver"

  nsresult rv = getPrefService();
  NS_ENSURE_SUCCESS(rv, rv);

  // get the "server" pref
  nsCString serverKey;
  rv = m_prefs->GetCharPref("server", serverKey);
  NS_ENSURE_SUCCESS(rv, rv);

  // get the server from the account manager
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = accountManager->GetIncomingServer(serverKey, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  // store the server in this structure
  m_incomingServer = server;
  accountManager->NotifyServerLoaded(server);

  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccount::SetIncomingServer(nsIMsgIncomingServer* aIncomingServer) {
  NS_ENSURE_ARG_POINTER(aIncomingServer);

  nsCString key;
  nsresult rv = aIncomingServer->GetKey(key);

  if (NS_SUCCEEDED(rv)) {
    rv = getPrefService();
    NS_ENSURE_SUCCESS(rv, rv);
    m_prefs->SetCharPref("server", key);
  }

  m_incomingServer = aIncomingServer;

  bool serverValid;
  (void)aIncomingServer->GetValid(&serverValid);
  // only notify server loaded if server is valid so
  // account manager only gets told about finished accounts.
  if (serverValid) {
    // this is the point at which we can notify listeners about the
    // creation of the root folder, which implies creation of the new server.
    nsCOMPtr<nsIMsgFolder> rootFolder;
    rv = aIncomingServer->GetRootFolder(getter_AddRefs(rootFolder));
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIFolderListener> mailSession =
        do_GetService(NS_MSGMAILSESSION_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    mailSession->OnItemAdded(nullptr, rootFolder);
    nsCOMPtr<nsIMsgFolderNotificationService> notifier(
        do_GetService(NS_MSGNOTIFICATIONSERVICE_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    notifier->NotifyFolderAdded(rootFolder);

    nsCOMPtr<nsIMsgAccountManager> accountManager =
        do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
    if (NS_SUCCEEDED(rv)) accountManager->NotifyServerLoaded(aIncomingServer);

    // Force built-in folders to be created and discovered. Then, notify
    // listeners about them.
    nsTArray<RefPtr<nsIMsgFolder>> subFolders;
    rv = rootFolder->GetSubFolders(subFolders);
    NS_ENSURE_SUCCESS(rv, rv);

    for (nsIMsgFolder* msgFolder : subFolders) {
      mailSession->OnItemAdded(rootFolder, msgFolder);
      notifier->NotifyFolderAdded(msgFolder);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccount::GetIdentities(nsTArray<RefPtr<nsIMsgIdentity>>& identities) {
  NS_ENSURE_TRUE(m_identitiesValid, NS_ERROR_FAILURE);
  identities.Clear();
  identities.AppendElements(m_identities);
  return NS_OK;
}

/*
 * set up the m_identities array
 * do not call this more than once or we'll leak.
 */
nsresult nsMsgAccount::createIdentities() {
  NS_ENSURE_FALSE(m_identitiesValid, NS_ERROR_FAILURE);

  nsresult rv;
  m_identities.Clear();

  nsCString identityKey;
  rv = getPrefService();
  NS_ENSURE_SUCCESS(rv, rv);

  m_prefs->GetCharPref("identities", identityKey);
  if (identityKey.IsEmpty()) {
    // not an error if no identities, but strtok will be unhappy.
    m_identitiesValid = true;
    return NS_OK;
  }
  // get the server from the account manager
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  char* newStr = identityKey.BeginWriting();
  char* token = NS_strtok(",", &newStr);

  // temporaries used inside the loop
  nsCOMPtr<nsIMsgIdentity> identity;
  nsAutoCString key;

  // iterate through id1,id2, etc
  while (token) {
    key = token;
    key.StripWhitespace();

    // create the account
    rv = accountManager->GetIdentity(key, getter_AddRefs(identity));
    if (NS_SUCCEEDED(rv)) {
      m_identities.AppendElement(identity);
    }

    // advance to next key, if any
    token = NS_strtok(",", &newStr);
  }

  m_identitiesValid = true;
  return rv;
}

/* attribute nsIMsgIdentity defaultIdentity; */
NS_IMETHODIMP
nsMsgAccount::GetDefaultIdentity(nsIMsgIdentity** aDefaultIdentity) {
  NS_ENSURE_ARG_POINTER(aDefaultIdentity);
  NS_ENSURE_TRUE(m_identitiesValid, NS_ERROR_NOT_INITIALIZED);

  // Default identity is the first in the list.
  if (m_identities.IsEmpty()) {
    *aDefaultIdentity = nullptr;
  } else {
    NS_IF_ADDREF(*aDefaultIdentity = m_identities[0]);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccount::SetDefaultIdentity(nsIMsgIdentity* aDefaultIdentity) {
  NS_ENSURE_TRUE(m_identitiesValid, NS_ERROR_FAILURE);

  auto position = m_identities.IndexOf(aDefaultIdentity);
  if (position == m_identities.NoIndex) {
    return NS_ERROR_FAILURE;
  }

  // Move it to the front of the list.
  m_identities.RemoveElementAt(position);
  m_identities.InsertElementAt(0, aDefaultIdentity);

  return saveIdentitiesPref();
}

/* void addIdentity (in nsIMsgIdentity identity); */
NS_IMETHODIMP
nsMsgAccount::AddIdentity(nsIMsgIdentity* identity) {
  NS_ENSURE_ARG_POINTER(identity);
  NS_ENSURE_TRUE(m_identitiesValid, NS_ERROR_FAILURE);

  // hack hack - need to add this to the list of identities.
  // for now just treat this as a Setxxx accessor
  // when this is actually implemented, don't refcount the default identity
  nsCString key;
  nsresult rv = identity->GetKey(key);

  if (NS_SUCCEEDED(rv)) {
    nsCString identityList;
    m_prefs->GetCharPref("identities", identityList);

    nsAutoCString newIdentityList(identityList);

    nsAutoCString testKey;       // temporary to strip whitespace
    bool foundIdentity = false;  // if the input identity is found

    if (!identityList.IsEmpty()) {
      char* newStr = identityList.BeginWriting();
      char* token = NS_strtok(",", &newStr);

      // look for the identity key that we're adding
      while (token) {
        testKey = token;
        testKey.StripWhitespace();

        if (testKey.Equals(key)) foundIdentity = true;

        token = NS_strtok(",", &newStr);
      }
    }

    // if it didn't already exist, append it
    if (!foundIdentity) {
      if (newIdentityList.IsEmpty())
        newIdentityList = key;
      else {
        newIdentityList.Append(',');
        newIdentityList.Append(key);
      }
    }

    m_prefs->SetCharPref("identities", newIdentityList);

    // now add it to the in-memory list
    m_identities.AppendElement(identity);

    nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
    if (obs) {
      obs->NotifyObservers(identity, "account-identity-added",
                           NS_ConvertUTF8toUTF16(key).get());
    }
  }

  return NS_OK;
}

/* void removeIdentity (in nsIMsgIdentity identity); */
NS_IMETHODIMP
nsMsgAccount::RemoveIdentity(nsIMsgIdentity* aIdentity) {
  NS_ENSURE_ARG_POINTER(aIdentity);
  NS_ENSURE_TRUE(m_identitiesValid, NS_ERROR_FAILURE);

  // At least one identity must stay after the delete.
  NS_ENSURE_TRUE(m_identities.Length() > 1, NS_ERROR_FAILURE);

  nsCString key;
  nsresult rv = aIdentity->GetKey(key);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!m_identities.RemoveElement(aIdentity)) {
    return NS_ERROR_FAILURE;
  }

  // Notify before clearing the pref values, so we do not get the superfluous
  // update notifications.
  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  if (obs) {
    obs->NotifyObservers(nullptr, "account-identity-removed",
                         NS_ConvertUTF8toUTF16(key).get());
  }

  // Clear out the actual pref values associated with the identity.
  aIdentity->ClearAllValues();
  return saveIdentitiesPref();
}

nsresult nsMsgAccount::saveIdentitiesPref() {
  nsAutoCString newIdentityList;

  // Iterate over the existing identities and build the pref value,
  // a string of identity keys: id1, id2, idX...
  nsCString key;
  bool first = true;
  for (auto identity : m_identities) {
    identity->GetKey(key);

    if (first) {
      newIdentityList = key;
      first = false;
    } else {
      newIdentityList.Append(',');
      newIdentityList.Append(key);
    }
  }

  // Save the pref.
  m_prefs->SetCharPref("identities", newIdentityList);

  return NS_OK;
}

NS_IMETHODIMP nsMsgAccount::GetKey(nsACString& accountKey) {
  accountKey = m_accountKey;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccount::SetKey(const nsACString& accountKey) {
  m_accountKey = accountKey;
  m_prefs = nullptr;
  m_identitiesValid = false;
  m_identities.Clear();
  return createIdentities();
}

NS_IMETHODIMP
nsMsgAccount::ToString(nsAString& aResult) {
  nsAutoString val;
  aResult.AssignLiteral("[nsIMsgAccount: ");
  aResult.Append(NS_ConvertASCIItoUTF16(m_accountKey));
  aResult.Append(']');
  return NS_OK;
}

NS_IMETHODIMP
nsMsgAccount::ClearAllValues() {
  nsTArray<nsCString> prefNames;
  nsresult rv = m_prefs->GetChildList("", prefNames);
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto& prefName : prefNames) {
    m_prefs->ClearUserPref(prefName.get());
  }

  return NS_OK;
}
