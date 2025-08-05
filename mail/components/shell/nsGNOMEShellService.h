/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAIL_COMPONENTS_SHELL_NSGNOMESHELLSERVICE_H_
#define COMM_MAIL_COMPONENTS_SHELL_NSGNOMESHELLSERVICE_H_

#include "nsIShellService.h"
#include "nsString.h"
#include "nsToolkitShellService.h"

#define BRAND_PROPERTIES "chrome://branding/locale/brand.properties"

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

#endif  // COMM_MAIL_COMPONENTS_SHELL_NSGNOMESHELLSERVICE_H_
