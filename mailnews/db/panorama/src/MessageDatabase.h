/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGEDATABASE_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGEDATABASE_H_

#include "MailNewsTypes2.h"
#include "mozilla/RefPtr.h"
#include "nsIMessageDatabase.h"
#include "nsTHashMap.h"
#include "nsTObserverArray.h"
#include "nsTString.h"

namespace mozilla::mailnews {

class Folder;
class Message;

class MessageListener : public nsISupports {
 public:
  virtual void OnMessageAdded(Message* message) = 0;
  virtual void OnMessageRemoved(Message* message) = 0;
  virtual void OnMessageFlagsChanged(Message* message, uint64_t oldFlags,
                                     uint64_t newFlags) = 0;
  virtual ~MessageListener() {};
};

class MessageDatabase : public nsIMessageDatabase {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMESSAGEDATABASE

 protected:
  virtual ~MessageDatabase() {};

 private:
  friend class DatabaseCore;

  MessageDatabase() {};
  void Startup();
  void Shutdown();

 private:
  friend class FolderInfo;
  friend class Message;
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
  nsresult GetMessageFlag(nsMsgKey aKey, uint64_t aFlag, bool* aHasFlag);
  nsresult SetMessageFlag(nsMsgKey key, uint64_t flag, bool setFlag);
  nsresult SetMessageFlags(nsMsgKey key, uint64_t flags);
  nsresult MarkAllRead(uint64_t aFolderId, nsTArray<nsMsgKey>& aMarkedKeys);
  nsresult GetNumMessages(uint64_t folderId, uint64_t* numMessages);
  nsresult GetNumUnread(uint64_t folderId, uint64_t* numUnread);

  nsresult GetMessageProperties(nsMsgKey aKey,
                                nsTArray<nsCString>& aProperties);
  nsresult GetMessageProperty(nsMsgKey aKey, const nsACString& aName,
                              nsACString& aValue);
  nsresult GetMessageProperty(nsMsgKey aKey, const nsACString& aName,
                              uint32_t* aValue);
  nsresult SetMessageProperty(nsMsgKey aKey, const nsACString& aName,
                              const nsACString& aValue);
  nsresult SetMessageProperty(nsMsgKey aKey, const nsACString& aName,
                              uint32_t aValue);

 private:
  nsTObserverArray<RefPtr<MessageListener>> mMessageListeners;

  nsresult SetMessageFlagsInternal(Message* message, uint64_t newFlags);
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_MESSAGEDATABASE_H_
