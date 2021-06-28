/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMessageBaseCID_h__
#define nsMessageBaseCID_h__

#include "nsISupports.h"
#include "nsIFactory.h"
#include "nsIComponentManager.h"

//
// nsMsgAccountManager
//
#define NS_MSGACCOUNTMANAGER_CONTRACTID \
  "@mozilla.org/messenger/account-manager;1"

#define NS_MSGACCOUNTMANAGER_CID                   \
  {                                                \
    0xd2876e50, 0xe62c, 0x11d2, {                  \
      0xb7, 0xfc, 0x0, 0x80, 0x5f, 0x5, 0xff, 0xa5 \
    }                                              \
  }

//
// nsMsgIdentity
//
#define NS_MSGIDENTITY_CONTRACTID "@mozilla.org/messenger/identity;1"

#define NS_MSGIDENTITY_CID                         \
  {                                                \
    0x8fbf6ac0, 0xebcc, 0x11d2, {                  \
      0xb7, 0xfc, 0x0, 0x80, 0x5f, 0x5, 0xff, 0xa5 \
    }                                              \
  }

//
// nsMsgIncomingServer
#define NS_MSGINCOMINGSERVER_CONTRACTID_PREFIX \
  "@mozilla.org/messenger/server;1?type="

#define NS_MSGINCOMINGSERVER_CONTRACTID \
  NS_MSGINCOMINGSERVER_CONTRACTID_PREFIX "generic"

#define NS_MSGINCOMINGSERVER_CID                     \
  {                                                  \
    0x66e5ff08, 0x5126, 0x11d3, {                    \
      0x97, 0x11, 0x00, 0x60, 0x08, 0x94, 0x80, 0x10 \
    }                                                \
  }

//
// nsMsgAccount
//
#define NS_MSGACCOUNT_CONTRACTID "@mozilla.org/messenger/account;1"

#define NS_MSGACCOUNT_CID                          \
  {                                                \
    0x68b25510, 0xe641, 0x11d2, {                  \
      0xb7, 0xfc, 0x0, 0x80, 0x5f, 0x5, 0xff, 0xa5 \
    }                                              \
  }

//
// nsMsgFilterService
//
#define NS_MSGFILTERSERVICE_CONTRACTID \
  "@mozilla.org/messenger/services/filters;1"

