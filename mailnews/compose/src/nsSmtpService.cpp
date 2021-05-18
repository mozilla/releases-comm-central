/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"  // precompiled header...
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIIOService.h"
#include "nsIPipe.h"
#include "nsNetCID.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "nsSmtpService.h"
#include "nsMsgBaseCID.h"
#include "nsMsgCompCID.h"
#include "nsSmtpUrl.h"
#include "nsSmtpProtocol.h"
#include "nsCOMPtr.h"
#include "nsIMsgIdentity.h"
#include "nsIPrompt.h"
#include "nsIWindowWatcher.h"
#include "nsComposeStrings.h"
#include "nsIAsyncInputStream.h"
#include "nsIPrincipal.h"
#include "mozilla/Telemetry.h"
#include "mozilla/LoadInfo.h"
#include "mozilla/NullPrincipal.h"

#define SERVER_DELIMITER ','
#define APPEND_SERVERS_VERSION_PREF_NAME "append_preconfig_smtpservers.version"
#define MAIL_ROOT_PREF "mail."
#define PREF_MAIL_SMTPSERVERS "mail.smtpservers"
#define PREF_MAIL_SMTPSERVERS_APPEND_SERVERS \
  "mail.smtpservers.appendsmtpservers"
#define PREF_MAIL_SMTP_DEFAULTSERVER "mail.smtp.defaultserver"

using namespace mozilla;

typedef struct _findServerByKeyEntry {
  const char* key;
  nsISmtpServer* server;
} findServerByKeyEntry;

typedef struct _findServerByHostnameEntry {
  nsCString hostname;
  nsCString username;
  nsISmtpServer* server;
} findServerByHostnameEntry;

static NS_DEFINE_CID(kCSmtpUrlCID, NS_SMTPURL_CID);

// forward declarations...
nsresult NS_MsgBuildSmtpUrl(nsIFile* aFilePath, nsISmtpServer* aServer,
                            const char* aRecipients,
                            nsIMsgIdentity* aSenderIdentity,
                            const char* aSender, nsIUrlListener* aUrlListener,
                            nsIMsgStatusFeedback* aStatusFeedback,
                            nsIInterfaceRequestor* aNotificationCallbacks,
                            nsIURI** aUrl, bool aRequestDSN);

nsresult NS_MsgLoadSmtpUrl(nsIURI* aUrl, nsISupports* aConsumer,
                           nsIRequest** aRequest);

nsSmtpService::nsSmtpService() : mSmtpServersLoaded(false) {}

nsSmtpService::~nsSmtpService() {
  // save the SMTP servers to disk
}

NS_IMPL_ISUPPORTS(nsSmtpService, nsISmtpService, nsIProtocolHandler)

NS_IMETHODIMP nsSmtpService::SendMailMessage(
    nsIFile* aFilePath, const char* aRecipients,
    nsIMsgIdentity* aSenderIdentity, const char* aSender,
    const nsAString& aPassword, nsIUrlListener* aUrlListener,
    nsIMsgStatusFeedback* aStatusFeedback,
    nsIInterfaceRequestor* aNotificationCallbacks, bool aRequestDSN,
    const nsACString& aMessageId, nsIURI** aURL, nsIRequest** aRequest) {
  nsIURI* urlToRun = nullptr;
  nsresult rv = NS_OK;

  nsCOMPtr<nsISmtpServer> smtpServer;
  rv = GetServerByIdentity(aSenderIdentity, getter_AddRefs(smtpServer));

  if (NS_SUCCEEDED(rv) && smtpServer) {
    if (!aPassword.IsEmpty()) smtpServer->SetPassword(aPassword);

    // this ref counts urlToRun
    rv = NS_MsgBuildSmtpUrl(aFilePath, smtpServer, aRecipients, aSenderIdentity,
                            aSender, aUrlListener, aStatusFeedback,
                            aNotificationCallbacks, &urlToRun, aRequestDSN);
    if (NS_SUCCEEDED(rv) && urlToRun)
      rv = NS_MsgLoadSmtpUrl(urlToRun, nullptr, aRequest);

    if (aURL)            // does the caller want a handle on the url?
      *aURL = urlToRun;  // transfer our ref count to the caller....
    else
      NS_IF_RELEASE(urlToRun);

#ifndef MOZ_SUITE
    Telemetry::ScalarAdd(Telemetry::ScalarID::TB_MAILS_SENT, 1);
#endif
  }

  return rv;
}

