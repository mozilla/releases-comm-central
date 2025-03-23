/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderCollector.h"

#include "mozilla/Components.h"
#include "mozilla/RefPtr.h"
#include "nsIDatabaseCore.h"
#include "nsIDirectoryEnumerator.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgFolderCacheElement.h"
#include "nsMsgLocalStoreUtils.h"
#include "nsServiceManagerUtils.h"

namespace mozilla::mailnews {

/**
 * This is a stub mailbox finder for mbox-based accounts. It should live in
 * `nsMsgBrkMBoxStore` (and there should be a maildir equivalent) but until we
 * have decided it's really what we want to do and have tested it properly, it
 * lives here where it cannot do any harm to live code.
 */

FolderCollector::~FolderCollector() {
  mDatabase = nullptr;
  mFolderCache = nullptr;
}

void FolderCollector::EnsureDatabase() {
  if (!mDatabase) {
    nsCOMPtr<nsIDatabaseCore> core =
        do_GetService("@mozilla.org/msgDatabase/msgDBService;1");
    core->GetFolders(getter_AddRefs(mDatabase));
  }
}

void FolderCollector::EnsureFolderCache() {
  if (!mFolderCache) {
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        components::AccountManager::Service();
    accountManager->GetFolderCache(getter_AddRefs(mFolderCache));
  }
}

/**
 * Find the folders that exist on the filesystem. `aFile` is either:
 * - an incoming server's directory (from nsIMsgIncomingServer.localPath), in
 *   which case we'll check the directory entries for mailboxes, or
 * - a mailbox file (which may or may not exist), in which case we'll get the
 *   equivalent directory (which also may or many not exist) and check its
 *   entries for mailboxes.
 */
void FolderCollector::FindChildren(nsIFolder* aParent, nsIFile* aFile) {
  nsTHashMap<nsCString, RefPtr<nsIFile>> childFiles;
  // For folders where the name isn't the file name.
  nsTHashMap<nsCString, RefPtr<nsIFile>> aliasFiles;

  bool isDirectory;
  nsAutoString leafName;

  nsCOMPtr<nsIFile> directory;

  aFile->IsDirectory(&isDirectory);
  if (isDirectory) {
    directory = aFile;
  } else {
    aFile->GetLeafName(leafName);

    nsCOMPtr<nsIFile> dirForSame;
    aFile->Clone(getter_AddRefs(dirForSame));
    dirForSame->SetLeafName(leafName + u".sbd"_ns);

    dirForSame->IsDirectory(&isDirectory);
    if (isDirectory) {
      directory = dirForSame;
    }
  }

  if (!directory) {
    return;
  }

  nsCOMPtr<nsIDirectoryEnumerator> entries;
  nsresult rv = directory->GetDirectoryEntries(getter_AddRefs(entries));
  NS_ENSURE_SUCCESS_VOID(rv);
  bool more;
  while (NS_SUCCEEDED(entries->HasMoreElements(&more)) && more) {
    nsCOMPtr<nsIFile> file;
    entries->GetNextFile(getter_AddRefs(file));

    file->GetLeafName(leafName);

    const nsAString& extension = Substring(leafName, leafName.Length() - 4, 4);

    file->IsDirectory(&isDirectory);
    if (isDirectory) {
      if (extension.Equals(u".sbd"_ns)) {
        leafName.Truncate(leafName.Length() - 4);

        nsCOMPtr<nsIFile> fileForSame;
        file->Clone(getter_AddRefs(fileForSame));
        fileForSame->SetLeafName(leafName);

        childFiles.InsertOrUpdate(NS_ConvertUTF16toUTF8(leafName), fileForSame);
      }
    } else if (!nsMsgLocalStoreUtils::nsShouldIgnoreFile(leafName, file)) {
      nsCOMPtr<nsIFile> dirForSame;
      file->Clone(getter_AddRefs(dirForSame));
      nsAutoString dirLeafName(leafName);
      dirLeafName.Append(u".sbd"_ns);
      dirForSame->SetLeafName(dirLeafName);
      dirForSame->IsDirectory(&isDirectory);
      if (!isDirectory) {
        childFiles.InsertOrUpdate(NS_ConvertUTF16toUTF8(leafName), file);
      }
    } else if (extension.Equals(u".msf"_ns)) {
      leafName.Truncate(leafName.Length() - 4);

      nsCOMPtr<nsIFile> storeForSame;
      file->Clone(getter_AddRefs(storeForSame));
      storeForSame->SetLeafName(leafName);
      bool exists;
      storeForSame->Exists(&exists);
      if (!exists) {
        childFiles.InsertOrUpdate(NS_ConvertUTF16toUTF8(leafName),
                                  storeForSame);
      }
    }
  }

  // Now save the children in the database.

  nsTArray<nsCString> childNames;
  nsTHashMap<nsCString, int64_t> childFlags;
  for (auto iter = childFiles.ConstIter(); !iter.Done(); iter.Next()) {
    nsAutoCString childName;
    childName.Assign(iter.Key());

    RefPtr<nsIFile> file = iter.UserData();
    nsCOMPtr<nsIFile> summaryFile;
    file->Clone(getter_AddRefs(summaryFile));
    nsAutoString leafName;
    summaryFile->GetLeafName(leafName);
    summaryFile->SetLeafName(leafName + u".msf"_ns);

    nsCString persistentPath;
    if (NS_SUCCEEDED(summaryFile->GetPersistentDescriptor(persistentPath))) {
      EnsureFolderCache();
      nsCOMPtr<nsIMsgFolderCacheElement> cacheElement;
      mFolderCache->GetCacheElement(persistentPath, false,
                                    getter_AddRefs(cacheElement));

      if (cacheElement) {
        nsAutoCString folderName;
        rv = cacheElement->GetCachedString("folderName", folderName);
        if (NS_SUCCEEDED(rv) && !folderName.IsEmpty()) {
          childName.Assign(folderName);
          aliasFiles.InsertOrUpdate(folderName, file);
        }
        int64_t flags;
        rv = cacheElement->GetCachedInt64("flags", &flags);
        if (NS_SUCCEEDED(rv)) {
          childFlags.InsertOrUpdate(folderName, flags);
        }
      }
    }

    childNames.AppendElement(childName);
  }

  EnsureDatabase();
  mDatabase->Reconcile(aParent, childNames);

  nsTArray<RefPtr<nsIFolder>> children;
  aParent->GetChildren(children);
  for (auto child : children) {
    nsAutoCString name;
    child->GetName(name);

    int64_t flags;
    if (childFlags.Get(name, &flags)) {
      mDatabase->UpdateFlags(child, flags);
    }

    RefPtr<nsIFile> file;
    if (childFiles.Get(name, &file)) {
      FindChildren(child, file);
    } else if (aliasFiles.Get(name, &file)) {
      FindChildren(child, file);
    }
  }
}

}  // namespace mozilla::mailnews
