/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
  Outlook (Win32) settings
*/

#include "nsCOMPtr.h"
#include "nscore.h"
#include "nsMsgUtils.h"
#include "nsOutlookImport.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgAccount.h"
#include "nsIImportSettings.h"
#include "nsOutlookSettings.h"
#include "nsIMsgOutgoingServerService.h"
#include "nsIMsgOutgoingServer.h"
#include "nsISmtpServer.h"
#include "nsOutlookStringBundle.h"
#include "ImportDebug.h"
#include "nsIPop3IncomingServer.h"
#include "nsMsgI18N.h"
#include <windows.h>
#include "nsIWindowsRegKey.h"
#include "nsComponentManagerUtils.h"
#include "nsNativeCharsetUtils.h"

class OutlookSettings {
 public:
  static nsresult FindAccountsKey(nsIWindowsRegKey** aKey);
  static nsresult QueryAccountSubKey(nsIWindowsRegKey** aKey);
  static nsresult GetDefaultMailAccountName(nsAString& aName);

  static bool DoImport(nsIMsgAccount** aAccount);

  static bool DoIMAPServer(nsIMsgAccountManager* aMgr, nsIWindowsRegKey* aKey,
                           const nsString& aServerName,
                           nsIMsgAccount** aAccount);
  static bool DoPOP3Server(nsIMsgAccountManager* aMgr, nsIWindowsRegKey* aKey,
                           const nsString& aServerName,
                           nsIMsgAccount** aAccount);

  static void SetIdentities(nsIMsgAccountManager* pMgr, nsIMsgAccount* pAcc,
                            nsIWindowsRegKey* aKey);

  static nsresult SetSmtpServer(nsIMsgAccountManager* aMgr, nsIMsgAccount* aAcc,
                                nsIMsgIdentity* aId, const nsString& aServer,
                                const nsString& aUser);
  static nsresult SetSmtpServerKey(nsIMsgIdentity* aId,
                                   nsIMsgOutgoingServer* aServer);
  static nsresult GetAccountName(nsIWindowsRegKey* aKey,
                                 const nsString& aDefaultName,
                                 nsAString& aAccountName);
};

#define OUTLOOK2003_REGISTRY_KEY \
  "Software\\Microsoft\\Office\\Outlook\\OMI Account Manager"
#define OUTLOOK98_REGISTRY_KEY \
  "Software\\Microsoft\\Office\\8.0\\Outlook\\OMI Account Manager"

////////////////////////////////////////////////////////////////////////
nsresult nsOutlookSettings::Create(nsIImportSettings** aImport) {
  NS_ENSURE_ARG_POINTER(aImport);
  NS_ADDREF(*aImport = new nsOutlookSettings());
  return NS_OK;
}

nsOutlookSettings::nsOutlookSettings() {}

nsOutlookSettings::~nsOutlookSettings() {}

NS_IMPL_ISUPPORTS(nsOutlookSettings, nsIImportSettings)

NS_IMETHODIMP nsOutlookSettings::AutoLocate(char16_t** description,
                                            nsIFile** location, bool* _retval) {
  NS_ASSERTION(description != nullptr, "null ptr");
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!description || !_retval) return NS_ERROR_NULL_POINTER;

  *description = nsOutlookStringBundle::GetStringByID(OUTLOOKIMPORT_NAME);
  *_retval = false;

  if (location) *location = nullptr;

  // look for the registry key for the accounts
  nsCOMPtr<nsIWindowsRegKey> key;
  *_retval =
      NS_SUCCEEDED(OutlookSettings::FindAccountsKey(getter_AddRefs(key)));

  return NS_OK;
}

NS_IMETHODIMP nsOutlookSettings::SetLocation(nsIFile* location) {
  return NS_OK;
}

NS_IMETHODIMP nsOutlookSettings::Import(nsIMsgAccount** localMailAccount,
                                        bool* _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");

  if (OutlookSettings::DoImport(localMailAccount)) {
    *_retval = true;
    IMPORT_LOG0("Settings import appears successful\n");
  } else {
    *_retval = false;
    IMPORT_LOG0("Settings import returned FALSE\n");
  }

  return NS_OK;
}

