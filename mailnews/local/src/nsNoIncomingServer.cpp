/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsNoIncomingServer.h"

#include "mozilla/Components.h"
#include "mozilla/StaticPrefs_mail.h"
#include "msgCore.h"  // pre-compiled headers
#include "prmem.h"
#include "plstr.h"
#include "prprf.h"
#include "nsMsgFolderFlags.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIMsgMailSession.h"
#include "nsIPop3IncomingServer.h"
#include "nsServiceManagerUtils.h"
#include "nsMsgUtils.h"

NS_IMPL_ISUPPORTS_INHERITED(nsNoIncomingServer, nsMsgIncomingServer,
                            nsINoIncomingServer, nsILocalMailIncomingServer)

nsNoIncomingServer::nsNoIncomingServer() {}

nsNoIncomingServer::~nsNoIncomingServer() {}

#ifdef MOZ_PANORAMA
nsresult nsNoIncomingServer::CreateRootFolder() {
  nsresult rv = nsMsgIncomingServer::CreateRootFolder();
  NS_ENSURE_SUCCESS(rv, rv);
  if (mozilla::StaticPrefs::mail_panorama_enabled_AtStartup()) {
    rv = CreateDefaultMailboxes();
    NS_ENSURE_SUCCESS(rv, rv);

    rv = SetFlagsOnDefaultMailboxes();
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}
#endif  // MOZ_PANORAMA

NS_IMETHODIMP
nsNoIncomingServer::GetLocalStoreType(nsACString& type) {
  type.AssignLiteral("mailbox");
  return NS_OK;
}

NS_IMETHODIMP
nsNoIncomingServer::GetLocalDatabaseType(nsACString& type) {
  type.AssignLiteral("mailbox");
  return NS_OK;
}

NS_IMETHODIMP
nsNoIncomingServer::GetAccountManagerChrome(nsAString& aResult) {
  aResult.AssignLiteral("am-serverwithnoidentities.xhtml");
  return NS_OK;
}

NS_IMETHODIMP
nsNoIncomingServer::SetFlagsOnDefaultMailboxes() {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgLocalMailFolder> localFolder =
      do_QueryInterface(rootFolder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // None server may have an inbox if it's deferred to,
  // or if it's the smart mailboxes account.
  localFolder->SetFlagsOnDefaultMailboxes(nsMsgFolderFlags::SpecialUse);

  return NS_OK;
}

// TODO: make this work with maildir message store, bug 890742.
NS_IMETHODIMP nsNoIncomingServer::CopyDefaultMessages(
    const nsACString& folderNameOnDisk) {
  nsresult rv;
  nsCOMPtr<nsIMsgMailSession> mailSession =
      mozilla::components::MailSession::Service();

  // Get defaults directory for messenger files. MailSession service appends
  // 'messenger' to the the app defaults folder and returns it. Locale will be
  // added to the path, if there is one.
  nsCOMPtr<nsIFile> defaultMessagesFile;
  rv = mailSession->GetDataFilesDir("messenger",
                                    getter_AddRefs(defaultMessagesFile));
  NS_ENSURE_SUCCESS(rv, rv);

  // check if bin/defaults/messenger/<folderNameOnDisk>
  // (or bin/defaults/messenger/<locale>/<folderNameOnDisk> if we had a locale
  // provide) exists. it doesn't have to exist.  if it doesn't, return
  rv = defaultMessagesFile->Append(NS_ConvertUTF8toUTF16(folderNameOnDisk));
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists;
  rv = defaultMessagesFile->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) return NS_OK;

  nsCOMPtr<nsIFile> parentDir;
  rv = GetLocalPath(getter_AddRefs(parentDir));
  NS_ENSURE_SUCCESS(rv, rv);

  // check if parentDir/<folderNameOnDisk> exists
  {
    nsCOMPtr<nsIFile> testDir;
    rv = parentDir->Clone(getter_AddRefs(testDir));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = testDir->Append(NS_ConvertUTF8toUTF16(folderNameOnDisk));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = testDir->Exists(&exists);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // if it exists add to the end, else copy
  if (exists) {
#ifdef DEBUG
    printf("append default %s (unimplemented)\n",
           nsAutoCString(folderNameOnDisk).get());
#endif
    // todo for bug #1181 (the bug ID seems wrong...)
    // open folderFile, seek to end
    // read defaultMessagesFile, write to folderFile
  } else {
#ifdef DEBUG
    printf("copy default %s\n", nsAutoCString(folderNameOnDisk).get());
#endif
    rv = defaultMessagesFile->CopyTo(parentDir, EmptyString());
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP nsNoIncomingServer::CreateDefaultMailboxes() {
  nsresult rv;
  bool isHidden = false;
  GetHidden(&isHidden);
  if (isHidden) return NS_OK;

  // notice, no Inbox, unless we're deferred to...
  bool isDeferredTo;
  if (NS_SUCCEEDED(GetIsDeferredTo(&isDeferredTo)) && isDeferredTo) {
    rv = CreateLocalFolder("Inbox"_ns, nsMsgFolderFlags::Inbox);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = CreateLocalFolder("Trash"_ns, nsMsgFolderFlags::Trash);
  NS_ENSURE_SUCCESS(rv, rv);

  // copy the default templates into the Templates folder
  rv = CopyDefaultMessages("Templates"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  return CreateLocalFolder("Unsent Messages"_ns, nsMsgFolderFlags::Queue);
}

NS_IMETHODIMP
nsNoIncomingServer::GetNewMail(nsIMsgWindow* aMsgWindow,
                               nsIUrlListener* aUrlListener,
                               nsIMsgFolder* aInbox, nsIURI** aResult) {
  if (aResult) {
    *aResult = nullptr;
  }
  nsTArray<RefPtr<nsIPop3IncomingServer>> deferredServers;
  nsresult rv = GetDeferredServers(this, deferredServers);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!deferredServers.IsEmpty()) {
    rv = deferredServers[0]->DownloadMailFromServers(
        deferredServers, aMsgWindow, aInbox, aUrlListener);
  }
  // listener might be counting on us to send a notification.
  else if (aUrlListener)
    aUrlListener->OnStopRunningUrl(nullptr, NS_OK);
  return rv;
}

NS_IMETHODIMP
nsNoIncomingServer::GetCanSearchMessages(bool* canSearchMessages) {
  NS_ENSURE_ARG_POINTER(canSearchMessages);
  *canSearchMessages = true;
  return NS_OK;
}

NS_IMETHODIMP
nsNoIncomingServer::GetServerRequiresPasswordForBiff(
    bool* aServerRequiresPasswordForBiff) {
  NS_ENSURE_ARG_POINTER(aServerRequiresPasswordForBiff);
  *aServerRequiresPasswordForBiff =
      false;  // for local folders, we don't require a password
  return NS_OK;
}
