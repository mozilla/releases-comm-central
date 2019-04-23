/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nstoolkitshellservice_h____
#define nstoolkitshellservice_h____

#include "nsIToolkitShellService.h"

class nsToolkitShellService : public nsIToolkitShellService {
 public:
  NS_IMETHOD IsDefaultClient(bool aStartupCheck, uint16_t aApps,
                             bool* aIsDefaultClient) = 0;

  NS_IMETHODIMP IsDefaultApplication(bool* aIsDefaultClient) {
    // This does some OS-specific checking: GConf on Linux, mailto/news protocol
    // handler on Mac, registry and application association checks on Windows.
    return IsDefaultClient(false, nsIShellService::MAIL, aIsDefaultClient);
  }
};

#endif  // nstoolkitshellservice_h____