// The following are two convenience functions I'm using to help expedite
// building and running a mail to url...

// short cut function for creating a mailto url...
nsresult NS_MsgBuildSmtpUrl(nsIFile* aFilePath, nsISmtpServer* aSmtpServer,
                            const char* aRecipients,
                            nsIMsgIdentity* aSenderIdentity,
                            const char* aSender, nsIUrlListener* aUrlListener,
                            nsIMsgStatusFeedback* aStatusFeedback,
                            nsIInterfaceRequestor* aNotificationCallbacks,
                            nsIURI** aUrl, bool aRequestDSN) {
  // mscott: this function is a convenience hack until netlib actually
  // dispatches smtp urls. in addition until we have a session to get a
  // password, host and other stuff from, we need to use default values....
  // ..for testing purposes....

  nsCString smtpHostName;
  nsCString smtpUserName;
  int32_t smtpPort;
  int32_t socketType;

  aSmtpServer->GetHostname(smtpHostName);
  aSmtpServer->GetUsername(smtpUserName);
  aSmtpServer->GetPort(&smtpPort);
  aSmtpServer->GetSocketType(&socketType);

  if (!smtpPort)
    smtpPort = (socketType == nsMsgSocketType::SSL)
                   ? nsISmtpUrl::DEFAULT_SMTPS_PORT
                   : nsISmtpUrl::DEFAULT_SMTP_PORT;

  nsresult rv;
  nsCOMPtr<nsISmtpUrl> smtpUrl(do_CreateInstance(kCSmtpUrlCID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString urlSpec("smtp://");

  if (!smtpUserName.IsEmpty()) {
    nsCString escapedUsername;
    MsgEscapeString(smtpUserName, nsINetUtil::ESCAPE_XALPHAS, escapedUsername);
    urlSpec.Append(escapedUsername);
    urlSpec.Append('@');
  }

  urlSpec.Append(smtpHostName);
  if (smtpHostName.FindChar(':') == -1) {
    urlSpec.Append(':');
    urlSpec.AppendInt(smtpPort);
  }

  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsurl(do_QueryInterface(smtpUrl, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = mailnewsurl->SetSpecInternal(urlSpec);
  NS_ENSURE_SUCCESS(rv, rv);

  smtpUrl->SetSender(aSender);
  smtpUrl->SetRecipients(aRecipients);
  smtpUrl->SetRequestDSN(aRequestDSN);
  smtpUrl->SetPostMessageFile(aFilePath);
  smtpUrl->SetSenderIdentity(aSenderIdentity);
  if (aNotificationCallbacks)
    smtpUrl->SetNotificationCallbacks(aNotificationCallbacks);
  smtpUrl->SetSmtpServer(aSmtpServer);

  nsCOMPtr<nsIPrompt> smtpPrompt(do_GetInterface(aNotificationCallbacks));
  nsCOMPtr<nsIAuthPrompt> smtpAuthPrompt(
      do_GetInterface(aNotificationCallbacks));
  if (!smtpPrompt || !smtpAuthPrompt) {
    nsCOMPtr<nsIWindowWatcher> wwatch(
        do_GetService(NS_WINDOWWATCHER_CONTRACTID, &rv));
    NS_ENSURE_SUCCESS(rv, rv);

    if (!smtpPrompt) wwatch->GetNewPrompter(0, getter_AddRefs(smtpPrompt));
    if (!smtpAuthPrompt)
      wwatch->GetNewAuthPrompter(0, getter_AddRefs(smtpAuthPrompt));
  }

  smtpUrl->SetPrompt(smtpPrompt);
  smtpUrl->SetAuthPrompt(smtpAuthPrompt);

  if (aUrlListener) mailnewsurl->RegisterListener(aUrlListener);
  if (aStatusFeedback) mailnewsurl->SetStatusFeedback(aStatusFeedback);

  return CallQueryInterface(smtpUrl, aUrl);
}

nsresult NS_MsgLoadSmtpUrl(nsIURI* aUrl, nsISupports* aConsumer,
                           nsIRequest** aRequest) {
  NS_ENSURE_ARG_POINTER(aUrl);

  // For now, assume the url is an smtp url and load it.
  nsresult rv;
  nsCOMPtr<nsISmtpUrl> smtpUrl(do_QueryInterface(aUrl, &rv));
  mozilla::Unused << smtpUrl;
  NS_ENSURE_SUCCESS(rv, rv);

  // Create a smtp protocol instance to run the url in.
  RefPtr<nsSmtpProtocol> smtpProtocol = new nsSmtpProtocol(aUrl);
  // It implements nsIChannel, and all channels require loadInfo.
  smtpProtocol->SetLoadInfo(new mozilla::net::LoadInfo(
      nsContentUtils::GetSystemPrincipal(), nullptr, nullptr,
      nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      nsIContentPolicy::TYPE_OTHER));

  // Protocol will get destroyed when url is completed.
  rv = smtpProtocol->LoadUrl(aUrl, aConsumer);
  NS_ENSURE_SUCCESS(rv, rv);

  smtpProtocol.forget(aRequest);
  return NS_OK;
}

NS_IMETHODIMP nsSmtpService::VerifyLogon(nsISmtpServer* aServer,
                                         nsIUrlListener* aUrlListener,
                                         nsIMsgWindow* aMsgWindow,
                                         nsIURI** aURL) {
  NS_ENSURE_ARG_POINTER(aServer);
  nsCString popHost;
  nsCString popUser;
  nsCOMPtr<nsIURI> urlToRun;

  nsresult rv = NS_MsgBuildSmtpUrl(nullptr, aServer, nullptr, nullptr, nullptr,
                                   aUrlListener, nullptr, nullptr,
                                   getter_AddRefs(urlToRun), false);
  if (NS_SUCCEEDED(rv) && urlToRun) {
    nsCOMPtr<nsIMsgMailNewsUrl> url(do_QueryInterface(urlToRun, &rv));
    NS_ENSURE_SUCCESS(rv, rv);
    url->SetMsgWindow(aMsgWindow);
    rv = NS_MsgLoadSmtpUrl(urlToRun, nullptr, nullptr /* aRequest */);
    if (aURL) urlToRun.forget(aURL);
  }
  return rv;
}

NS_IMETHODIMP nsSmtpService::GetScheme(nsACString& aScheme) {
  aScheme = "mailto";
  return NS_OK;
}

NS_IMETHODIMP nsSmtpService::GetDefaultPort(int32_t* aDefaultPort) {
  nsresult rv = NS_OK;
  if (aDefaultPort)
    *aDefaultPort = nsISmtpUrl::DEFAULT_SMTP_PORT;
  else
    rv = NS_ERROR_NULL_POINTER;
  return rv;
}

NS_IMETHODIMP
nsSmtpService::AllowPort(int32_t port, const char* scheme, bool* _retval) {
  // allow smtp to run on any port
  *_retval = true;
  return NS_OK;
}

NS_IMETHODIMP nsSmtpService::GetProtocolFlags(uint32_t* result) {
  *result = URI_NORELATIVE | ALLOWS_PROXY | URI_LOADABLE_BY_ANYONE |
            URI_NON_PERSISTABLE | URI_DOES_NOT_RETURN_DATA |
            URI_FORBIDS_COOKIE_ACCESS;
  return NS_OK;
}

// the smtp service is also the protocol handler for mailto urls....

nsresult nsSmtpService::NewMailtoURI(
    const nsACString& aSpec,
    const char* aOriginCharset,  // ignored, always UTF-8.
    nsIURI* aBaseURI, nsIURI** _retval) {
  nsresult rv;

  nsCOMPtr<nsIURI> mailtoUrl;
  rv = NS_MutateURI(new nsMailtoUrl::Mutator())
           .SetSpec(aSpec)
           .Finalize(mailtoUrl);
  NS_ENSURE_SUCCESS(rv, rv);

  mailtoUrl.forget(_retval);
  return NS_OK;
}

nsresult nsSmtpService::NewSmtpURI(const nsACString& aSpec,
                                   const char* aOriginCharset, nsIURI* aBaseURI,
                                   nsIURI** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = 0;
  nsresult rv;
  nsCOMPtr<nsIMsgMailNewsUrl> aSmtpUri =
      do_CreateInstance(NS_SMTPURL_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  if (aBaseURI) {
    nsAutoCString newSpec;
    rv = aBaseURI->Resolve(aSpec, newSpec);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = aSmtpUri->SetSpecInternal(newSpec);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    rv = aSmtpUri->SetSpecInternal(aSpec);
    NS_ENSURE_SUCCESS(rv, rv);
  }
  aSmtpUri.forget(_retval);

  return rv;
}

NS_IMETHODIMP nsSmtpService::NewChannel(nsIURI* aURI, nsILoadInfo* aLoadInfo,
                                        nsIChannel** _retval) {
  NS_ENSURE_ARG_POINTER(aURI);
  MOZ_ASSERT(aLoadInfo);
  // create an empty pipe for use with the input stream channel.
  nsCOMPtr<nsIAsyncInputStream> pipeIn;
  nsCOMPtr<nsIAsyncOutputStream> pipeOut;
  nsCOMPtr<nsIPipe> pipe = do_CreateInstance("@mozilla.org/pipe;1");
  nsresult rv = pipe->Init(false, false, 0, 0);
  NS_ENSURE_SUCCESS(rv, rv);

  // These always succeed because the pipe is initialized above.
  MOZ_ALWAYS_SUCCEEDS(pipe->GetInputStream(getter_AddRefs(pipeIn)));
  MOZ_ALWAYS_SUCCEEDS(pipe->GetOutputStream(getter_AddRefs(pipeOut)));

  pipeOut->Close();

  if (aLoadInfo) {
    return NS_NewInputStreamChannelInternal(_retval, aURI, pipeIn.forget(),
                                            "application/x-mailto"_ns,
                                            EmptyCString(), aLoadInfo);
  }

  nsCOMPtr<nsIPrincipal> nullPrincipal =
      NullPrincipal::CreateWithoutOriginAttributes();
  return NS_NewInputStreamChannel(
      _retval, aURI, pipeIn.forget(), nullPrincipal,
      nsILoadInfo::SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      nsIContentPolicy::TYPE_OTHER, "application/x-mailto"_ns);
}

NS_IMETHODIMP
nsSmtpService::GetServers(nsTArray<RefPtr<nsISmtpServer>>& servers) {
  if (mSmtpServers.IsEmpty()) {
    // Read in the servers from prefs if necessary.
    loadSmtpServers();
  }
  servers = mSmtpServers.Clone();
  return NS_OK;
}

nsresult nsSmtpService::loadSmtpServers() {
  if (mSmtpServersLoaded) return NS_OK;

  nsresult rv;
  nsCOMPtr<nsIPrefService> prefService(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return rv;
  nsCOMPtr<nsIPrefBranch> prefRootBranch;
  prefService->GetBranch(nullptr, getter_AddRefs(prefRootBranch));
  if (NS_FAILED(rv)) return rv;

  nsCString serverList;
  rv = prefRootBranch->GetCharPref(PREF_MAIL_SMTPSERVERS, serverList);
  serverList.StripWhitespace();

  nsTArray<nsCString> servers;
  ParseString(serverList, SERVER_DELIMITER, servers);

  /**
   * Check to see if we need to add pre-configured smtp servers.
   * Following prefs are important to note in understanding the procedure here.
   *
   * 1. pref("mailnews.append_preconfig_smtpservers.version", version number);
   * This pref registers the current version in the user prefs file. A default
   * value is stored in mailnews.js file. If a given vendor needs to add more
   * preconfigured smtp servers, the default version number can be increased.
   * Comparing version number from user's prefs file and the default one from
   * mailnews.js, we can add new smtp servers and any other version level
   * changes that need to be done.
   *
   * 2. pref("mail.smtpservers.appendsmtpservers",
   *         <comma separated servers list>);
   * This pref contains the list of pre-configured smp servers that
   * ISP/Vendor wants to to add to the existing servers list.
   */
  nsCOMPtr<nsIPrefBranch> defaultsPrefBranch;
  rv = prefService->GetDefaultBranch(MAIL_ROOT_PREF,
                                     getter_AddRefs(defaultsPrefBranch));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPrefBranch> prefBranch;
  rv = prefService->GetBranch(MAIL_ROOT_PREF, getter_AddRefs(prefBranch));
  NS_ENSURE_SUCCESS(rv, rv);

  int32_t appendSmtpServersCurrentVersion = 0;
  int32_t appendSmtpServersDefaultVersion = 0;
  rv = prefBranch->GetIntPref(APPEND_SERVERS_VERSION_PREF_NAME,
                              &appendSmtpServersCurrentVersion);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = defaultsPrefBranch->GetIntPref(APPEND_SERVERS_VERSION_PREF_NAME,
                                      &appendSmtpServersDefaultVersion);
  NS_ENSURE_SUCCESS(rv, rv);

  // Update the smtp server list if needed
  if (appendSmtpServersCurrentVersion <= appendSmtpServersDefaultVersion) {
    // If there are pre-configured servers, add them to the existing server list
    nsCString appendServerList;
    rv = prefRootBranch->GetCharPref(PREF_MAIL_SMTPSERVERS_APPEND_SERVERS,
                                     appendServerList);
    appendServerList.StripWhitespace();
    ParseString(appendServerList, SERVER_DELIMITER, servers);

    // Increase the version number so that updates will happen as and when
    // needed
    prefBranch->SetIntPref(APPEND_SERVERS_VERSION_PREF_NAME,
                           appendSmtpServersCurrentVersion + 1);
  }

  // use GetServerByKey to check if the key (pref) is already in
  // in the list. If not it calls createKeyedServer directly.

  for (uint32_t i = 0; i < servers.Length(); i++) {
    nsCOMPtr<nsISmtpServer> server;
    GetServerByKey(servers[i].get(), getter_AddRefs(server));
  }

  saveKeyList();

  mSmtpServersLoaded = true;
  return NS_OK;
}

// save the list of keys
nsresult nsSmtpService::saveKeyList() {
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return rv;

  return prefBranch->SetCharPref(PREF_MAIL_SMTPSERVERS, mServerKeyList);
}

nsresult nsSmtpService::createKeyedServer(const char* key,
                                          nsISmtpServer** aResult) {
  if (!key) return NS_ERROR_NULL_POINTER;

  nsresult rv;
  nsCOMPtr<nsISmtpServer> server =
      do_CreateInstance(NS_SMTPSERVER_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return rv;

  server->SetKey(key);
  mSmtpServers.AppendElement(server);

  if (mServerKeyList.IsEmpty())
    mServerKeyList = key;
  else {
    mServerKeyList.Append(',');
    mServerKeyList += key;
  }

  if (aResult) server.forget(aResult);

  return NS_OK;
}

NS_IMETHODIMP
nsSmtpService::GetSessionDefaultServer(nsISmtpServer** aServer) {
  NS_ENSURE_ARG_POINTER(aServer);

  if (!mSessionDefaultServer) return GetDefaultServer(aServer);

  NS_ADDREF(*aServer = mSessionDefaultServer);
  return NS_OK;
}

NS_IMETHODIMP
nsSmtpService::SetSessionDefaultServer(nsISmtpServer* aServer) {
  mSessionDefaultServer = aServer;
  return NS_OK;
}

NS_IMETHODIMP
nsSmtpService::GetDefaultServer(nsISmtpServer** aServer) {
  NS_ENSURE_ARG_POINTER(aServer);

  loadSmtpServers();

  *aServer = nullptr;
  // always returns NS_OK, just leaving *aServer at nullptr
  if (!mDefaultSmtpServer) {
    nsresult rv;
    nsCOMPtr<nsIPrefBranch> prefBranch(
        do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
    if (NS_FAILED(rv)) return rv;

    // try to get it from the prefs
    nsCString defaultServerKey;
    rv =
        prefBranch->GetCharPref(PREF_MAIL_SMTP_DEFAULTSERVER, defaultServerKey);
    if (NS_SUCCEEDED(rv) && !defaultServerKey.IsEmpty()) {
      nsCOMPtr<nsISmtpServer> server;
      rv = GetServerByKey(defaultServerKey.get(),
                          getter_AddRefs(mDefaultSmtpServer));
    } else {
      // no pref set, so just return the first one, and set the pref

      // Ensure the list of servers is loaded
      loadSmtpServers();

      // nothing in the array, we had better create a new server
      // (which will add it to the array & prefs anyway)
      if (mSmtpServers.IsEmpty()) {
        // if there are no smtp servers then don't create one for the default.
        return NS_OK;
      }

      mDefaultSmtpServer = mSmtpServers[0];
      NS_ENSURE_TRUE(mDefaultSmtpServer, NS_ERROR_NULL_POINTER);

      // now we have a default server, set the prefs correctly
      nsCString serverKey;
      mDefaultSmtpServer->GetKey(getter_Copies(serverKey));
      if (NS_SUCCEEDED(rv))
        prefBranch->SetCharPref(PREF_MAIL_SMTP_DEFAULTSERVER, serverKey);
    }
  }

  // at this point:
  // * mDefaultSmtpServer has a valid server
  // * the key has been set in the prefs

  NS_IF_ADDREF(*aServer = mDefaultSmtpServer);

  return NS_OK;
}

NS_IMETHODIMP
nsSmtpService::SetDefaultServer(nsISmtpServer* aServer) {
  NS_ENSURE_ARG_POINTER(aServer);

  mDefaultSmtpServer = aServer;

  nsCString serverKey;
  nsresult rv = aServer->GetKey(getter_Copies(serverKey));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  prefBranch->SetCharPref(PREF_MAIL_SMTP_DEFAULTSERVER, serverKey);
  return NS_OK;
}

bool nsSmtpService::findServerByKey(nsISmtpServer* aServer, void* aData) {
  findServerByKeyEntry* entry = (findServerByKeyEntry*)aData;

  nsCString key;
  nsresult rv = aServer->GetKey(getter_Copies(key));
  if (NS_FAILED(rv)) return true;

  if (key.Equals(entry->key)) {
    entry->server = aServer;
    return false;
  }

  return true;
}

NS_IMETHODIMP
nsSmtpService::CreateServer(nsISmtpServer** aResult) {
  if (!aResult) return NS_ERROR_NULL_POINTER;

  loadSmtpServers();
  nsresult rv;
  int32_t i = 0;
  bool unique = false;

  findServerByKeyEntry entry;
  nsAutoCString key;

  do {
    key = "smtp";
    key.AppendInt(++i);
    entry.key = key.get();
    entry.server = nullptr;

    for (nsISmtpServer* s : mSmtpServers) findServerByKey(s, (void*)&entry);
    if (!entry.server) unique = true;

  } while (!unique);

  rv = createKeyedServer(key.get(), aResult);
  NS_ENSURE_SUCCESS(rv, rv);
  return saveKeyList();
}

nsresult nsSmtpService::GetServerByKey(const char* aKey,
                                       nsISmtpServer** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  if (!aKey || !*aKey) {
    NS_ASSERTION(false, "bad key");
    return NS_ERROR_FAILURE;
  }
  findServerByKeyEntry entry;
  entry.key = aKey;
  entry.server = nullptr;
  for (nsISmtpServer* s : mSmtpServers) findServerByKey(s, (void*)&entry);

  if (entry.server) {
    NS_ADDREF(*aResult = entry.server);
    return NS_OK;
  }

  // not found in array, I guess we load it
  return createKeyedServer(aKey, aResult);
}

NS_IMETHODIMP
nsSmtpService::DeleteServer(nsISmtpServer* aServer) {
  if (!aServer) return NS_OK;

  int32_t idx = mSmtpServers.IndexOf(aServer);
  if (idx == -1) return NS_OK;

  nsCString serverKey;
  aServer->GetKey(getter_Copies(serverKey));

  mSmtpServers.RemoveElementAt(idx);

  if (mDefaultSmtpServer.get() == aServer) mDefaultSmtpServer = nullptr;
  if (mSessionDefaultServer.get() == aServer) mSessionDefaultServer = nullptr;

  nsAutoCString newServerList;
  nsCString tmpStr = mServerKeyList;
  char* newStr = tmpStr.BeginWriting();
  char* token = NS_strtok(",", &newStr);
  while (token) {
    // only re-add the string if it's not the key
    if (strcmp(token, serverKey.get()) != 0) {
      if (newServerList.IsEmpty())
        newServerList = token;
      else {
        newServerList += ',';
        newServerList += token;
      }
    }
    token = NS_strtok(",", &newStr);
  }

  // make sure the server clears out it's values....
  aServer->ClearAllValues();

  mServerKeyList = newServerList;
  saveKeyList();
  return NS_OK;
}

bool nsSmtpService::findServerByHostname(nsISmtpServer* aServer, void* aData) {
  findServerByHostnameEntry* entry = (findServerByHostnameEntry*)aData;

  nsCString hostname;
  nsresult rv = aServer->GetHostname(hostname);
  if (NS_FAILED(rv)) return true;

  nsCString username;
  rv = aServer->GetUsername(username);
  if (NS_FAILED(rv)) return true;

  bool checkHostname = !entry->hostname.IsEmpty();
  bool checkUsername = !entry->username.IsEmpty();

  if ((!checkHostname || (entry->hostname.Equals(
                             hostname, nsCaseInsensitiveCStringComparator))) &&
      (!checkUsername ||
       entry->username.Equals(username, nsCaseInsensitiveCStringComparator))) {
    entry->server = aServer;
    return false;  // stop when found
  }
  return true;
}

NS_IMETHODIMP
nsSmtpService::FindServer(const char* aUsername, const char* aHostname,
                          nsISmtpServer** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  findServerByHostnameEntry entry;
  entry.server = nullptr;
  entry.hostname = aHostname;
  entry.username = aUsername;

  for (nsISmtpServer* s : mSmtpServers) findServerByHostname(s, (void*)&entry);

  // entry.server may be null, but that's ok.
  // just return null if no server is found
  NS_IF_ADDREF(*aResult = entry.server);

  return NS_OK;
}

NS_IMETHODIMP
nsSmtpService::GetServerByIdentity(nsIMsgIdentity* aSenderIdentity,
                                   nsISmtpServer** aSmtpServer) {
  NS_ENSURE_ARG_POINTER(aSmtpServer);
  nsresult rv = NS_ERROR_FAILURE;

  // First try the identity's preferred server
  if (aSenderIdentity) {
    nsCString smtpServerKey;
    rv = aSenderIdentity->GetSmtpServerKey(smtpServerKey);
    if (NS_SUCCEEDED(rv) && !(smtpServerKey.IsEmpty()))
      rv = GetServerByKey(smtpServerKey.get(), aSmtpServer);
  }

  // Fallback to the default
  if (NS_FAILED(rv) || !(*aSmtpServer)) rv = GetDefaultServer(aSmtpServer);
  return rv;
}