#define NS_MSGFILTERSERVICE_CID                     \
  {                                                 \
    0x5cbb0700, 0x04bc, 0x11d3, {                   \
      0xa5, 0x0a, 0x0, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                               \
  }

//
// nsMsgSearchSession
//
/* e9a7cd70-0303-11d3-a50a-0060b0fc04b7 */
#define NS_MSGSEARCHSESSION_CID                     \
  {                                                 \
    0xe9a7cd70, 0x0303, 0x11d3, {                   \
      0xa5, 0x0a, 0x0, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                               \
  }

#define NS_MSGSEARCHSESSION_CONTRACTID "@mozilla.org/messenger/searchSession;1"

#define NS_MSGSEARCHTERM_CID                        \
  {                                                 \
    0xe1da397d, 0xfdc5, 0x4b23, {                   \
      0xa6, 0xfe, 0xd4, 0x6a, 0x3, 0x4d, 0x80, 0xb3 \
    }                                               \
  }

#define NS_MSGSEARCHTERM_CONTRACTID "@mozilla.org/messenger/searchTerm;1"

//
// nsMsgSearchValidityManager
//
#define NS_MSGSEARCHVALIDITYMANAGER_CID              \
  {                                                  \
    0x1510faee, 0xad1a, 0x4194, {                    \
      0x80, 0x39, 0x33, 0xde, 0x32, 0xd5, 0xa8, 0x82 \
    }                                                \
  }

#define NS_MSGSEARCHVALIDITYMANAGER_CONTRACTID \
  "@mozilla.org/mail/search/validityManager;1"

//
// nsMsgMailSession
//
#define NS_MSGMAILSESSION_CONTRACTID "@mozilla.org/messenger/services/session;1"

#define NS_MSGMAILSESSION_CID                      \
  {                                                \
    0xd5124441, 0xd59e, 0x11d2, {                  \
      0x80, 0x6a, 0x0, 0x60, 0x8, 0x12, 0x8c, 0x4e \
    }                                              \
  }

//
// nsMsgBiffManager
//
#define NS_MSGBIFFMANAGER_CONTRACTID "@mozilla.org/messenger/biffManager;1"

#define NS_MSGBIFFMANAGER_CID                      \
  {                                                \
    0x4a374e7e, 0x190f, 0x11d3, {                  \
      0x8a, 0x88, 0x0, 0x60, 0xb0, 0xfc, 0x4, 0xd2 \
    }                                              \
  }

//
// nsMsgPurgeService
//
#define NS_MSGPURGESERVICE_CONTRACTID "@mozilla.org/messenger/purgeService;1"

#define NS_MSGPURGESERVICE_CID                       \
  {                                                  \
    0xa687b474, 0xafd8, 0x418f, {                    \
      0x8a, 0xd9, 0xf3, 0x62, 0x20, 0x2a, 0xe9, 0xa9 \
    }                                                \
  }

//
// nsStatusBarBiffManager
//
#define NS_STATUSBARBIFFMANAGER_CONTRACTID \
  "@mozilla.org/messenger/statusBarBiffManager;1"

#define NS_STATUSBARBIFFMANAGER_CID                  \
  {                                                  \
    0x7f9a9fb0, 0x4161, 0x11d4, {                    \
      0x98, 0x76, 0x00, 0xc0, 0x4f, 0xa0, 0xd2, 0xa6 \
    }                                                \
  }

//
// nsCopyMessageStreamListener
//
#define NS_COPYMESSAGESTREAMLISTENER_CONTRACTID \
  "@mozilla.org/messenger/copymessagestreamlistener;1"

#define NS_COPYMESSAGESTREAMLISTENER_CID           \
  {                                                \
    0x7741daed, 0x2125, 0x11d3, {                  \
      0x8a, 0x90, 0x0, 0x60, 0xb0, 0xfc, 0x4, 0xd2 \
    }                                              \
  }

//
// nsMsgCopyService
//
#define NS_MSGCOPYSERVICE_CONTRACTID \
  "@mozilla.org/messenger/messagecopyservice;1"

#define NS_MSGCOPYSERVICE_CID                        \
  {                                                  \
    0xc766e666, 0x29bd, 0x11d3, {                    \
      0xaf, 0xb3, 0x00, 0x10, 0x83, 0x00, 0x2d, 0xa8 \
    }                                                \
  }

#define NS_MSGFOLDERCACHE_CONTRACTID "@mozilla.org/messenger/msgFolderCache;1"

#define NS_MSGFOLDERCACHE_CID                        \
  {                                                  \
    0xbcdca970, 0x3b22, 0x11d3, {                    \
      0x8d, 0x76, 0x00, 0x80, 0xf5, 0x8a, 0x66, 0x17 \
    }                                                \
  }

//
// nsMessengerBootstrap
//
#define NS_MESSENGERBOOTSTRAP_CONTRACTID \
  "@mozilla.org/appshell/component/messenger;1"
#define NS_MAILOPTIONSTARTUPHANDLER_CONTRACTID \
  "@mozilla.org/commandlinehandler/general-startup;1?type=options"
#define NS_MESSENGERWINDOWSERVICE_CONTRACTID \
  "@mozilla.org/messenger/windowservice;1"
#define NS_MESSENGERWINDOWSERVICE_CID                \
  {                                                  \
    0xa01b6724, 0x1dd1, 0x11b2, {                    \
      0xaa, 0xb9, 0x82, 0xf2, 0x4c, 0x59, 0x5f, 0x41 \
    }                                                \
  }

//
// nsMessenger
//
#define NS_MESSENGER_CONTRACTID "@mozilla.org/messenger;1"

//
// nsMsgStatusFeedback
//
#define NS_MSGSTATUSFEEDBACK_CONTRACTID \
  "@mozilla.org/messenger/statusfeedback;1"

#define NS_MSGSTATUSFEEDBACK_CID                   \
  {                                                \
    0xbd85a417, 0x5433, 0x11d3, {                  \
      0x8a, 0xc5, 0x0, 0x60, 0xb0, 0xfc, 0x4, 0xd2 \
    }                                              \
  }

//
// nsMsgWindow
//
#define NS_MSGWINDOW_CONTRACTID "@mozilla.org/messenger/msgwindow;1"

#define NS_MSGWINDOW_CID                           \
  {                                                \
    0xbb460dff, 0x8bf0, 0x11d3, {                  \
      0x8a, 0xfe, 0x0, 0x60, 0xb0, 0xfc, 0x4, 0xd2 \
    }                                              \
  }

#define NS_MSGLOGONREDIRECTORSERVICE_CONTRACTID \
  "@mozilla.org/messenger/msglogonredirector;1"

#define NS_MSGLOGONREDIRECTORSERVICE_CID             \
  {                                                  \
    0x0d7456ae, 0xe28a, 0x11d3, {                    \
      0xa5, 0x60, 0x00, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                                \
  }

//
// nsSubscribableServer
//
#define NS_SUBSCRIBABLESERVER_CONTRACTID \
  "@mozilla.org/messenger/subscribableserver;1"

#define NS_SUBSCRIBABLESERVER_CID                    \
  {                                                  \
    0x8510876a, 0x1dd2, 0x11b2, {                    \
      0x82, 0x53, 0x91, 0xf7, 0x1b, 0x34, 0x8a, 0x25 \
    }                                                \
  }

#define NS_MSGLOCALFOLDERCOMPACTOR_CONTRACTID \
  "@mozilla.org/messenger/localfoldercompactor;1"

#define NS_MSGLOCALFOLDERCOMPACTOR_CID               \
  {                                                  \
    0x7d1d315c, 0xe5c6, 0x11d4, {                    \
      0xa5, 0xb7, 0x00, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                                \
  }

#define NS_MSGOFFLINESTORECOMPACTOR_CONTRACTID \
  "@mozilla.org/messenger/offlinestorecompactor;1"

#define NS_MSG_OFFLINESTORECOMPACTOR_CID             \
  {                                                  \
    0x2db43d16, 0xe5c8, 0x11d4, {                    \
      0xa5, 0xb7, 0x00, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                                \
  }

//
// nsMsgDBView
//
#define NS_MSGDBVIEW_CONTRACTID_PREFIX \
  "@mozilla.org/messenger/msgdbview;1?type="

#define NS_MSGTHREADEDDBVIEW_CONTRACTID \
  NS_MSGDBVIEW_CONTRACTID_PREFIX "threaded"

#define NS_MSGTHREADSWITHUNREADDBVIEW_CONTRACTID \
  NS_MSGDBVIEW_CONTRACTID_PREFIX "threadswithunread"

#define NS_MSGWATCHEDTHREADSWITHUNREADDBVIEW_CONTRACTID \
  NS_MSGDBVIEW_CONTRACTID_PREFIX "watchedthreadswithunread"

#define NS_MSGSEARCHDBVIEW_CONTRACTID NS_MSGDBVIEW_CONTRACTID_PREFIX "search"

#define NS_MSGQUICKSEARCHDBVIEW_CONTRACTID \
  NS_MSGDBVIEW_CONTRACTID_PREFIX "quicksearch"

#define NS_MSGXFVFDBVIEW_CONTRACTID NS_MSGDBVIEW_CONTRACTID_PREFIX "xfvf"

#define NS_MSGGROUPDBVIEW_CONTRACTID NS_MSGDBVIEW_CONTRACTID_PREFIX "group"

#define NS_MSGTHREADEDDBVIEW_CID                     \
  {                                                  \
    0x52f860e0, 0x1dd2, 0x11b2, {                    \
      0xaa, 0x72, 0xbb, 0x75, 0x19, 0x81, 0xbd, 0x00 \
    }                                                \
  }

#define NS_MSGTHREADSWITHUNREADDBVIEW_CID            \
  {                                                  \
    0xca79a00e, 0x010d, 0x11d5, {                    \
      0xa5, 0xbe, 0x00, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                                \
  }

#define NS_MSGWATCHEDTHREADSWITHUNREADDBVIEW_CID     \
  {                                                  \
    0x597e1ffe, 0x0123, 0x11d5, {                    \
      0xa5, 0xbe, 0x00, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                                \
  }

#define NS_MSGSEARCHDBVIEW_CID                       \
  {                                                  \
    0xaeac118c, 0x0823, 0x11d5, {                    \
      0xa5, 0xbf, 0x00, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                                \
  }

#define NS_MSGQUICKSEARCHDBVIEW_CID                  \
  {                                                  \
    0x2dd9d0fe, 0xb609, 0x11d6, {                    \
      0xba, 0xcc, 0x00, 0x10, 0x83, 0x35, 0x74, 0x8d \
    }                                                \
  }

#define NS_MSG_XFVFDBVIEW_CID                        \
  {                                                  \
    0x2af6e050, 0x04f6, 0x495a, {                    \
      0x83, 0x87, 0x86, 0xb0, 0xae, 0xb1, 0x86, 0x3c \
    }                                                \
  }

#define NS_MSG_GROUPDBVIEW_CID                       \
  {                                                  \
    0xe4603d6c, 0x0a74, 0x47c5, {                    \
      0xb6, 0x9e, 0x2f, 0x88, 0x76, 0x99, 0x03, 0x04 \
    }                                                \
  }

//
// nsMsgAccountManager
//
#define NS_MSGOFFLINEMANAGER_CONTRACTID \
  "@mozilla.org/messenger/offline-manager;1"

#define NS_MSGOFFLINEMANAGER_CID                    \
  {                                                 \
    0xac6c518a, 0x09b2, 0x11d5, {                   \
      0xa5, 0xbf, 0x0, 0x60, 0xb0, 0xfc, 0x04, 0xb7 \
    }                                               \
  }

//
// nsMsgProgress
//
#define NS_MSGPROGRESS_CONTRACTID "@mozilla.org/messenger/progress;1"

#define NS_MSGPROGRESS_CID                           \
  {                                                  \
    0x9f4dd201, 0x3b1f, 0x11d5, {                    \
      0x9d, 0xaa, 0xc3, 0x45, 0xc9, 0x45, 0x3d, 0x3c \
    }                                                \
  }

//
// nsSpamSettings
//
#define NS_SPAMSETTINGS_CONTRACTID "@mozilla.org/messenger/spamsettings;1"

#define NS_SPAMSETTINGS_CID                          \
  {                                                  \
    0xce6038ae, 0xe5e0, 0x4372, {                    \
      0x9c, 0xff, 0x2a, 0x66, 0x33, 0x33, 0x3b, 0x2b \
    }                                                \
  }

//
// nsMsgTagService
//
#define NS_MSGTAGSERVICE_CONTRACTID "@mozilla.org/messenger/tagservice;1"

#define NS_MSGTAGSERVICE_CID                         \
  {                                                  \
    0xb897da55, 0x8256, 0x4cf5, {                    \
      0x89, 0x2b, 0x32, 0xe7, 0x7b, 0xc7, 0xc5, 0x0b \
    }                                                \
  }

//
// nsMsgFolderService
//
#define NS_MSGFOLDERSERVICE_CONTRACTID \
  "@mozilla.org/msgFolder/msgFolderService;1"
#define NS_MSGFOLDERSERVICE_CID                      \
  {                                                  \
    0x0c8ec907, 0x49c7, 0x49bc, {                    \
      0x8b, 0xdf, 0xb1, 0x6e, 0x29, 0xbd, 0x6c, 0x47 \
    }                                                \
  }

//
// nsMsgNotificationService
//
#define NS_MSGNOTIFICATIONSERVICE_CONTRACTID \
  "@mozilla.org/messenger/msgnotificationservice;1"

#define NS_MSGNOTIFICATIONSERVICE_CID                \
  {                                                  \
    0xf1f7cbcd, 0xd5e3, 0x45a0, {                    \
      0xaa, 0x2d, 0xce, 0xcf, 0x1a, 0x95, 0xab, 0x03 \
    }                                                \
  }

//
// nsMessengerOSIntegration
//
#define NS_MESSENGEROSINTEGRATION_CONTRACTID \
  "@mozilla.org/messenger/osintegration;1"

//
// cid protocol handler
//
#define NS_CIDPROTOCOLHANDLER_CONTRACTID \
  NS_NETWORK_PROTOCOL_CONTRACTID_PREFIX "cid"

#define NS_CIDPROTOCOL_CID                           \
  {                                                  \
    0xb3db9392, 0x1b15, 0x48ba, {                    \
      0xa1, 0x36, 0x0c, 0xc3, 0xdb, 0x13, 0xd8, 0x7b \
    }                                                \
  }

//
// Mail Directory Provider
//
#define NS_MAILDIRPROVIDER_CONTRACTID "@mozilla.org/mail/dir-provider;1"

#define MAILDIRPROVIDER_CID                          \
  {                                                  \
    0x3f9bb53, 0xa680, 0x4349, {                     \
      0x8d, 0xe9, 0xd2, 0x68, 0x64, 0xd9, 0xff, 0xd9 \
    }                                                \
  }

//
// nsMessengerContentHandler
//
#define NS_MESSENGERCONTENTHANDLER_CID               \
  {                                                  \
    0x57e1bcbb, 0x1fba, 0x47e7, {                    \
      0xb9, 0x6b, 0xf5, 0x9e, 0x39, 0x24, 0x73, 0xb0 \
    }                                                \
  }

#define NS_MESSENGERCONTENTHANDLER_CONTRACTID \
  NS_CONTENT_HANDLER_CONTRACTID_PREFIX "application/x-message-display"

//
// nsMsgShutdownService
//
#define NS_MSGSHUTDOWNSERVICE_CID                    \
  {                                                  \
    0x483c8abb, 0xecf9, 0x48a3, {                    \
      0xa3, 0x94, 0x2c, 0x60, 0x4b, 0x60, 0x3b, 0xd5 \
    }                                                \
  }

#define NS_MSGSHUTDOWNSERVICE_CONTRACTID \
  "@mozilla.org/messenger/msgshutdownservice;1"

//
// msgAsyncPrompter (only contract id for utility purposes as the CID is defined
// in js).
//
#define NS_MSGASYNCPROMPTER_CONTRACTID \
  "@mozilla.org/messenger/msgAsyncPrompter;1"

//
// MailNewsDLF
//
#define NS_MAILNEWSDLF_CID                           \
  {                                                  \
    0xde0f34a9, 0xa87f, 0x4f4c, {                    \
      0xb9, 0x78, 0x61, 0x87, 0xdb, 0x18, 0x7b, 0x90 \
    }                                                \
  }

#define NS_MAILNEWSDLF_CONTRACTID \
  "@mozilla.org/mailnews/document-loader-factory;1"

//
// NewMailNotificationService
//
#define MOZ_NEWMAILNOTIFICATIONSERVICE_CID           \
  {                                                  \
    0x740880E6, 0xE299, 0x4165, {                    \
      0xB8, 0x2F, 0xDF, 0x1D, 0xCA, 0xB3, 0xAE, 0x22 \
    }                                                \
  }

#define MOZ_NEWMAILNOTIFICATIONSERVICE_CONTRACTID \
  "@mozilla.org/newMailNotificationService;1"

#define NS_FOLDER_FACTORY_CONTRACTID "@mozilla.org/mail/folder-factory;1"
#define NS_FOLDER_FACTORY_CONTRACTID_PREFIX \
  NS_FOLDER_FACTORY_CONTRACTID "?name="

#define NS_BASECOMMANDCONTROLLER_CONTRACTID \
  "@mozilla.org/embedcomp/base-command-controller;1"
#define NS_BASECOMMANDCONTROLLER_CID                 \
  {                                                  \
    0xbf88b48c, 0xfd8e, 0x40b4, {                    \
      0xba, 0x36, 0xc7, 0xc3, 0xad, 0x6d, 0x8a, 0xc9 \
    }                                                \
  }

#define NS_TRANSACTIONMANAGER_CONTRACTID "@mozilla.org/transactionmanager;1"
#define NS_TRANSACTIONMANAGER_CID                   \
  {                                                 \
    0x9c8f9601, 0x801a, 0x11d2, {                   \
      0x98, 0xba, 0x0, 0x80, 0x5f, 0x29, 0x7d, 0x89 \
    }                                               \
  }

#define NS_SYNCSTREAMLISTENER_CONTRACTID \
  "@mozilla.org/network/sync-stream-listener;1"
#define NS_SYNCSTREAMLISTENER_CID                    \
  {                                                  \
    0x439400d3, 0x6f23, 0x43db, {                    \
      0x8b, 0x06, 0x8a, 0xaf, 0xe1, 0x86, 0x9b, 0xd8 \
    }                                                \
  }

#endif  // nsMessageBaseCID_h__
