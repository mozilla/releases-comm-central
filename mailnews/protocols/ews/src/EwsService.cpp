/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsService.h"

#include "EwsOfflineMessageChannel.h"
#include "IEwsIncomingServer.h"
#include "IEwsClient.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgHdr.h"
#include "nsIMsgFolder.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgPluggableStore.h"
#include "nsIOutputStream.h"
#include "nsIStreamListener.h"
#include "nsIURIMutator.h"
#include "nsIWebNavigation.h"
#include "nsContentUtils.h"
#include "nsDocShellLoadState.h"
#include "nsMsgMessageFlags.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"

#define ID_PROPERTY "ewsId"

// Displays the given URI via the given docshell.
nsresult DisplayMessage(nsIURI* messageURI, nsIDocShell* docShell);

/**
 * A listener for a message download, which writes the message's content into
 * the relevant message store.
 *
 * Once the message has been downloaded and written into the store, this
 * listener will also use the provided docshell or stream listener, if any, to
 * display or stream the message's content from the store (using
 * `EwsOfflineMessageChannel`). If both a docshell and a stream listener are
 * provided, only the docshell is used.
 */
class MessageFetchListener : public IEWSMessageFetchCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSMESSAGEFETCHCALLBACKS

  MessageFetchListener(nsIURI* messageURI, nsIMsgDBHdr* hdr,
                       nsIDocShell* docShell, nsIStreamListener* streamListener)
      : mMessageURI(messageURI),
        mHdr(hdr),
        mDisplayDocShell(docShell),
        mStreamListener(streamListener) {};

 protected:
  virtual ~MessageFetchListener();

 private:
  // The `ews-message` URI referring to the message to fetch.
  nsCOMPtr<nsIURI> mMessageURI;

  // The header for the message to fetch.
  nsCOMPtr<nsIMsgDBHdr> mHdr;

  // The message database for the message header, for committing the offline
  // flag and message size once the message content has been downloaded.
  nsCOMPtr<nsIMsgDatabase> mDB;

  // The offline store in which to write the message content.
  nsCOMPtr<nsIMsgPluggableStore> mStore;

  // The output stream in which to write the message content as it is being
  // downloaded.
  nsCOMPtr<nsIOutputStream> mStoreOutStream;

  // The size of the message in the offline store, updated as the content is
  // being downloaded. Once the download finishes, this size is written to the
  // message header and committed to the message database.
  uint64_t mOfflineSize = 0;

  // If provided, the message URI is loaded using this docshell (via
  // `DisplayMessage`) once the full message content has been written to the
  // message store. This triggers the docshell to stream the message content
  // (and convert it to HTML on the fly) via `EwsOfflineMessageChannel`.
  nsCOMPtr<nsIDocShell> mDisplayDocShell;

  // If provided (and no docshell was provided), the message content is streamed
  // through this stream listener (via `EwsOfflineMessageChannel`) once the it
  // has been fully written to the message store.
  nsCOMPtr<nsIStreamListener> mStreamListener;
};

NS_IMPL_ISUPPORTS(MessageFetchListener, IEWSMessageFetchCallbacks)

MessageFetchListener::~MessageFetchListener() = default;

