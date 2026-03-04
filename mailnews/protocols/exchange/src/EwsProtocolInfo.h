/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLINFO_H_
#define COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLINFO_H_

#include "nsIMsgProtocolInfo.h"

class EwsProtocolInfo : public nsIMsgProtocolInfo {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGPROTOCOLINFO

  EwsProtocolInfo();

 protected:
  virtual ~EwsProtocolInfo();
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EWS_SRC_EWSPROTOCOLINFO_H_
