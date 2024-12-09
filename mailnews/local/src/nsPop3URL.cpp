/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...

#include "nsPop3URL.h"
#include "nsIMailboxUrl.h"
#include "nsString.h"
#include "prmem.h"
#include "plstr.h"
#include "prprf.h"
#include "nsMsgUtils.h"
#include "nsIMsgAccountManager.h"
#include "nsLocalMailFolder.h"
#include "nsPop3Sink.h"

#define NS_POP3URL_CID \
  {0xea1b0a11, 0xe6f4, 0x11d2, {0x80, 0x70, 0x0, 0x60, 0x8, 0x12, 0x8c, 0x4e}}
static NS_DEFINE_CID(kPop3UrlCID, NS_POP3URL_CID);

nsPop3URL::nsPop3URL() : nsMsgMailNewsUrl() {}

nsPop3URL::~nsPop3URL() {}

NS_IMPL_ISUPPORTS_INHERITED(nsPop3URL, nsMsgMailNewsUrl, nsIPop3URL)

////////////////////////////////////////////////////////////////////////////////////
// Begin nsIPop3URL specific support
////////////////////////////////////////////////////////////////////////////////////

nsresult nsPop3URL::SetPop3Sink(nsIPop3Sink* aPop3Sink) {
  if (aPop3Sink) m_pop3Sink = aPop3Sink;
  return NS_OK;
}

nsresult nsPop3URL::GetPop3Sink(nsIPop3Sink** aPop3Sink) {
  if (aPop3Sink) {
    *aPop3Sink = m_pop3Sink;
    NS_IF_ADDREF(*aPop3Sink);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsPop3URL::GetMessageUri(nsACString& aMessageUri) {
  if (m_messageUri.IsEmpty()) return NS_ERROR_NULL_POINTER;
  aMessageUri = m_messageUri;
  return NS_OK;
}

NS_IMETHODIMP
nsPop3URL::SetMessageUri(const nsACString& aMessageUri) {
  m_messageUri = aMessageUri;
  return NS_OK;
}

nsresult nsPop3URL::BuildPop3Url(const char* urlSpec, nsIMsgFolder* inbox,
                                 nsIPop3IncomingServer* server,
                                 nsIUrlListener* aUrlListener, nsIURI** aUrl,
                                 nsIMsgWindow* aMsgWindow) {
  nsresult rv;

  nsPop3Sink* pop3Sink = new nsPop3Sink();

  pop3Sink->SetPopServer(server);
  pop3Sink->SetFolder(inbox);

  // now create a pop3 url and a protocol instance to run the url....
  nsCOMPtr<nsIPop3URL> pop3Url = do_CreateInstance(kPop3UrlCID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  pop3Url->SetPop3Sink(pop3Sink);

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl;
  rv = pop3Url->QueryInterface(NS_GET_IID(nsIMsgMailNewsUrl),
                               getter_AddRefs(mailnewsurl));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mailnewsurl->SetSpecInternal(nsDependentCString(urlSpec));
  NS_ENSURE_SUCCESS(rv, rv);

  if (aUrlListener) mailnewsurl->RegisterListener(aUrlListener);
  if (aMsgWindow) mailnewsurl->SetMsgWindow(aMsgWindow);

  mailnewsurl.forget(aUrl);

  return rv;
}

nsresult nsPop3URL::NewURI(const nsACString& aSpec, nsIURI* aBaseURI,
                           nsIURI** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  nsAutoCString folderUri(aSpec);
  int32_t offset = folderUri.FindChar('?');
  if (offset != kNotFound) folderUri.SetLength(offset);

  // Hold onto the string until it goes out of scope.
  const nsPromiseFlatCString& flat = PromiseFlatCString(aSpec);
  const char* uidl = PL_strstr(flat.get(), "uidl=");
  NS_ENSURE_TRUE(uidl, NS_ERROR_FAILURE);

  nsresult rv;

  nsCOMPtr<nsIMsgFolder> folder;
  rv = GetOrCreateFolder(folderUri, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> server;

  nsLocalFolderScanState folderScanState;
  nsCOMPtr<nsIMsgLocalMailFolder> localFolder = do_QueryInterface(folder);
  nsCOMPtr<nsIMailboxUrl> mailboxUrl = do_QueryInterface(aBaseURI);

  if (mailboxUrl && localFolder) {
    rv = localFolder->GetFolderScanState(&folderScanState);
    NS_ENSURE_SUCCESS(rv, rv);
    nsCOMPtr<nsIMsgDBHdr> msgHdr;
    nsMsgKey msgKey;
    mailboxUrl->GetMessageKey(&msgKey);
    folder->GetMessageHeader(msgKey, getter_AddRefs(msgHdr));
    // we do this to get the account key
    if (msgHdr) localFolder->GetUidlFromFolder(&folderScanState, msgHdr);
    if (!folderScanState.m_accountKey.IsEmpty()) {
      nsCOMPtr<nsIMsgAccountManager> accountManager =
          do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
      if (accountManager) {
        nsCOMPtr<nsIMsgAccount> account;
        accountManager->GetAccount(folderScanState.m_accountKey,
                                   getter_AddRefs(account));
        if (account) account->GetIncomingServer(getter_AddRefs(server));
      }
    }
  }

  if (!server) rv = folder->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPop3IncomingServer> popServer = do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString hostname;
  nsCString username;
  server->GetHostName(hostname);
  server->GetUsername(username);

  int32_t port;
  server->GetPort(&port);
  if (port == -1) port = nsIPop3URL::DEFAULT_POP3_PORT;

  // We need to escape the username before calling SetUsername() because it may
  // contain characters like / % or @. GetUsername() will unescape the username.
  nsCString escapedUsername;
  MsgEscapeString(username, nsINetUtil::ESCAPE_XALPHAS, escapedUsername);

  nsAutoCString popSpec("pop://");
  popSpec += escapedUsername;
  popSpec += "@";
  popSpec += hostname;
  popSpec += ":";
  popSpec.AppendInt(port);
  popSpec += "?";
  popSpec += uidl;
  nsCOMPtr<nsIUrlListener> urlListener = do_QueryInterface(folder, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIURI> newUri;
  rv = BuildPop3Url(popSpec.get(), folder, popServer, urlListener,
                    getter_AddRefs(newUri), nullptr);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl = do_QueryInterface(newUri, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mailnewsurl->SetUsernameInternal(escapedUsername);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPop3URL> popurl = do_QueryInterface(newUri, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString messageUri(aSpec);
  if (!strncmp(messageUri.get(), "mailbox:", 8))
    messageUri.Replace(0, 8, "mailbox-message:");
  offset = messageUri.Find("?number=");
  if (offset != kNotFound) messageUri.Replace(offset, 8, "#");
  offset = messageUri.FindChar('&');
  if (offset != kNotFound) messageUri.SetLength(offset);
  popurl->SetMessageUri(messageUri);
  nsCOMPtr<nsIPop3Sink> pop3Sink;
  rv = popurl->GetPop3Sink(getter_AddRefs(pop3Sink));
  NS_ENSURE_SUCCESS(rv, rv);

  pop3Sink->SetBuildMessageUri(true);

  newUri.forget(_retval);
  return NS_OK;
}
