/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prprf.h"
#include "prmem.h"
#include "nsCOMPtr.h"
#include "nsIStringBundle.h"
#include "nsWMStringBundle.h"
#include "mozilla/Components.h"

#define WM_MSGS_URL "chrome://messenger/locale/wmImportMsgs.properties"

MOZ_RUNINIT nsCOMPtr<nsIStringBundle> nsWMStringBundle::m_pBundle = nullptr;

void nsWMStringBundle::GetStringBundle(void) {
  if (m_pBundle) return;

  nsCOMPtr<nsIStringBundleService> sBundleService =
      mozilla::components::StringBundle::Service();
  if (sBundleService) {
    sBundleService->CreateBundle(WM_MSGS_URL, getter_AddRefs(m_pBundle));
  }
}

void nsWMStringBundle::GetStringByID(int32_t stringID, nsString& result) {
  char16_t* ptrv = GetStringByID(stringID);
  result = ptrv;
  FreeString(ptrv);
}

char16_t* nsWMStringBundle::GetStringByID(int32_t stringID) {
  if (!m_pBundle) GetStringBundle();

  if (m_pBundle) {
    nsAutoString str;
    nsresult rv = m_pBundle->GetStringFromID(stringID, str);

    if (NS_SUCCEEDED(rv)) return ToNewUnicode(str);
  }

  nsString resultString;
  resultString.AppendLiteral("[StringID ");
  resultString.AppendInt(stringID);
  resultString.AppendLiteral("?]");

  return ToNewUnicode(resultString);
}

void nsWMStringBundle::Cleanup(void) { m_pBundle = nullptr; }
