/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prprf.h"
#include "prmem.h"
#include "nsCOMPtr.h"
#include "nsIStringBundle.h"
#include "nsImportStringBundle.h"
#include "mozilla/Components.h"

nsresult nsImportStringBundle::GetStringBundle(const char* aPropertyURL,
                                               nsIStringBundle** aBundle) {
  nsresult rv;

  nsCOMPtr<nsIStringBundleService> sBundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(sBundleService, NS_ERROR_UNEXPECTED);
  rv = sBundleService->CreateBundle(aPropertyURL, aBundle);

  return rv;
}

void nsImportStringBundle::GetStringByID(int32_t aStringID,
                                         nsIStringBundle* aBundle,
                                         nsString& aResult) {
  aResult.Adopt(GetStringByID(aStringID, aBundle));
}

char16_t* nsImportStringBundle::GetStringByID(int32_t aStringID,
                                              nsIStringBundle* aBundle) {
  if (aBundle) {
    nsAutoString str;
    nsresult rv = aBundle->GetStringFromID(aStringID, str);
    if (NS_SUCCEEDED(rv)) return ToNewUnicode(str);
  }

  nsString resultString(u"[StringID "_ns);
  resultString.AppendInt(aStringID);
  resultString.AppendLiteral("?]");

  return ToNewUnicode(resultString);
}

void nsImportStringBundle::GetStringByName(const char* aName,
                                           nsIStringBundle* aBundle,
                                           nsString& aResult) {
  aResult.Adopt(GetStringByName(aName, aBundle));
}

char16_t* nsImportStringBundle::GetStringByName(const char* aName,
                                                nsIStringBundle* aBundle) {
  if (aBundle) {
    nsAutoString str;
    nsresult rv = aBundle->GetStringFromName(aName, str);
    if (NS_SUCCEEDED(rv)) return ToNewUnicode(str);
  }

  nsString resultString(u"[StringName "_ns);
  resultString.Append(NS_ConvertUTF8toUTF16(aName).get());
  resultString.AppendLiteral("?]");

  return ToNewUnicode(resultString);
}
