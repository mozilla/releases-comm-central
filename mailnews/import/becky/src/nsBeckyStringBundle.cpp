/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "prprf.h"
#include "prmem.h"
#include "nsCOMPtr.h"
#include "nsIStringBundle.h"
#include "nsIServiceManager.h"
#include "nsIURI.h"
#include "nsServiceManagerUtils.h"
#include "nsXPCOMCIDInternal.h"

#include "nsBeckyStringBundle.h"

#define BECKY_MESSAGES_URL "chrome://messenger/locale/beckyImportMsgs.properties"

nsIStringBundle *nsBeckyStringBundle::mBundle = nullptr;

nsIStringBundle *
nsBeckyStringBundle::GetStringBundle(void)
{
  if (mBundle)
    return mBundle;

  nsresult rv;
  nsCOMPtr<nsIStringBundleService> bundleService = do_GetService(NS_STRINGBUNDLE_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv) && bundleService)
    rv = bundleService->CreateBundle(BECKY_MESSAGES_URL, &mBundle);

  return mBundle;
}

void
nsBeckyStringBundle::EnsureStringBundle(void)
{
  if (!mBundle)
    (void) GetStringBundle();
}

char16_t *
nsBeckyStringBundle::GetStringByName(const char16_t *aName)
{
  EnsureStringBundle();

  char16_t *string = nullptr;
  if (mBundle)
    mBundle->GetStringFromName(aName, &string);

  return string;
}

nsresult
nsBeckyStringBundle::FormatStringFromName(const char16_t *name,
                                          const char16_t **params,
                                          uint32_t length,
                                          char16_t **_retval)
{
  EnsureStringBundle();

  return mBundle->FormatStringFromName(name,
                                       params,
                                       length,
                                       _retval);
}

void
nsBeckyStringBundle::Cleanup(void)
{
  if (mBundle)
    mBundle->Release();
  mBundle = nullptr;
}