NS_IMETHODIMP MessageFetchListener::OnFetchStart() {
  // Instantiate the attributes we'll need to write the message and pass it on
  // to the right consumer.
  nsCOMPtr<nsIMsgFolder> folder;
  nsresult rv = mHdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = folder->GetMsgDatabase(getter_AddRefs(mDB));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = folder->GetMsgStore(getter_AddRefs(mStore));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = folder->GetOfflineStoreOutputStream(mHdr,
                                           getter_AddRefs(mStoreOutStream));
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

NS_IMETHODIMP MessageFetchListener::OnDataAvailable(
    nsIInputStream* aInputStream, uint32_t aCount) {
  NS_ENSURE_ARG_POINTER(mStoreOutStream);

  // Copy the message from the provided stream to the output stream provided by
  // the store.
  uint64_t bytesCopied;
  nsresult rv = SyncCopyStream(aInputStream, mStoreOutStream, bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  mOfflineSize += bytesCopied;

  return NS_OK;
}

NS_IMETHODIMP MessageFetchListener::OnFetchStop(nsresult status) {
  NS_ENSURE_ARG_POINTER(mStore);
  NS_ENSURE_ARG_POINTER(mStoreOutStream);
  NS_ENSURE_ARG_POINTER(mDB);

  nsresult rv;
  if (NS_SUCCEEDED(status)) {
    rv = mStore->FinishNewMessage(mStoreOutStream, mHdr);
    NS_ENSURE_SUCCESS(rv, rv);

    // Mark the message as downloaded in the database record and record its
    // size.
    uint32_t unused;
    rv = mHdr->OrFlags(nsMsgMessageFlags::Offline, &unused);
    NS_ENSURE_SUCCESS(rv, rv);

    // In the future, we should use the size provided by the server, see
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1930127. In the meantime, we
    // update it here since some areas of the code seem to use `messageSize` as
    // the offline message size (see
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1930003).
    rv = mHdr->SetMessageSize(mOfflineSize);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = mHdr->SetOfflineMessageSize(mOfflineSize);
    NS_ENSURE_SUCCESS(rv, rv);

    // Commit the changes to the folder's database.
    rv = mDB->Commit(nsMsgDBCommitType::kLargeCommit);
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    // Fetch has failed, discard the new message in the store.
    rv = mStore->DiscardNewMessage(mStoreOutStream, mHdr);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (mDisplayDocShell) {
    // If a docshell was provided, use it to display the message.
    return DisplayMessage(mMessageURI, mDisplayDocShell);
  }

  if (mStreamListener) {
    // If a stream listener was provided, use it to stream the message from the
    // offline store.
    nsCOMPtr<nsIChannel> channel = new EwsOfflineMessageChannel(mMessageURI);
    return channel->AsyncOpen(mStreamListener);
  }

  return NS_OK;
}

NS_IMPL_ISUPPORTS(EwsService, nsIMsgMessageService)

EwsService::EwsService() = default;

EwsService::~EwsService() = default;

NS_IMETHODIMP EwsService::CopyMessage(const nsACString& aSrcURI,
                                      nsIStreamListener* aCopyListener,
                                      bool aMoveMessage,
                                      nsIUrlListener* aUrlListener,
                                      nsIMsgWindow* aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aCopyListener);
  return GetMessageContent(aSrcURI, nullptr, aCopyListener);
}

NS_IMETHODIMP EwsService::CopyMessages(
    const nsTArray<nsMsgKey>& aKeys, nsIMsgFolder* srcFolder,
    nsIStreamListener* aCopyListener, bool aMoveMessage,
    nsIUrlListener* aUrlListener, nsIMsgWindow* aMsgWindow, nsIURI** _retval) {
  NS_WARNING("CopyMessages");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::LoadMessage(const nsACString& aMessageURI,
                                      nsIDocShell* aDisplayConsumer,
                                      nsIMsgWindow* aMsgWindow,
                                      nsIUrlListener* aUrlListener,
                                      bool aAutodetectCharset) {
  NS_ENSURE_ARG_POINTER(aDisplayConsumer);
  return GetMessageContent(aMessageURI, aDisplayConsumer, nullptr);
}

NS_IMETHODIMP EwsService::SaveMessageToDisk(const nsACString& aMessageURI,
                                            nsIFile* aFile,
                                            bool aGenerateDummyEnvelope,
                                            nsIUrlListener* aUrlListener,
                                            bool canonicalLineEnding,
                                            nsIMsgWindow* aMsgWindow) {
  NS_WARNING("SaveMessageToDisk");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::GetUrlForUri(const nsACString& aMessageURI,
                                       nsIMsgWindow* aMsgWindow,
                                       nsIURI** _retval) {
  return NS_NewURI(_retval, aMessageURI);
}

NS_IMETHODIMP EwsService::Search(nsIMsgSearchSession* aSearchSession,
                                 nsIMsgWindow* aMsgWindow,
                                 nsIMsgFolder* aMsgFolder,
                                 const nsACString& aSearchUri) {
  NS_WARNING("Search");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::StreamMessage(
    const nsACString& aMessageURI, nsIStreamListener* aStreamListener,
    nsIMsgWindow* aMsgWindow, nsIUrlListener* aUrlListener, bool aConvertData,
    const nsACString& aAdditionalHeader, bool aLocalOnly, nsIURI** _retval) {
  // TODO: Convert the message content when `aConvertData = true`. It's usually
  // not the case, except when we're deleting an attachment.
  return GetMessageContent(aMessageURI, nullptr, aStreamListener);
}

NS_IMETHODIMP EwsService::StreamHeaders(const nsACString& aMessageURI,
                                        nsIStreamListener* aConsumer,
                                        nsIUrlListener* aUrlListener,
                                        bool aLocalOnly, nsIURI** _retval) {
  NS_WARNING("StreamHeaders");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::IsMsgInMemCache(nsIURI* aUrl, nsIMsgFolder* aFolder,
                                          bool* _retval) {
  NS_WARNING("IsMsgInMemCache");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP EwsService::MessageURIToMsgHdr(const nsACString& uri,
                                             nsIMsgDBHdr** _retval) {
  RefPtr<nsIURI> uriObj;
  nsresult rv = NS_NewURI(getter_AddRefs(uriObj), uri);
  NS_ENSURE_SUCCESS(rv, rv);

  return MsgHdrFromUri(uriObj, _retval);
}

//
nsresult EwsService::MsgKeyStringFromMessageURI(nsIURI* uri,
                                                nsACString& msgKey) {
  // We expect the provided URI to be of the following form:
  // `ews-message://{username}@{host}/{folder_path}#{msg_key}`.
  // Note that `ews-message` is not a registered scheme and URIs which use it
  // cannot be loaded through the standard URI loading mechanisms.
  nsresult rv = uri->GetRef(msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  if (msgKey.IsEmpty()) {
    NS_ERROR("message URI has no message key ref");
    return NS_ERROR_UNEXPECTED;
  }

  return NS_OK;
}

nsresult EwsService::MsgKeyStringFromChannelURI(nsIURI* uri, nsACString& msgKey,
                                                nsACString& folderURIPath) {
  nsresult rv = uri->GetFilePath(folderURIPath);
  NS_ENSURE_SUCCESS(rv, rv);

  // Iterate over each slash-separated word.
  for (const auto& word : folderURIPath.Split('/')) {
    // The last word is our message key.
    msgKey.Assign(word);
  }

  // Cut the message key out of the path. We want to cut the length of the key +
  // 1, to also remove the `/` character between the folder and the key.
  auto keyStartIndex = folderURIPath.Length() - msgKey.Length() - 1;
  auto keyLengthInURI = msgKey.Length() + 1;
  folderURIPath.Cut(keyStartIndex, keyLengthInURI);

  return NS_OK;
}

nsresult EwsService::MsgHdrFromUri(nsIURI* uri, nsIMsgDBHdr** _retval) {
  nsCString keyStr;
  nsCString folderURIPath;

  // Extract the message key and folder path from the URI depending on its
  // scheme.
  nsCString scheme;
  nsresult rv = uri->GetScheme(scheme);
  NS_ENSURE_SUCCESS(rv, rv);

  if (scheme.EqualsLiteral("ews-message")) {
    rv = MsgKeyStringFromMessageURI(uri, keyStr);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = uri->GetFilePath(folderURIPath);
    NS_ENSURE_SUCCESS(rv, rv);
  } else if (scheme.EqualsLiteral("x-moz-ews")) {
    rv = MsgKeyStringFromChannelURI(uri, keyStr, folderURIPath);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsMsgKey key =
      msgKeyFromInt(ParseUint64Str(PromiseFlatCString(keyStr).get()));

  // The URI provided to the folder lookup service (via `GetExistingFolder()`)
  // must match one it has in its database. Folders are created with an `ews`
  // scheme, and we need to remove the message key from the ref.
  RefPtr<nsIURI> folderUri;
  rv = NS_MutateURI(uri)
           .SetScheme("ews"_ns)
           .SetFilePath(folderURIPath)
           .SetQuery(""_ns)
           .SetRef(""_ns)
           .Finalize(getter_AddRefs(folderUri));
  NS_ENSURE_SUCCESS(rv, rv);

  // Look up the folder at this URI and use it to retrieve the rgith message
  // header.
  nsCString folderSpec;
  rv = folderUri->GetSpec(folderSpec);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<nsIMsgFolder> folder;
  rv = GetExistingFolder(folderSpec, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  return folder->GetMessageHeader(key, _retval);
}

nsresult EwsService::GetMessageContent(const nsACString& messageURI,
                                       nsIDocShell* displayDocShell,
                                       nsIStreamListener* streamListener) {
  // Get the matching nsIMsgDBHdr for the message URI.
  nsCOMPtr<nsIURI> uri;
  nsresult rv = NS_NewURI(getter_AddRefs(uri), messageURI);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = MsgHdrFromUri(uri, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  // Check if the folder the message is in has a local ("offline") copy of the
  // message's content.
  nsCOMPtr<nsIMsgFolder> folder;
  rv = hdr->GetFolder(getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);

  nsMsgKey msgKey;
  rv = hdr->GetMessageKey(&msgKey);
  NS_ENSURE_SUCCESS(rv, rv);

  bool offlineAvailable;
  rv = folder->HasMsgOffline(msgKey, &offlineAvailable);
  NS_ENSURE_SUCCESS(rv, rv);

  if (offlineAvailable) {
    // If the message content is available locally, serve it to the docshell or
    // stream listener if one is provided.
    if (displayDocShell) {
      return DisplayMessage(uri, displayDocShell);
    }

    if (streamListener) {
      RefPtr<EwsOfflineMessageChannel> channel =
          new EwsOfflineMessageChannel(uri);
      return channel->AsyncOpen(streamListener);
    }
  } else {
    // Otherwise, download the message from the server.
    return DownloadMessage(uri, hdr, displayDocShell, streamListener);
  }

  return NS_OK;
}

nsresult EwsService::DownloadMessage(nsIURI* messageURI, nsIMsgDBHdr* hdr,
                                     nsIDocShell* displayDocShell,
                                     nsIStreamListener* streamListener) {
  // Retrieve the EWS ID of the message we want to download.
  nsCString ewsId;
  nsresult rv = hdr->GetStringProperty(ID_PROPERTY, ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  // Look up the incoming server for this message, from which we can get an EWS
  // client.
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // `FindServerByURI()` expects that the URI passed in has a scheme matching
  // the value returned by an incoming server's `GetType()` method. In our case,
  // that should be `ews`.
  nsCOMPtr<nsIURI> serverUri;
  rv = NS_MutateURI(messageURI).SetScheme("ews"_ns).Finalize(serverUri);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = accountManager->FindServerByURI(serverUri, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  // Get an EWS client from the incoming server, and start downloading the
  // message content.
  nsCOMPtr<IEwsIncomingServer> ewsServer = do_QueryInterface(server, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<IEwsClient> client;
  rv = ewsServer->GetEwsClient(getter_AddRefs(client));
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<MessageFetchListener> listener = new MessageFetchListener(
      messageURI, hdr, displayDocShell, streamListener);
  return client->GetMessage(ewsId, listener);
}

nsresult DisplayMessage(nsIURI* messageURI, nsIDocShell* docShell) {
  NS_ENSURE_ARG_POINTER(messageURI);
  NS_ENSURE_ARG_POINTER(docShell);

  // At this point, the path to the message URI is expected to look like
  // /Path/To/Folder#MessageKey. With this format, if the user switches between
  // messages in the same folder, the docshell believes we're still in the same
  // document (because only the fragment/ref changed), and skip creating a
  // channel for any message except the first one. So we need to transform the
  // path into /Path/To/Folder/MessageKey.
  nsCString ref;
  nsresult rv = messageURI->GetRef(ref);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString path;
  rv = messageURI->GetFilePath(path);
  NS_ENSURE_SUCCESS(rv, rv);
  path.Append("/");
  path.Append(ref);

  // "x-moz-ews" is the scheme we use for URIs that must be used for channels
  // opened via a protocol handler consumer (such as a docshell or the I/O
  // service). These channels are expected to serve the raw content RFC822
  // content of the message referred to by the URI.
  nsCOMPtr<nsIURI> channelURI;
  rv = NS_MutateURI(messageURI)
           .SetScheme("x-moz-ews"_ns)
           .SetPathQueryRef(path)
           .Finalize(channelURI);
  NS_ENSURE_SUCCESS(rv, rv);

  // Load the message through the provided docshell.
  RefPtr<nsDocShellLoadState> loadState = new nsDocShellLoadState(channelURI);
  loadState->SetLoadFlags(nsIWebNavigation::LOAD_FLAGS_NONE);
  loadState->SetFirstParty(false);
  loadState->SetTriggeringPrincipal(nsContentUtils::GetSystemPrincipal());
  return docShell->LoadURI(loadState, false);
}
