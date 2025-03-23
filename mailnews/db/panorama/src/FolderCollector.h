/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIFile.h"
#include "nsIFolder.h"
#include "nsIFolderDatabase.h"
#include "nsIMsgFolderCache.h"

namespace mozilla::mailnews {

class FolderCollector {
 public:
  ~FolderCollector();

  void FindChildren(nsIFolder* aParent, nsIFile* aFile);

 private:
  nsCOMPtr<nsIFolderDatabase> mDatabase;
  void EnsureDatabase();

  nsCOMPtr<nsIMsgFolderCache> mFolderCache;
  void EnsureFolderCache();
};

}  // namespace mozilla::mailnews
