/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prprf.h"
#include "prmem.h"
#include "nsCOMPtr.h"
#include "nsIStringBundle.h"
#include "nsServiceManagerUtils.h"
#include "nsXPCOMCIDInternal.h"

#include "nsBeckyStringBundle.h"

#define BECKY_MESSAGES_URL \
  "chrome://messenger/locale/beckyImportMsgs.properties"

nsCOMPtr<nsIStringBundle> nsBeckyStringBundle::mBundle = nullptr;

void nsBeckyStringBundle::GetStringBundle(void) {
  if (mBundle) return;

  nsresult rv;
  nsCOMPtr<nsIStringBundleService> bundleService =
      do_GetService(NS_STRINGBUNDLE_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv) && bundleService)
    rv = bundleService->CreateBundle(BECKY_MESSAGES_URL,
                                     getter_AddRefs(mBundle));
}

void nsBeckyStringBundle::EnsureStringBundle(void) {
  if (!mBundle) GetStringBundle();
}

char16_t* nsBeckyStringBundle::GetStringByName(const char* aName) {
  EnsureStringBundle();

  if (mBundle) {
    nsAutoString string;
    mBundle->GetStringFromName(aName, string);
    return ToNewUnicode(string);
  }

  return nullptr;
}

nsresult nsBeckyStringBundle::FormatStringFromName(const char* name,
                                                   nsTArray<nsString>& params,
                                                   nsAString& _retval) {
  EnsureStringBundle();

  return mBundle->FormatStringFromName(name, params, _retval);
}

void nsBeckyStringBundle::Cleanup(void) { mBundle = nullptr; }
