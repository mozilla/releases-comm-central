/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderPopulation.h"

#include "msgCore.h"
#include "nsCOMPtr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgPluggableStore.h"
#include "nsPrintfCString.h"

nsresult PopulateFolderHierarchy(nsIMsgFolder* parent,
                                 nsIMsgPluggableStore* messageStore,
                                 bool deep) {
  nsTArray<nsCString> childFolderNames;
  nsresult rv = messageStore->DiscoverChildFolders(parent, childFolderNames);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString parentName;
  rv = parent->GetName(parentName);
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto&& childFolderName : childFolderNames) {
    nsCOMPtr<nsIMsgFolder> childFolder;
    rv = parent->GetChildNamed(childFolderName, getter_AddRefs(childFolder));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!childFolder) {
      rv = parent->AddSubfolder(childFolderName, getter_AddRefs(childFolder));
      if (NS_FAILED(rv) && rv != NS_MSG_FOLDER_EXISTS) {
        NS_WARNING(
            nsPrintfCString("Unable to add child folder %s to parent %s.",
                            childFolderName.Data(), parentName.Data())
                .get());
        continue;
      }

      NS_ENSURE_TRUE(childFolder, NS_ERROR_UNEXPECTED);

      // Check that we got a name from the folder database.  If not, set the
      // folder's name to the name of the folder on the filesystem.
      nsAutoCString folderName;
      childFolder->GetName(folderName);
      if (folderName.IsEmpty()) {
        childFolder->SetName(childFolderName);
      }
    }
    NS_ENSURE_TRUE(childFolder, NS_ERROR_UNEXPECTED);

    if (deep) {
      rv = PopulateFolderHierarchy(childFolder, messageStore, deep);
      if (NS_FAILED(rv)) {
        NS_WARNING(
            nsPrintfCString("Unable to populate child folder %s in parent %s.",
                            childFolderName.Data(), parentName.Data())
                .get());
      }
    }
  }
  return NS_OK;
}
