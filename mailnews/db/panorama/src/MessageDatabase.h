/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGEDATABASE_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGEDATABASE_H_

#include "MailNewsTypes.h"
#include "mozilla/HashTable.h"
#include "mozilla/RefPtr.h"
#include "mozilla/Result.h"
#include "nsIMessageDatabase.h"
#include "nsTObserverArray.h"
#include "nsTString.h"

namespace mozilla::mailnews {

class Folder;
class Message;

class MessageListener : public nsISupports {
 public:
  virtual void OnMessageAdded(Message* message) = 0;
  virtual void OnMessageRemoved(Message* message, uint32_t oldFlags) = 0;
  virtual void OnMessageFlagsChanged(Message* message, uint32_t oldFlags,
                                     uint32_t newFlags) = 0;
  virtual ~MessageListener() {};
};

#define MESSAGE_SQL_FIELDS \
  "id, folderId, threadId, threadParent, messageId, date, sender, recipients, ccList, bccList, subject, flags, tags"_ns

class MessageDatabase : public nsIMessageDatabase {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMESSAGEDATABASE

  // A bunch of oddly-specific functions here purely to support implementing
  // legacy message interfaces (nsIMsgDBHdr and friends).
  // Only available via the concrete class, Not XPCOM.
  // New code should avoid these in favour of more operation-centric methods
  // (eg: "tag these messages with $keyword", "move these messages into
  // folder B", "fetch JS-friendly data for these messages" etc...).

  nsresult GetMessageFlags(nsMsgKey key, uint32_t& flags);
  nsresult GetMessageFlag(nsMsgKey key, uint32_t flag, bool& value);
  nsresult GetMessageDate(nsMsgKey key, PRTime& date);
  nsresult GetMessageSize(nsMsgKey key, uint64_t& size);
  nsresult GetMessageLineCount(nsMsgKey key, uint32_t& size);
  nsresult GetMessageOfflineMessageSize(nsMsgKey key, uint64_t& size);
  nsresult GetMessageStoreToken(nsMsgKey key, nsACString& token);
  nsresult GetMessageMessageId(nsMsgKey key, nsACString& messageId);
  nsresult GetMessageCcList(nsMsgKey key, nsACString& ccList);
  nsresult GetMessageBccList(nsMsgKey key, nsACString& bccList);
  nsresult GetMessageSender(nsMsgKey key, nsACString& sender);
  nsresult GetMessageSubject(nsMsgKey key, nsACString& subject);
  nsresult GetMessageRecipients(nsMsgKey key, nsACString& recipients);
  nsresult GetMessageTags(nsMsgKey key, nsACString& tags);
  nsresult GetMessageUidOnServer(nsMsgKey key, uint32_t& uidOnServer);
  nsresult GetMessageFolderId(nsMsgKey key, uint64_t& folderId);
  nsresult GetMessagePropertyNames(nsMsgKey key, nsTArray<nsCString>& names);
  nsresult GetMessageProperty(nsMsgKey key, const nsACString& name,
                              nsACString& value);
  nsresult GetMessageProperty(nsMsgKey key, const nsACString& name,
                              uint32_t& value);

  nsresult GetMessageThreadId(nsMsgKey key, nsMsgKey& threadId);
  nsresult GetMessageThreadParent(nsMsgKey key, nsMsgKey& threadParent);

  nsresult SetMessageFlags(nsMsgKey key, uint32_t flags);
  nsresult SetMessageFlag(nsMsgKey key, uint32_t flag, bool value);
  nsresult SetMessageDate(nsMsgKey key, PRTime date);
  nsresult SetMessageSize(nsMsgKey key, uint64_t size);
  nsresult SetMessageLineCount(nsMsgKey key, uint32_t size);
  nsresult SetMessageOfflineMessageSize(nsMsgKey key, uint64_t size);
  nsresult SetMessageStoreToken(nsMsgKey key, const nsACString& token);
  nsresult SetMessageMessageId(nsMsgKey key, const nsACString& messageId);
  nsresult SetMessageCcList(nsMsgKey key, const nsACString& ccList);
  nsresult SetMessageBccList(nsMsgKey key, const nsACString& bccList);
  nsresult SetMessageSender(nsMsgKey key, const nsACString& sender);
  nsresult SetMessageSubject(nsMsgKey key, const nsACString& subject);
  nsresult SetMessageRecipients(nsMsgKey key, const nsACString& recipients);
  nsresult SetMessageTags(nsMsgKey key, const nsACString& tags);
  nsresult SetMessageUidOnServer(nsMsgKey key, uint32_t uidOnServer);
  nsresult SetMessageProperty(nsMsgKey key, const nsACString& name,
                              const nsACString& value);
  nsresult SetMessageProperty(nsMsgKey key, const nsACString& name,
                              uint32_t value);

  nsresult MessageExists(nsMsgKey key, bool& exists);

 protected:
  virtual ~MessageDatabase() {};

 private:
  friend class DatabaseCore;

  MessageDatabase() {};
  void Startup();
  void Shutdown();

 private:
  friend class FolderInfo;
  friend class PerFolderDatabase;
  friend class Thread;
  friend class ThreadMessageEnumerator;

  nsresult ListAllKeys(uint64_t aFolderId, nsTArray<nsMsgKey>& aKeys);
  nsresult ListThreadKeys(uint64_t folderId, uint64_t parent, uint64_t threadId,
                          nsTArray<nsMsgKey>& keys);
  nsresult GetThreadMaxDate(uint64_t folderId, uint64_t threadId,
                            uint64_t* maxDate);
  nsresult CountThreadKeys(uint64_t folderId, uint64_t threadId,
                           uint64_t* numMessages);
  nsresult ListThreadChildKeys(uint64_t folderId, uint64_t parent,
                               nsTArray<nsMsgKey>& keys);
  nsresult GetMessage(nsMsgKey aKey, Message** aMessage);
  nsresult GetMessageForMessageID(uint64_t aFolderId,
                                  const nsACString& aMessageId,
                                  Message** aMessage);
  nsresult MarkAllRead(uint64_t aFolderId, nsTArray<nsMsgKey>& aMarkedKeys);
  nsresult GetNumMessages(uint64_t folderId, uint64_t* numMessages);
  nsresult GetNumUnread(uint64_t folderId, uint64_t* numUnread);

  // Message-data cache.
  // Holds whatever fields we want to cache about a message - can
  // be pulled from multiple tables, and doesn't have to be _every_
  // field.
  struct CachedMsg {
    nsMsgKey key{nsMsgKey_None};
    uint64_t folderId{0};
    nsMsgKey threadId;
    nsMsgKey threadParent;
    nsAutoCString messageId;
    PRTime date{0};
    nsAutoCString sender;
    nsAutoCString recipients;
    nsAutoCString ccList;
    nsAutoCString bccList;
    nsAutoCString subject;
    uint64_t flags{0};
    nsAutoCString tags;
  };
  // The cache, indexed by msgKey.
  mozilla::HashMap<nsMsgKey, CachedMsg> mMsgCache;
  // Guarantee message data is in cache.
  Result<CachedMsg*, nsresult> EnsureCached(nsMsgKey key);
  // Fetch message data from DB into our cache struct.
  nsresult FetchMsg(nsMsgKey key, CachedMsg& cached);
  // Check the cache and slim it down if needed.
  void TrimCache();

  nsTObserverArray<RefPtr<MessageListener>> mMessageListeners;

  nsresult SetMessageFlagsInternal(Message* message, uint32_t newFlags);
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGEDATABASE_H_
