/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "JaMsgFolder.h"
#include "nsComponentManagerUtils.h"

#define MAILDATABASE_CONTRACTID_BASE "@mozilla.org/nsMsgDatabase/msgDB-"

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS_INHERITED(JaBaseCppMsgFolder, nsMsgDBFolder,
                            nsIInterfaceRequestor)

// nsIInterfaceRequestor implementation
NS_IMETHODIMP
JaBaseCppMsgFolder::GetInterface(const nsIID& aIID, void** aSink) {
  return QueryInterface(aIID, aSink);
}

// Definition of abstract nsMsgDBFolder methods.
nsresult JaBaseCppMsgFolder::GetDatabase() {
  nsresult rv = NS_OK;
  if (!mDatabase) {
    nsCOMPtr<nsIMsgDBService> msgDBService =
        do_GetService("@mozilla.org/msgDatabase/msgDBService;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    // Create the database, keeping it if it is "out of date"
    rv = msgDBService->OpenFolderDB(this, true, getter_AddRefs(mDatabase));
    if (rv == NS_MSG_ERROR_FOLDER_SUMMARY_MISSING) {
      rv = msgDBService->CreateNewDB(this, getter_AddRefs(mDatabase));
      NS_ENSURE_STATE(mDatabase);
      // not sure about this ... the issue is that if the summary is not valid,
      // then the db does not get added to the cache in the future, and
      // reindexes do not show all of the messages.
      // mDatabase->SetSummaryValid(true);
      mDatabase->SetSummaryValid(false);
      CreateDummyFile(this);
    }

    if (rv != NS_MSG_ERROR_FOLDER_SUMMARY_OUT_OF_DATE)
      NS_ENSURE_SUCCESS(rv, rv);
    else if (mDatabase) {
      // Not going to warn here, because on initialization we set all
      //  databases as invalid.
      // NS_WARNING("Mail Summary database is out of date");
      // Grrr, the only way to get this into the cache is to set the db as
      // valid,
      //  close, reopen, then set as invalid.
      mDatabase->SetSummaryValid(true);
      msgDBService->ForceFolderDBClosed(this);
      rv = msgDBService->OpenFolderDB(this, true, getter_AddRefs(mDatabase));
      if (mDatabase) mDatabase->SetSummaryValid(false);
    }

    if (mDatabase) {
      //
      // When I inadvertently deleted the out-of-date database, I hit this code
      // with the db's m_dbFolderInfo as null from the delete, yet the local
      // mDatabase reference kept the database alive. So I hit an assert when I
      // tried to open the database. Be careful if you try to fix the
      // out-of-date issues!
      //
      // UpdateNewMessages();
      if (mAddListener) mDatabase->AddListener(this);
      // UpdateSummaryTotals can null mDatabase during initialization, so we
      // save a local copy
      nsCOMPtr<nsIMsgDatabase> database(mDatabase);
      UpdateSummaryTotals(true);
      mDatabase = database;
    }
  }

  return rv;
}

/*
 * The utility function GetSummaryFileLocation takes a folder file,
 *  then appends .msf to come up with the name of the database file. So
 *  we need a placeholder file with simply the folder name. This method
 *  creates an appropriate file as a placeholder, or you may use the file if
 *  appropriate.
 */
nsresult JaBaseCppMsgFolder::CreateDummyFile(nsIMsgFolder* aMailFolder) {
  nsresult rv;
  if (!aMailFolder) return NS_OK;
  nsCOMPtr<nsIFile> path;
  // need to make sure folder exists...
  aMailFolder->GetFilePath(getter_AddRefs(path));
  if (path) {
    bool exists;
    rv = path->Exists(&exists);
    if (!exists) {
      rv = path->Create(nsIFile::NORMAL_FILE_TYPE, 0644);
      NS_ENSURE_SUCCESS(rv, rv);
    }
  }
  return NS_OK;
}

// Delegator object to bypass JS method override.

JaCppMsgFolderDelegator::JaCppMsgFolderDelegator()
    : mCppBase(new Super(this)), mMethods(nullptr) {}

NS_IMPL_ISUPPORTS_INHERITED(JaCppMsgFolderDelegator, JaBaseCppMsgFolder,
                            msgIOverride)

NS_IMPL_ISUPPORTS(JaCppMsgFolderDelegator::Super, nsIMsgFolder,
                  nsIDBChangeListener, nsIUrlListener,
                  nsIJunkMailClassificationListener,
                  nsIMsgTraitClassificationListener, nsIInterfaceRequestor)

NS_IMETHODIMP
JaCppMsgFolderDelegator::SetMethodsToDelegate(msgIDelegateList* aDelegateList) {
  if (!aDelegateList) {
    NS_WARNING("Null delegate list");
    return NS_ERROR_NULL_POINTER;
  }
  // We static_cast since we want to use the hash object directly.
  mDelegateList = static_cast<DelegateList*>(aDelegateList);
  mMethods = &(mDelegateList->mMethods);
  return NS_OK;
}
NS_IMETHODIMP
JaCppMsgFolderDelegator::GetMethodsToDelegate(
    msgIDelegateList** aDelegateList) {
  if (!mDelegateList) mDelegateList = new DelegateList();
  mMethods = &(mDelegateList->mMethods);
  NS_ADDREF(*aDelegateList = mDelegateList);
  return NS_OK;
}

NS_IMETHODIMP JaCppMsgFolderDelegator::SetJsDelegate(nsISupports* aJsDelegate) {
  // If these QIs fail, then overrides are not provided for methods in that
  // interface, which is OK.
  mJsISupports = aJsDelegate;
  mJsIMsgFolder = do_QueryInterface(aJsDelegate);
  mJsIDBChangeListener = do_QueryInterface(aJsDelegate);
  mJsIUrlListener = do_QueryInterface(aJsDelegate);
  mJsIJunkMailClassificationListener = do_QueryInterface(aJsDelegate);
  mJsIMsgTraitClassificationListener = do_QueryInterface(aJsDelegate);
  mJsIInterfaceRequestor = do_QueryInterface(aJsDelegate);
  return NS_OK;
}
NS_IMETHODIMP JaCppMsgFolderDelegator::GetJsDelegate(
    nsISupports** aJsDelegate) {
  NS_ENSURE_ARG_POINTER(aJsDelegate);
  if (mJsISupports) {
    NS_ADDREF(*aJsDelegate = mJsISupports);
    return NS_OK;
  }
  return NS_ERROR_NOT_INITIALIZED;
}

NS_IMETHODIMP JaCppMsgFolderDelegator::GetCppBase(nsISupports** aCppBase) {
  nsCOMPtr<nsISupports> cppBaseSupports;
  cppBaseSupports = NS_ISUPPORTS_CAST(nsIMsgFolder*, mCppBase);
  NS_ENSURE_STATE(cppBaseSupports);
  cppBaseSupports.forget(aCppBase);

  return NS_OK;
}

}  // namespace mailnews
}  // namespace mozilla
