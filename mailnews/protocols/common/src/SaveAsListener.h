/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_SAVEASLISTENER_H_
#define COMM_MAILNEWS_PROTOCOLS_COMMON_SRC_SAVEASLISTENER_H_

#include "nsCOMPtr.h"
#include "nsIStreamListener.h"
#include "nsIURI.h"
#include "nsIUrlListener.h"
#include "nsMsgUtils.h"

constexpr auto kDataBufferSize = FILE_IO_BUFFER_SIZE;

/**
 * An `nsIStreamListener` that consumes the content of a message and writes it
 * to a file on disk.
 */
class SaveAsListener : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER

  SaveAsListener(nsIFile* outputFile, bool addDummyEnvelope,
                 bool useCanonicalLineEnding, nsIUrlListener* urlListener,
                 nsIURI* uri)
      : mAddDummyEnvelope(addDummyEnvelope),
        mUseCanonicalLineEnding(useCanonicalLineEnding),
        mWrittenData(false),
        mOutputFile(outputFile),
        mLeftOver(0),
        mUrlListener(urlListener),
        mUri(uri) {
    if (urlListener) {
      MOZ_ASSERT(uri, "an nsIURI must be provided with an nsIUrlListener");
    }
  };

 protected:
  virtual ~SaveAsListener() = default;

 private:
  /**
   * Opens an `nsIOutputStream` for the output file. This also creates the file.
   *
   * If the file already exists, it's first removed to ensure its content is
   * overwritten with the message's content.
   */
  nsresult SetupMsgOutputStream();

  // The parameters for saving the file.
  bool mAddDummyEnvelope;
  bool mUseCanonicalLineEnding;

  // Whether we've already started writing data.
  bool mWrittenData;

  // The output destination for the current operation.
  nsCOMPtr<nsIOutputStream> mOutputStream;
  nsCOMPtr<nsIFile> mOutputFile;

  // The temporary buffer in which to store left over bytes from a previous call
  // to `OnDataAvailable`.
  char mDataBuffer[kDataBufferSize + 1]{};
  uint32_t mLeftOver;

  // An optional `nsIUrlListener`.
  //
  // If set, a corresponding `nsIURI` to use with `OnStartRunningUrl` and
  // `OnStopRunningUrl` **must** be provided.
  //
  // If a URL listener is provided, its relevant methods will be called when the
  // operation starts and finishes.
  nsCOMPtr<nsIUrlListener> mUrlListener;
  nsCOMPtr<nsIURI> mUri;
};

#endif