/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nscore.h"
#include "nsShellService.h"
#include "nsString.h"
#include "nsIShellService.h"
#include "mozilla/Attributes.h"
#include "nsSuiteCID.h"

#include <windows.h>

typedef struct {
  const char* keyName;
  const char* valueName;
  const char* valueData;

  int32_t flags;
} SETTING;

class nsWindowsShellService final : public nsIShellService
{
public:
  nsWindowsShellService() {};
  nsresult Init();

  NS_DECL_ISUPPORTS
  NS_DECL_NSISHELLSERVICE

protected:
  ~nsWindowsShellService() {}
  bool IsDefaultClientVista(uint16_t aApps, bool* aIsDefaultClient);
  bool TestForDefault(SETTING aSettings[], int32_t aSize);

private:
  nsString mAppLongPath;
  nsString mAppShortPath;
};

