/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_

#include "Message.h"
#include "mozilla/RefPtr.h"
#include "nsIMsgThread.h"

namespace mozilla::mailnews {

class Thread : public nsIMsgThread {
 public:
  explicit Thread(Message* message) : mMessage(message) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGTHREAD

 private:
  virtual ~Thread() {};

  RefPtr<Message> mMessage;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_
