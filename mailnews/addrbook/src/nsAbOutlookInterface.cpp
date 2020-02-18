/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsAbOutlookInterface.h"
#include "nsAbWinHelper.h"
#include "nsComponentManagerUtils.h"
#include "nsAbBaseCID.h"

NS_IMPL_ISUPPORTS(nsAbOutlookInterface, nsIAbOutlookInterface)

nsAbOutlookInterface::nsAbOutlookInterface(void) {}

nsAbOutlookInterface::~nsAbOutlookInterface(void) {}

extern const char *kOutlookDirectoryScheme;

NS_IMETHODIMP
nsAbOutlookInterface::GetFolderURIs(const nsACString &aURI,
                                    nsTArray<nsCString> &uris) {
  uris.Clear();

  nsresult rv = NS_OK;
  nsCString stub;
  nsCString entry;
  nsAbWinType abType =
      getAbWinType(kOutlookDirectoryScheme, nsCString(aURI).get(), stub, entry);

  if (abType == nsAbWinType_Unknown) {
    return NS_ERROR_FAILURE;
  }
  nsAbWinHelperGuard mapiAddBook(abType);
  nsMapiEntryArray folders;
  NS_ENSURE_SUCCESS(rv, rv);
  if (!mapiAddBook->IsOK() || !mapiAddBook->GetFolders(folders)) {
    return NS_ERROR_FAILURE;
  }

  uris.SetCapacity(folders.mNbEntries);

  nsAutoCString entryId;
  nsAutoCString uri;

  for (ULONG i = 0; i < folders.mNbEntries; ++i) {
    folders.mEntries[i].ToString(entryId);
    buildAbWinUri(kOutlookDirectoryScheme, abType, uri);
    uri.Append(entryId);
    uris.AppendElement(uri);
  }
  return NS_OK;
}