nsresult OutlookSettings::FindAccountsKey(nsIWindowsRegKey** aKey) {
  nsresult rv;
  nsCOMPtr<nsIWindowsRegKey> key =
      do_CreateInstance("@mozilla.org/windows-registry-key;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = key->Open(nsIWindowsRegKey::ROOT_KEY_CURRENT_USER,
                 NS_LITERAL_STRING_FROM_CSTRING(OUTLOOK2003_REGISTRY_KEY),
                 nsIWindowsRegKey::ACCESS_QUERY_VALUE |
                     nsIWindowsRegKey::ACCESS_ENUMERATE_SUB_KEYS);

  if (NS_FAILED(rv)) {
    rv = key->Open(nsIWindowsRegKey::ROOT_KEY_CURRENT_USER,
                   NS_LITERAL_STRING_FROM_CSTRING(OUTLOOK98_REGISTRY_KEY),
                   nsIWindowsRegKey::ACCESS_QUERY_VALUE |
                       nsIWindowsRegKey::ACCESS_ENUMERATE_SUB_KEYS);
  }

  if (NS_SUCCEEDED(rv)) key.forget(aKey);

  return rv;
}

nsresult OutlookSettings::QueryAccountSubKey(nsIWindowsRegKey** aKey) {
  nsresult rv;
  nsCOMPtr<nsIWindowsRegKey> key =
      do_CreateInstance("@mozilla.org/windows-registry-key;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = key->Open(nsIWindowsRegKey::ROOT_KEY_CURRENT_USER,
                 NS_LITERAL_STRING_FROM_CSTRING(OUTLOOK2003_REGISTRY_KEY),
                 nsIWindowsRegKey::ACCESS_QUERY_VALUE |
                     nsIWindowsRegKey::ACCESS_ENUMERATE_SUB_KEYS);
  if (NS_SUCCEEDED(rv)) {
    key.forget(aKey);
    return rv;
  }

  rv = key->Open(nsIWindowsRegKey::ROOT_KEY_CURRENT_USER,
                 NS_LITERAL_STRING_FROM_CSTRING(OUTLOOK98_REGISTRY_KEY),
                 nsIWindowsRegKey::ACCESS_QUERY_VALUE |
                     nsIWindowsRegKey::ACCESS_ENUMERATE_SUB_KEYS);
  if (NS_SUCCEEDED(rv)) {
    key.forget(aKey);
    return rv;
  }

  return NS_ERROR_FAILURE;
}

nsresult OutlookSettings::GetDefaultMailAccountName(nsAString& aName) {
  nsCOMPtr<nsIWindowsRegKey> key;
  nsresult rv = QueryAccountSubKey(getter_AddRefs(key));
  if (NS_FAILED(rv)) return rv;

  return key->ReadStringValue(u"Default Mail Account"_ns, aName);
}

