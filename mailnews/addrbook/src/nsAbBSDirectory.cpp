/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbBSDirectory.h"

#include "nsDirPrefs.h"
#include "nsAbBaseCID.h"
#include "nsAddrDatabase.h"
#include "nsIAbManager.h"
#include "nsServiceManagerUtils.h"
#include "nsAbDirFactoryService.h"
#include "nsIAbDirFactory.h"
#include "nsArrayEnumerator.h"

#include "nsCRTGlue.h"

nsAbBSDirectory::nsAbBSDirectory() : mInitialized(false), mServers(13) {}

nsAbBSDirectory::~nsAbBSDirectory() {}

NS_IMETHODIMP nsAbBSDirectory::Init(const char *aURI) {
  mURI = aURI;
  return NS_OK;
}

NS_IMPL_ISUPPORTS_INHERITED0(nsAbBSDirectory, nsAbDirProperty)

nsresult nsAbBSDirectory::CreateDirectoriesFromFactory(const nsACString &aURI,
                                                       DIR_Server *aServer,
                                                       bool aNotify) {
  nsresult rv;

  // Get the directory factory service
  nsCOMPtr<nsIAbDirFactoryService> dirFactoryService =
      do_GetService(NS_ABDIRFACTORYSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // Get the directory factory from the URI
  nsCOMPtr<nsIAbDirFactory> dirFactory;
  rv = dirFactoryService->GetDirFactory(aURI, getter_AddRefs(dirFactory));
  NS_ENSURE_SUCCESS(rv, rv);

  // Create the directories
  nsCOMPtr<nsISimpleEnumerator> newDirEnumerator;
  rv = dirFactory->GetDirectories(NS_ConvertUTF8toUTF16(aServer->description),
                                  aURI, nsDependentCString(aServer->prefName),
                                  getter_AddRefs(newDirEnumerator));
  NS_ENSURE_SUCCESS(rv, rv);

  // Enumerate through the directories adding them
  // to the sub directories array
  bool hasMore;
  nsCOMPtr<nsIAbManager> abManager =
      do_GetService(NS_ABMANAGER_CONTRACTID, &rv);

  while (NS_SUCCEEDED(newDirEnumerator->HasMoreElements(&hasMore)) && hasMore) {
    nsCOMPtr<nsISupports> newDirSupports;
    rv = newDirEnumerator->GetNext(getter_AddRefs(newDirSupports));
    if (NS_FAILED(rv)) continue;

    nsCOMPtr<nsIAbDirectory> childDir = do_QueryInterface(newDirSupports, &rv);
    if (NS_FAILED(rv)) continue;

    // In some cases (LDAP) the actual URI of the directory may differ from
    // aURI. Use the URI of the directory.
    nsCString uri;
    childDir->GetURI(uri);

    // Define a relationship between the preference entry and the directory.
    mServers.Put(uri, aServer);

    mSubDirectories.AppendObject(childDir);

    if (aNotify && abManager)
      abManager->NotifyDirectoryItemAdded(this, childDir);
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbBSDirectory::GetChildNodes(nsISimpleEnumerator **aResult) {
  nsresult rv = EnsureInitialized();
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_NewArrayEnumerator(aResult, mSubDirectories,
                               NS_GET_IID(nsIAbDirectory));
}

nsresult nsAbBSDirectory::EnsureInitialized() {
  if (mInitialized) return NS_OK;

  nsresult rv;
  nsCOMPtr<nsIAbDirFactoryService> dirFactoryService =
      do_GetService(NS_ABDIRFACTORYSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<DIR_Server *> *directories = DIR_GetDirectories();
  if (!directories) return NS_ERROR_FAILURE;

  int32_t count = directories->Length();
  for (int32_t i = 0; i < count; i++) {
    DIR_Server *server = directories->ElementAt(i);

    // if this is a 4.x, local .na2 addressbook (PABDirectory)
    // we must skip it.
    // mozilla can't handle 4.x .na2 addressbooks
    // note, the filename might be na2 for 4.x LDAP directories
    // (we used the .na2 file for replication), and we don't want to skip
    // those.  see bug #127007
    uint32_t fileNameLen = strlen(server->fileName);
    if (((fileNameLen > kABFileName_PreviousSuffixLen) &&
         strcmp(server->fileName + fileNameLen - kABFileName_PreviousSuffixLen,
                kABFileName_PreviousSuffix) == 0) &&
        (server->dirType == PABDirectory))
      continue;

    // Set the uri property
    nsAutoCString URI(server->uri);

    // Create the directories
    rv = CreateDirectoriesFromFactory(URI, server, false /* notify */);

    // If we failed, this could be because something has set a pref for us
    // which is now broke (e.g. no factory present). So just ignore this one
    // and move on.
    if (NS_FAILED(rv))
      NS_WARNING("CreateDirectoriesFromFactory failed - Invalid factory?");
  }

  mInitialized = true;
  // sort directories by position...
  return NS_OK;
}

NS_IMETHODIMP nsAbBSDirectory::CreateNewDirectory(const nsAString &aDirName,
                                                  const nsACString &aURI,
                                                  uint32_t aType,
                                                  const nsACString &aPrefName,
                                                  nsACString &aResult) {
  nsresult rv = EnsureInitialized();
  NS_ENSURE_SUCCESS(rv, rv);

  /*
   * TODO
   * This procedure is still MDB specific
   * due to the dependence on the current
   * nsDirPref.cpp code
   */

  nsCString URI(aURI);

  /*
   * The creation of the address book in the preferences
   * is very MDB implementation specific.
   * If the fileName attribute is null then it will
   * create an appropriate file name.
   * Somehow have to resolve this issue so that it
   * is more general.
   *
   */
  DIR_Server *server = nullptr;
  rv = DIR_AddNewAddressBook(aDirName, EmptyCString(), URI,
                             (DirectoryType)aType, aPrefName, &server);
  NS_ENSURE_SUCCESS(rv, rv);

  if (aType == JSDirectory) {
    URI.AssignLiteral(kJSDirectoryRoot);
    URI.Append(nsDependentCString(server->fileName));
  }

  aResult.Assign(server->prefName);

  rv = CreateDirectoriesFromFactory(URI, server, true /* notify */);
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}

NS_IMETHODIMP nsAbBSDirectory::CreateDirectoryByURI(
    const nsAString &aDisplayName, const nsACString &aURI) {
  nsresult rv = EnsureInitialized();
  NS_ENSURE_SUCCESS(rv, rv);

  DIR_Server *server = nullptr;
  rv = DIR_AddNewAddressBook(aDisplayName, EmptyCString(), aURI, PABDirectory,
                             EmptyCString(), &server);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = CreateDirectoriesFromFactory(aURI, server, true /* notify */);
  NS_ENSURE_SUCCESS(rv, rv);
  return rv;
}

NS_IMETHODIMP nsAbBSDirectory::DeleteDirectory(nsIAbDirectory *directory) {
  NS_ENSURE_ARG_POINTER(directory);

  nsresult rv = EnsureInitialized();
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString uri;
  directory->GetURI(uri);

  DIR_Server *server = nullptr;
  mServers.Get(uri, &server);

  if (!server) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIAbManager> abManager =
      do_GetService(NS_ABMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISimpleEnumerator> dirEnumerator;
  abManager->GetDirectories(getter_AddRefs(dirEnumerator));

  nsCOMArray<nsIAbDirectory> directories;
  bool hasMore;
  while (NS_SUCCEEDED(dirEnumerator->HasMoreElements(&hasMore)) && hasMore) {
    nsCOMPtr<nsISupports> dirSupports;
    rv = dirEnumerator->GetNext(getter_AddRefs(dirSupports));
    if (NS_FAILED(rv)) continue;

    nsCOMPtr<nsIAbDirectory> d = do_QueryInterface(dirSupports, &rv);
    if (NS_FAILED(rv)) continue;

    nsCString u;
    d->GetURI(u);

    DIR_Server *s;
    mServers.Get(u, &s);

    if (s && s == server) {
      if (d) {
        directories.AppendElement(d);
      }
    }
  }

  DIR_DeleteServerFromList(server);

  nsCOMPtr<nsIAbDirFactoryService> dirFactoryService =
      do_GetService(NS_ABDIRFACTORYSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t count = directories.Count();

  for (uint32_t i = 0; i < count; i++) {
    nsCOMPtr<nsIAbDirectory> d = directories[i];

    nsCString uri;
    rv = d->GetURI(uri);
    NS_ENSURE_SUCCESS(rv, rv);

    mServers.Remove(uri);

    for (uint32_t i = 0; i < mSubDirectories.Length(); ++i) {
      nsAutoCString u;
      mSubDirectories[i]->GetURI(u);
      if (u.Equals(uri)) {
        mSubDirectories.RemoveObjectsAt(i, 1);
        break;
      }
    }

    if (abManager) abManager->NotifyDirectoryDeleted(this, d);

    nsCOMPtr<nsIAbDirFactory> dirFactory;
    rv = dirFactoryService->GetDirFactory(uri, getter_AddRefs(dirFactory));
    if (NS_FAILED(rv)) continue;

    rv = dirFactory->DeleteDirectory(d);
  }

  return rv;
}

NS_IMETHODIMP nsAbBSDirectory::HasDirectory(nsIAbDirectory *dir, bool *hasDir) {
  if (!hasDir) return NS_ERROR_NULL_POINTER;

  nsresult rv = EnsureInitialized();
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString uri;
  dir->GetURI(uri);

  DIR_Server *dirServer = nullptr;
  mServers.Get(uri, &dirServer);
  return DIR_ContainsServer(dirServer, hasDir);
}

NS_IMETHODIMP nsAbBSDirectory::UseForAutocomplete(
    const nsACString &aIdentityKey, bool *aResult) {
  // For the "root" directory (kAllDirectoryRoot) always return true so that
  // we can search sub directories that may or may not be local.
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = true;
  return NS_OK;
}

NS_IMETHODIMP nsAbBSDirectory::GetURI(nsACString &aURI) {
  if (mURI.IsEmpty()) return NS_ERROR_NOT_INITIALIZED;

  aURI = mURI;
  return NS_OK;
}
