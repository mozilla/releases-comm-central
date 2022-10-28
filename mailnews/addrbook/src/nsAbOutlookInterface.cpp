/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsAbOutlookInterface.h"
#include "nsAbWinHelper.h"
#include "nsComponentManagerUtils.h"

NS_IMPL_ISUPPORTS(nsAbOutlookInterface, nsIAbOutlookInterface)

nsAbOutlookInterface::nsAbOutlookInterface(void) {}

nsAbOutlookInterface::~nsAbOutlookInterface(void) {}

NS_IMETHODIMP
nsAbOutlookInterface::GetFolderURIs(const nsACString& aURI,
                                    nsTArray<nsCString>& uris) {
  uris.Clear();
  nsresult rv = NS_OK;

  nsAbWinHelperGuard mapiAddBook;
  nsMapiEntryArray folders;
  NS_ENSURE_SUCCESS(rv, rv);
  if (!mapiAddBook->IsOK() || !mapiAddBook->GetFolders(folders)) {
    return NS_ERROR_FAILURE;
  }

  uris.SetCapacity(folders.mNbEntries);

  for (ULONG i = 0; i < folders.mNbEntries; ++i) {
    nsAutoCString entryId;
    nsAutoCString uri(kOutlookDirectoryScheme);
    folders.mEntries[i].ToString(entryId);
    uri.Append(entryId);
    uris.AppendElement(uri);
  }
  return NS_OK;
}