bool OutlookSettings::DoImport(nsIMsgAccount** aAccount) {
  nsCOMPtr<nsIWindowsRegKey> key;
  nsresult rv = OutlookSettings::FindAccountsKey(getter_AddRefs(key));
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Error finding Outlook registry account keys\n");
    return false;
  }

  nsCOMPtr<nsIMsgAccountManager> accMgr =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  if (NS_FAILED(rv)) {
    IMPORT_LOG0("*** Failed to create a account manager!\n");
    return false;
  }

  nsAutoString defMailName;
  rv = GetDefaultMailAccountName(defMailName);

  uint32_t childCount;
  key->GetChildCount(&childCount);

  uint32_t accounts = 0;
  uint32_t popCount = 0;
  for (uint32_t i = 0; i < childCount; i++) {
    nsAutoString keyName;
    key->GetChildName(i, keyName);
    nsCOMPtr<nsIWindowsRegKey> subKey;
    rv = key->OpenChild(keyName, nsIWindowsRegKey::ACCESS_QUERY_VALUE,
                        getter_AddRefs(subKey));
    if (NS_FAILED(rv)) continue;

    // Get the values for this account.
    nsAutoCString nativeKeyName;
    NS_CopyUnicodeToNative(keyName, nativeKeyName);
    IMPORT_LOG1("Opened Outlook account: %s\n", nativeKeyName.get());

    nsCOMPtr<nsIMsgAccount> account;
    nsAutoString value;
    rv = subKey->ReadStringValue(u"IMAP Server"_ns, value);
    if (NS_SUCCEEDED(rv) &&
        DoIMAPServer(accMgr, subKey, value, getter_AddRefs(account)))
      accounts++;

    rv = subKey->ReadStringValue(u"POP3 Server"_ns, value);
    if (NS_SUCCEEDED(rv) &&
        DoPOP3Server(accMgr, subKey, value, getter_AddRefs(account))) {
      popCount++;
      accounts++;
      if (aAccount && account) {
        // If we created a mail account, get rid of it since
        // we have 2 POP accounts!
        if (popCount > 1)
          NS_RELEASE(*aAccount);
        else
          NS_ADDREF(*aAccount = account);
      }
    }

    // Is this the default account?
    if (account && keyName.Equals(defMailName))
      accMgr->SetDefaultAccount(account);
  }

  // Now save the new acct info to pref file.
  rv = accMgr->SaveAccountInfo();
  NS_ASSERTION(NS_SUCCEEDED(rv), "Can't save account info to pref file");

  return accounts != 0;
}

nsresult OutlookSettings::GetAccountName(nsIWindowsRegKey* aKey,
                                         const nsString& aDefaultName,
                                         nsAString& aAccountName) {
  nsresult rv;
  rv = aKey->ReadStringValue(u"Account Name"_ns, aAccountName);
  if (NS_FAILED(rv)) aAccountName.Assign(aDefaultName);

  return NS_OK;
}

bool OutlookSettings::DoIMAPServer(nsIMsgAccountManager* aMgr,
                                   nsIWindowsRegKey* aKey,
                                   const nsString& aServerName,
                                   nsIMsgAccount** aAccount) {
  nsAutoString userName;
  nsresult rv;
  rv = aKey->ReadStringValue(u"IMAP User Name"_ns, userName);
  if (NS_FAILED(rv)) return false;

  bool result = false;

  // I now have a user name/server name pair, find out if it already exists?
  nsAutoCString nativeUserName;
  NS_CopyUnicodeToNative(userName, nativeUserName);
  nsAutoCString nativeServerName;
  NS_CopyUnicodeToNative(aServerName, nativeServerName);
  nsCOMPtr<nsIMsgIncomingServer> in;
  aMgr->FindServer(nativeUserName, nativeServerName, "imap"_ns, 0,
                   getter_AddRefs(in));
  if (!in) {
    // Create the incoming server and an account for it?
    rv = aMgr->CreateIncomingServer(nativeUserName, nativeServerName, "imap"_ns,
                                    getter_AddRefs(in));
    if (NS_SUCCEEDED(rv) && in) {
      rv = in->SetType("imap"_ns);
      // TODO SSL, auth method

      IMPORT_LOG2("Created IMAP server named: %s, userName: %s\n",
                  nativeServerName.get(), nativeUserName.get());

      nsAutoString prettyName;
      if (NS_SUCCEEDED(GetAccountName(aKey, aServerName, prettyName)))
        rv = in->SetPrettyName(prettyName);
      // We have a server, create an account.
      nsCOMPtr<nsIMsgAccount> account;
      rv = aMgr->CreateAccount(getter_AddRefs(account));
      if (NS_SUCCEEDED(rv) && account) {
        rv = account->SetIncomingServer(in);

        IMPORT_LOG0(
            "Created an account and set the IMAP server as the incoming "
            "server\n");

        // Fiddle with the identities
        SetIdentities(aMgr, account, aKey);
        result = true;
        if (aAccount) account.forget(aAccount);
      }
    }
  } else
    result = true;

  return result;
}

