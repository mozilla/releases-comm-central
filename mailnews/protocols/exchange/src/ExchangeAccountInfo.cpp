/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExchangeAccountInfo.h"

#include <utility>

#include "ExchangeFolder.h"
#include "nsIMsgFolder.h"
#include "nsMsgFolderFlags.h"

NS_IMPL_ISUPPORTS(ExchangeAccountInfo, IExchangeAccountInfo)

NS_IMETHODIMP ExchangeAccountInfo::GetCurrentFolderIds(
    nsTArray<nsCString>& ids) {
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsresult rv = mServer->GetRootFolder(getter_AddRefs(rootFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsTArray<RefPtr<nsIMsgFolder>> folders;
  rv = rootFolder->GetDescendants(folders);
  NS_ENSURE_SUCCESS(rv, rv);

  ids.Clear();
  ids.SetCapacity(folders.Length());

  for (const auto& folder : folders) {
    bool isVirtual;
    rv = folder->GetFlag(nsMsgFolderFlags::Virtual, &isVirtual);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!isVirtual) {
      nsCString id;
      rv = folder->GetStringProperty(kExchangeIdProperty, id);
      NS_ENSURE_SUCCESS(rv, rv);

      ids.AppendElement(std::move(id));
    }
  }

  return NS_OK;
}
