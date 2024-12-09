/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsGNOMEShellService_h_
#define nsGNOMEShellService_h_

#include "nsIShellService.h"
#include "nsString.h"
#include "nsToolkitShellService.h"

#define BRAND_PROPERTIES "chrome://branding/locale/brand.properties"

#define NS_MAILGNOMEINTEGRATION_CID \
  {0xbddef0f4, 0x5e2d, 0x4846, {0xbd, 0xec, 0x86, 0xd0, 0x78, 0x1d, 0x8d, 0xed}}

class nsGNOMEShellService : public nsIShellService,
                            public nsToolkitShellService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSISHELLSERVICE

  nsresult Init();
  nsGNOMEShellService();

 protected:
  virtual ~nsGNOMEShellService() {};

  bool KeyMatchesAppName(const char* aKeyValue) const;
  bool checkDefault(const char* const* aProtocols, unsigned int aLength);
  nsresult MakeDefault(const char* const* aProtocols,
                       unsigned int aProtocolsLength, const char* mimeType,
                       const char* extensions);

 private:
  bool GetAppPathFromLauncher();
  bool CheckHandlerMatchesAppName(const nsACString& handler) const;
  bool mUseLocaleFilenames;
  bool mCheckedThisSession;
  nsCString mAppPath;
  bool mAppIsInPath;
};

#endif