bool OutlookSettings::DoPOP3Server(nsIMsgAccountManager* aMgr,
                                   nsIWindowsRegKey* aKey,
                                   const nsString& aServerName,
                                   nsIMsgAccount** aAccount) {
  nsAutoString userName;
  nsresult rv;
  rv = aKey->ReadStringValue(u"POP3 User Name"_ns, userName);
  if (NS_FAILED(rv)) return false;

  // I now have a user name/server name pair, find out if it already exists?
  nsAutoCString nativeUserName;
  NS_CopyUnicodeToNative(userName, nativeUserName);
  nsAutoCString nativeServerName;
  NS_CopyUnicodeToNative(aServerName, nativeServerName);
  nsCOMPtr<nsIMsgIncomingServer> in;
  aMgr->FindServer(nativeUserName, nativeServerName, "pop3"_ns, 0,
                   getter_AddRefs(in));
  if (in) return true;

  // Create the incoming server and an account for it?
  rv = aMgr->CreateIncomingServer(nativeUserName, nativeServerName, "pop3"_ns,
                                  getter_AddRefs(in));
  rv = in->SetType("pop3"_ns);

  // TODO SSL, auth method

  nsCOMPtr<nsIPop3IncomingServer> pop3Server = do_QueryInterface(in);
  NS_ENSURE_SUCCESS(rv, false);

  // set local folders as the Inbox to use for this POP3 server
  nsCOMPtr<nsIMsgIncomingServer> localFoldersServer;
  aMgr->GetLocalFoldersServer(getter_AddRefs(localFoldersServer));

  if (!localFoldersServer) {
    // XXX: We may need to move this local folder creation code to the generic
    // nsImportSettings code if the other import modules end up needing to do
    // this too. if Local Folders does not exist already, create it
    rv = aMgr->CreateLocalMailAccount(nullptr);
    if (NS_FAILED(rv)) {
      IMPORT_LOG0("*** Failed to create Local Folders!\n");
      return false;
    }
    aMgr->GetLocalFoldersServer(getter_AddRefs(localFoldersServer));
  }

  // now get the account for this server
  nsCOMPtr<nsIMsgAccount> localFoldersAccount;
  aMgr->FindAccountForServer(localFoldersServer,
                             getter_AddRefs(localFoldersAccount));
  if (localFoldersAccount) {
    nsCString localFoldersAcctKey;
    localFoldersAccount->GetKey(localFoldersAcctKey);
    pop3Server->SetDeferredToAccount(localFoldersAcctKey);
    pop3Server->SetDeferGetNewMail(true);
  }

  IMPORT_LOG2("Created POP3 server named: %s, userName: %s\n",
              nativeServerName.get(), nativeUserName.get());

  nsString prettyName;
  rv = GetAccountName(aKey, aServerName, prettyName);
  if (NS_FAILED(rv)) return false;

  rv = in->SetPrettyName(prettyName);
  // We have a server, create an account.
  nsCOMPtr<nsIMsgAccount> account;
  rv = aMgr->CreateAccount(getter_AddRefs(account));
  if (NS_FAILED(rv)) return false;

  rv = account->SetIncomingServer(in);

  IMPORT_LOG0(
      "Created a new account and set the incoming server to the POP3 "
      "server.\n");

  uint32_t leaveOnServer;
  rv = aKey->ReadIntValue(u"Leave Mail On Server"_ns, &leaveOnServer);
  if (NS_SUCCEEDED(rv))
    pop3Server->SetLeaveMessagesOnServer(leaveOnServer == 1 ? true : false);

  // Fiddle with the identities
  SetIdentities(aMgr, account, aKey);

  if (aAccount) account.forget(aAccount);

  return true;
}

