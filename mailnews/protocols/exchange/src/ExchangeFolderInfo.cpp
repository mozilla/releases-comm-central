/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExchangeFolderInfo.h"

#include <utility>

#include "ExchangeFolder.h"
#include "mozilla/Try.h"
#include "nsIMsgEnumerator.h"
#include "nsIMsgHdr.h"

NS_IMPL_ISUPPORTS(ExchangeFolderInfo, IExchangeFolderInfo)

NS_IMETHODIMP ExchangeFolderInfo::GetCurrentMessageIds(
    nsTArray<nsCString>& ids) {
  ids.Clear();
  nsCOMPtr<nsIMsgEnumerator> messages;
  MOZ_TRY(mDB->EnumerateMessages(getter_AddRefs(messages)));

  bool hasMore;
  MOZ_TRY(messages->HasMoreElements(&hasMore));
  while (hasMore) {
    nsCOMPtr<nsIMsgDBHdr> header;
    MOZ_TRY(messages->GetNext(getter_AddRefs(header)));
    nsCString id;
    MOZ_TRY(header->GetStringProperty(kExchangeIdProperty, id));
    if (!id.IsEmpty()) {
      ids.AppendElement(std::move(id));
    }
    MOZ_TRY(messages->HasMoreElements(&hasMore));
  }
  return NS_OK;
}
