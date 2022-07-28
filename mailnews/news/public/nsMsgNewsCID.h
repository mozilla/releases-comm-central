/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMsgNewsCID_h__
#define nsMsgNewsCID_h__

#include "nsISupports.h"
#include "nsIFactory.h"
#include "nsIComponentManager.h"
#include "nsMsgBaseCID.h"

//
// nsMsgNewsFolder
#define NS_NEWSFOLDERRESOURCE_CONTRACTID \
  NS_FOLDER_FACTORY_CONTRACTID_PREFIX "news"
#define NS_NEWSFOLDERRESOURCE_CID                    \
  { /* 4ace448a-f6d4-11d2-880d-004005263078 */       \
    0x4ace448a, 0xf6d4, 0x11d2, {                    \
      0x88, 0x0d, 0x00, 0x40, 0x05, 0x26, 0x30, 0x78 \
    }                                                \
  }

//
// nsNntpService
//

// #define NS_NNTPPROTOCOLINFO_CONTRACTID \
//   NS_MSGPROTOCOLINFO_CONTRACTID_PREFIX "nntp"

// #define NS_NEWSPROTOCOLHANDLER_CONTRACTID \
//   NS_NETWORK_PROTOCOL_CONTRACTID_PREFIX "news"
// #define NS_SNEWSPROTOCOLHANDLER_CONTRACTID \
//   NS_NETWORK_PROTOCOL_CONTRACTID_PREFIX "snews"
// #define NS_NNTPPROTOCOLHANDLER_CONTRACTID \
//   NS_NETWORK_PROTOCOL_CONTRACTID_PREFIX "nntp"
// #define NS_NEWSMESSAGESERVICE_CONTRACTID \
//   "@mozilla.org/messenger/messageservice;1?type=news-message"
// #define NS_NNTPMESSAGESERVICE_CONTRACTID \
//   "@mozilla.org/messenger/messageservice;1?type=news"
#define NS_NNTPSERVICE_CONTRACTID "@mozilla.org/messenger/nntpservice;1"

//
// nsNntpUrl
//
#define NS_NNTPURL_CONTRACTID "@mozilla.org/messenger/nntpurl;1"
#define NS_NNTPURL_CID                             \
  { /* 196B4B30-E18C-11d2-806E-006008128C4E */     \
    0x196b4b30, 0xe18c, 0x11d2, {                  \
      0x80, 0x6e, 0x0, 0x60, 0x8, 0x12, 0x8c, 0x4e \
    }                                              \
  }

//
// nsNewsDownloadDialogArgs
//
#define NS_NEWSDOWNLOADDIALOGARGS_CONTRACTID \
  "@mozilla.org/messenger/newsdownloaddialogargs;1"
#define NS_NEWSDOWNLOADDIALOGARGS_CID                \
  { /* 1540689e-1dd2-11b2-933d-f0d1e460ef4a */       \
    0x1540689e, 0x1dd2, 0x11b2, {                    \
      0x93, 0x3d, 0xf0, 0xd1, 0xe4, 0x60, 0xef, 0x4a \
    }                                                \
  }

#endif  // nsMsgNewsCID_h__