void OutlookSettings::SetIdentities(nsIMsgAccountManager* aMgr,
                                    nsIMsgAccount* aAcc,
                                    nsIWindowsRegKey* aKey) {
  // Get the relevant information for an identity
  nsAutoString name;
  aKey->ReadStringValue(u"SMTP Display Name"_ns, name);

  nsAutoString server;
  aKey->ReadStringValue(u"SMTP Server"_ns, server);

  nsAutoString email;
  aKey->ReadStringValue(u"SMTP Email Address"_ns, email);

  nsAutoString reply;
  aKey->ReadStringValue(u"SMTP Reply To Email Address"_ns, reply);

  nsAutoString userName;
  aKey->ReadStringValue(u"SMTP User Name"_ns, userName);

  nsAutoString orgName;
  aKey->ReadStringValue(u"SMTP Organization Name"_ns, orgName);

  nsresult rv;
  nsCOMPtr<nsIMsgIdentity> id;
  if (!email.IsEmpty() && !name.IsEmpty() && !server.IsEmpty()) {
    // The default identity, nor any other identities matched,
    // create a new one and add it to the account.
    rv = aMgr->CreateIdentity(getter_AddRefs(id));
    if (id) {
      id->SetFullName(name);
      id->SetOrganization(orgName);

      nsAutoCString nativeEmail;
      NS_CopyUnicodeToNative(email, nativeEmail);
      id->SetEmail(nativeEmail);
      if (!reply.IsEmpty()) {
        nsAutoCString nativeReply;
        NS_CopyUnicodeToNative(reply, nativeReply);
        id->SetReplyTo(nativeReply);
      }
      aAcc->AddIdentity(id);

      nsAutoCString nativeName;
      NS_CopyUnicodeToNative(name, nativeName);
      IMPORT_LOG0("Created identity and added to the account\n");
      IMPORT_LOG1("\tname: %s\n", nativeName.get());
      IMPORT_LOG1("\temail: %s\n", nativeEmail.get());
    }
  }

  if (userName.IsEmpty()) {
    nsCOMPtr<nsIMsgIncomingServer> incomingServer;
    rv = aAcc->GetIncomingServer(getter_AddRefs(incomingServer));
    if (NS_SUCCEEDED(rv) && incomingServer) {
      nsAutoCString nativeUserName;
      rv = incomingServer->GetUsername(nativeUserName);
      NS_ASSERTION(NS_SUCCEEDED(rv),
                   "Unable to get UserName from incomingServer");
      NS_CopyNativeToUnicode(nativeUserName, userName);
    }
  }

  SetSmtpServer(aMgr, aAcc, id, server, userName);
}

nsresult OutlookSettings::SetSmtpServerKey(nsIMsgIdentity* aId,
                                           nsIMsgOutgoingServer* aServer) {
  nsAutoCString smtpServerKey;
  aServer->GetKey(smtpServerKey);
  return aId->SetSmtpServerKey(smtpServerKey);
}

nsresult OutlookSettings::SetSmtpServer(nsIMsgAccountManager* aMgr,
                                        nsIMsgAccount* aAcc,
                                        nsIMsgIdentity* aId,
                                        const nsString& aServer,
                                        const nsString& aUser) {
  nsresult rv;
  nsCOMPtr<nsIMsgOutgoingServerService> outgoingServerService(do_GetService(
      "@mozilla.org/messengercompose/outgoingserverservice;1", &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString nativeUserName;
  NS_CopyUnicodeToNative(aUser, nativeUserName);
  nsAutoCString nativeServerName;
  NS_CopyUnicodeToNative(aServer, nativeServerName);
  nsCOMPtr<nsIMsgOutgoingServer> foundServer;
  rv = outgoingServerService->FindServer(
      nativeUserName, nativeServerName, "smtp"_ns, getter_AddRefs(foundServer));
  if (NS_SUCCEEDED(rv) && foundServer) {
    if (aId) SetSmtpServerKey(aId, foundServer);
    IMPORT_LOG1("SMTP server already exists: %s\n", nativeServerName.get());
    return rv;
  }

  nsCOMPtr<nsIMsgOutgoingServer> server;
  rv = outgoingServerService->CreateServer("smtp"_ns, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISmtpServer> smtpServer = do_QueryInterface(server);
  rv = smtpServer->SetHostname(nativeServerName);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!aUser.IsEmpty()) server->SetUsername(nativeUserName);

  if (aId) SetSmtpServerKey(aId, server);

  // TODO SSL, auth method
  IMPORT_LOG1("Created new SMTP server: %s\n", nativeServerName.get());
  return NS_OK;
}
