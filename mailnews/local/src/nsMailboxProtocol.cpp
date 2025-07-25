/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"

#include "nsPrintfCString.h"
#include "nsMailboxProtocol.h"
#include "nscore.h"
#include "nsIInputStreamPump.h"
#include "nsIMsgHdr.h"
#include "nsMsgLineBuffer.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIMsgFolder.h"
#include "nsICopyMessageListener.h"
#include "prtime.h"
#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/Preferences.h"
#include "mozilla/ProfilerMarkers.h"
#include "prerror.h"
#include "prprf.h"
#include "nspr.h"
#include "nsIStreamTransportService.h"
#include "nsIStreamConverterService.h"
#include "nsNetUtil.h"
#include "nsMsgUtils.h"
#include "nsIMsgWindow.h"
#include "nsStreamUtils.h"
#include "nsIScriptError.h"

using namespace mozilla;

static LazyLogModule MAILBOX("Mailbox");

/* the output_buffer_size must be larger than the largest possible line
 * 2000 seems good for news
 *
 * jwz: I increased this to 4k since it must be big enough to hold the
 * entire button-bar HTML, and with the new "mailto" format, that can
 * contain arbitrarily long header fields like "references".
 *
 * fortezza: proxy auth is huge, buffer increased to 8k (sigh).
 */
#define OUTPUT_BUFFER_SIZE (4096 * 2)

nsMailboxProtocol::nsMailboxProtocol(nsIURI* aURI)
    : nsMsgProtocol(aURI),
      m_mailboxAction(nsIMailboxUrl::ActionInvalid),
      m_nextState(MAILBOX_UNINITIALIZED),
      mCurrentProgress(0) {}

nsMailboxProtocol::~nsMailboxProtocol() {}

nsresult nsMailboxProtocol::Initialize(nsIURI* aURL) {
  NS_ASSERTION(aURL, "invalid URL passed into MAILBOX Protocol");

  nsresult rv = NS_OK;
  if (aURL) {
    // We want to prevent mailbox URLs using UNC paths to access
    // access arbitrary remote servers. But we don't want to disallow the
    // case where a user's profile is on a shared drive on the LAN.
    //
    // Note that individual accounts can have their storage pointed
    // to places outside the profile.
    //
    // UNC names are of the form:
    //   \\host-name\share-name\object-name
    // We'll disallow access to any host-name which looks like a FQDN,
    // unless it is listed as an exception in `allowed_unc_hosts`.
    //
    // So:
    //  "\\profileserver\bob\mail\Inbox"   -> OK
    //  "\\steal-your-stuff.com\bob\mail/Inbox"  -> NO!
    //            unless "steal-your-stuff.com" is in `mail.allowed_unc_hosts`.

    m_runningUrl = do_QueryInterface(aURL, &rv);
    nsCString filePath;
    rv = aURL->GetFilePath(filePath);
    NS_ENSURE_SUCCESS(rv, rv);
    NS_UnescapeURL(filePath);
    filePath.ReplaceChar('\\', '/');
    if (filePath.Length() > 3 && filePath.CharAt(1) == '/') {
      // We have an UNC path - file://///example.com/foobar
      // file:// +  path of which first may be / (linux root) - ok.
      // If second is also / we have an UNC path.

      int32_t dashPos = filePath.FindChar('/', 3);
      if (dashPos <= 0) {
        NS_WARNING(nsPrintfCString("Bad mailbox: %s", filePath.get()).get());
        return NS_ERROR_FILE_UNRECOGNIZED_PATH;
      }

      nsCOMPtr<nsIFile> profD;
      rv = NS_GetSpecialDirectory("ProfD", getter_AddRefs(profD));
      NS_ENSURE_SUCCESS(rv, rv);
      nsCOMPtr<nsIURI> profileFileURI;
      nsresult rv = NS_NewFileURI(getter_AddRefs(profileFileURI), profD);
      NS_ENSURE_SUCCESS(rv, rv);
      nsCString profileSpec = profileFileURI->GetSpecOrDefault();
      profileSpec.Replace(0, 5, "mailbox:"_ns);  // file: -> mailbox:
      // If under the profile, allow it.
      if (!StringBeginsWith(aURL->GetSpecOrDefault(), profileSpec)) {
        // It's not a path under the profile. See if we still can allow it.
        nsCString uncPath(StringHead(filePath, dashPos));  // -> ///example.com

        nsCString uncHosts;
        Preferences::GetCString("mail.allowed_unc_hosts", uncHosts);
        nsTArray<nsCString> hosts;
        ParseString(uncHosts, ',', hosts);
        bool allowed = false;
        for (auto host : hosts) {
          if (StringEndsWith(uncPath, "/"_ns + host)) {
            allowed = true;
            break;
          }
        }

        if (!allowed) {
          // Not explicitely allowd.
          // Then check if FQDN or IPv4/v6 and deny if it is.
          if (uncPath.FindChar('.') != -1 || uncPath.FindChar(':') != -1) {
            // Disallow remote UNC mailbox:// access.
            nsPrintfCString blocked("Blocking UNC mailbox at %s.",
                                    uncPath.get());
            NS_WARNING(blocked.get());
            blocked.Append(
                " To allow, add the hostname to mail.allowed_unc_hosts."_ns);
            MsgLogToConsole4(NS_ConvertUTF8toUTF16(blocked),
                             nsCString(__FILE__), __LINE__,
                             nsIScriptError::warningFlag);
            return NS_ERROR_FILE_UNRECOGNIZED_PATH;
          }
        }
      }
    }
    if (NS_SUCCEEDED(rv) && m_runningUrl) {
      if (RunningMultipleMsgUrl()) {
        // if we're running multiple msg url, we clear the event sink because
        // the multiple msg urls will handle setting the progress.
        mProgressEventSink = nullptr;
      }

      nsMsgKey msgKey;
      m_runningUrl->GetMessageKey(&msgKey);
      if (msgKey == 0) {
        // This appears to be an .eml file.
        rv = OpenFileSocket(aURL);
      } else {
        nsCOMPtr<nsIMsgMessageUrl> msgUrl =
            do_QueryInterface(m_runningUrl, &rv);
        if (NS_SUCCEEDED(rv)) {
          nsCOMPtr<nsIMsgFolder> folder;
          nsCOMPtr<nsIMsgDBHdr> msgHdr;
          rv = msgUrl->GetMessageHeader(getter_AddRefs(msgHdr));
          NS_ENSURE_SUCCESS(rv, rv);

          if (msgHdr) {
            uint32_t msgSize = 0;
            msgHdr->GetMessageSize(&msgSize);
            m_runningUrl->SetMessageSize(msgSize);

            SetContentLength(msgSize);
            rv = m_runningUrl->GetMailboxAction(&m_mailboxAction);
            NS_ENSURE_SUCCESS(rv, rv);
            nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl =
                do_QueryInterface(m_runningUrl);
            MOZ_ASSERT(m_mailboxAction != nsIMailboxUrl::ActionInvalid);
            mailnewsUrl->SetMaxProgress(msgSize);

            rv = msgHdr->GetFolder(getter_AddRefs(folder));
            NS_ENSURE_SUCCESS(rv, rv);
            if (folder) {
              nsCOMPtr<nsIInputStream> stream;
              rv = folder->GetLocalMsgStream(msgHdr, getter_AddRefs(stream));
              NS_ENSURE_SUCCESS(rv, rv);
              // create input stream transport
              nsCOMPtr<nsIStreamTransportService> sts =
                  mozilla::components::StreamTransport::Service();
              rv = sts->CreateInputTransport(stream, true,
                                             getter_AddRefs(m_transport));

              m_socketIsOpen = false;
            }
          }
        }
      }
    }
  }

  m_lineStreamBuffer = new nsMsgLineStreamBuffer(OUTPUT_BUFFER_SIZE, true);

  mCurrentProgress = 0;
  return rv;
}

/////////////////////////////////////////////////////////////////////////////////////////////
// we support the nsIStreamListener interface
////////////////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsMailboxProtocol::OnStartRequest(nsIRequest* request) {
  AUTO_PROFILER_LABEL("nsMailboxProtocol::OnStartRequest", MAILNEWS);
  return nsMsgProtocol::OnStartRequest(request);
}

bool nsMailboxProtocol::RunningMultipleMsgUrl() {
  if (m_mailboxAction == nsIMailboxUrl::ActionCopyMessage ||
      m_mailboxAction == nsIMailboxUrl::ActionMoveMessage) {
    uint32_t numMoveCopyMsgs;
    nsresult rv = m_runningUrl->GetNumMoveCopyMsgs(&numMoveCopyMsgs);
    if (NS_SUCCEEDED(rv) && numMoveCopyMsgs > 1) return true;
  }
  return false;
}

// stop binding is a "notification" informing us that the stream associated with
// aURL is going away.
NS_IMETHODIMP nsMailboxProtocol::OnStopRequest(nsIRequest* request,
                                               nsresult aStatus) {
  AUTO_PROFILER_LABEL("nsMailboxProtocol::OnStopRequest", MAILNEWS);

  nsresult rv;
  if (m_nextState == MAILBOX_READ_MESSAGE) {
    DoneReadingMessage();
  }
  // I'm not getting cancel status - maybe the load group still has the status.
  if (m_runningUrl) {
    if (NS_SUCCEEDED(aStatus) &&
        (m_mailboxAction == nsIMailboxUrl::ActionCopyMessage ||
         m_mailboxAction == nsIMailboxUrl::ActionMoveMessage)) {
      uint32_t numMoveCopyMsgs;
      uint32_t curMoveCopyMsgIndex;
      rv = m_runningUrl->GetNumMoveCopyMsgs(&numMoveCopyMsgs);
      if (NS_SUCCEEDED(rv) && numMoveCopyMsgs > 0) {
        m_runningUrl->GetCurMoveCopyMsgIndex(&curMoveCopyMsgIndex);
        if (++curMoveCopyMsgIndex < numMoveCopyMsgs) {
          if (!mSuppressListenerNotifications && m_channelListener) {
            nsCOMPtr<nsICopyMessageListener> listener =
                do_QueryInterface(m_channelListener, &rv);
            if (listener) {
              bool copySucceeded = NS_SUCCEEDED(aStatus);
              listener->EndCopy(copySucceeded);
              listener->StartMessage();  // start next message.
            }
          }

          // Start streaming out the next message
          // TODO: unify this with the code that sets up streaming
          // out the first message...
          m_transport = nullptr;  // open new stream transport
          m_outputStream = nullptr;
          m_runningUrl->SetCurMoveCopyMsgIndex(curMoveCopyMsgIndex);
          nsCOMPtr<nsIMsgDBHdr> nextMsg;
          rv = m_runningUrl->GetMoveCopyMsgHdrForIndex(curMoveCopyMsgIndex,
                                                       getter_AddRefs(nextMsg));
          if (NS_SUCCEEDED(rv) && nextMsg) {
            nsCOMPtr<nsIMsgFolder> msgFolder;
            nextMsg->GetFolder(getter_AddRefs(msgFolder));
            NS_ASSERTION(
                msgFolder,
                "couldn't get folder for next msg in multiple msg local copy");
            if (msgFolder) {
              nsCString uri;
              msgFolder->GetUriForMsg(nextMsg, uri);
              nsCOMPtr<nsIMsgMessageUrl> msgUrl =
                  do_QueryInterface(m_runningUrl);
              if (msgUrl) {
                msgUrl->SetOriginalSpec(uri);
                msgUrl->SetUri(uri);

                nsCOMPtr<nsIInputStream> stream;
                rv = msgFolder->GetLocalMsgStream(nextMsg,
                                                  getter_AddRefs(stream));

                if (NS_SUCCEEDED(rv)) {
                  // create input stream transport
                  nsCOMPtr<nsIStreamTransportService> sts =
                      mozilla::components::StreamTransport::Service();
                  rv = sts->CreateInputTransport(stream, true,
                                                 getter_AddRefs(m_transport));
                }

                // TODO: can we just use the msgStore stream directly rather
                // than doing OpenInputStream()?
                if (NS_SUCCEEDED(rv)) {
                  nsCOMPtr<nsIInputStream> stream;
                  rv = m_transport->OpenInputStream(0, 0, 0,
                                                    getter_AddRefs(stream));

                  if (NS_SUCCEEDED(rv)) {
                    nsCOMPtr<nsIInputStreamPump> pump;
                    rv = NS_NewInputStreamPump(getter_AddRefs(pump),
                                               stream.forget());
                    if (NS_SUCCEEDED(rv)) {
                      rv = pump->AsyncRead(this);
                      if (NS_SUCCEEDED(rv)) m_request = pump;
                    }
                  }
                }

                NS_ASSERTION(NS_SUCCEEDED(rv), "AsyncRead failed");
                if (m_loadGroup)
                  m_loadGroup->RemoveRequest(static_cast<nsIRequest*>(this),
                                             nullptr, aStatus);
                m_socketIsOpen = true;  // mark the channel as open
                return aStatus;
              }
            }
          }
        }
      }
    }
  }
  // and we want to mark ourselves for deletion or some how inform our protocol
  // manager that we are available for another url if there is one.

  // mscott --> maybe we should set our state to done because we don't run
  // multiple urls in a mailbox protocol connection....
  m_nextState = MAILBOX_DONE;

  // the following is for smoke test purposes. QA is looking at this "Mailbox
  // Done" string which is printed out to the console and determining if the
  // mail app loaded up correctly...obviously this solution is not very good so
  // we should look at something better, but don't remove this line before
  // talking to me (mscott) and mailnews QA....

  MOZ_LOG(MAILBOX, LogLevel::Info, ("Mailbox Done"));

  // We're done. Close the file before invoking base OnStopRequest(). This
  // is because there may be a listener that might want to overwrite the file,
  // and if the file is still open, that will fail (on windows).
  // This is the case for folder compaction, for example.

  rv = CloseSocket();

  nsMsgProtocol::OnStopRequest(request, aStatus);
  return rv;
}

/////////////////////////////////////////////////////////////////////////////////////////////
// End of nsIStreamListenerSupport
//////////////////////////////////////////////////////////////////////////////////////////////

nsresult nsMailboxProtocol::DoneReadingMessage() {
  nsresult rv = NS_OK;
  // and close the article file if it was open....

  if (m_mailboxAction == nsIMailboxUrl::ActionSaveMessageToDisk &&
      m_msgFileOutputStream)
    rv = m_msgFileOutputStream->Close();

  return rv;
}

/////////////////////////////////////////////////////////////////////////////////////////////
// Begin protocol state machine functions...
//////////////////////////////////////////////////////////////////////////////////////////////

nsresult nsMailboxProtocol::LoadUrl(nsIURI* aURL, nsISupports* aConsumer) {
  nsresult rv = NS_OK;
  // if we were already initialized with a consumer, use it...
  nsCOMPtr<nsIStreamListener> consumer = do_QueryInterface(aConsumer);
  if (consumer) m_channelListener = consumer;

  if (aURL) {
    m_runningUrl = do_QueryInterface(aURL);
    if (m_runningUrl) {
      // find out from the url what action we are supposed to perform...
      rv = m_runningUrl->GetMailboxAction(&m_mailboxAction);

      bool convertData = false;

      // need to check if we're fetching an rfc822 part in order to
      // quote a message.
      if (m_mailboxAction == nsIMailboxUrl::ActionFetchMessage) {
        nsCOMPtr<nsIMsgMailNewsUrl> msgUrl =
            do_QueryInterface(m_runningUrl, &rv);
        NS_ENSURE_SUCCESS(rv, rv);

        nsAutoCString queryStr;
        rv = msgUrl->GetQuery(queryStr);
        NS_ENSURE_SUCCESS(rv, rv);

        // check if this is a filter plugin requesting the message.
        // in that case, set up a text converter
        convertData = (queryStr.Find("header=filter") != -1 ||
                       queryStr.Find("header=attach") != -1);
      } else if (m_mailboxAction == nsIMailboxUrl::ActionFetchPart) {
        // when fetching a part, we need to insert a converter into the listener
        // chain order to force just the part out of the message. Our channel
        // listener is the consumer we'll pass in to AsyncConvertData.
        convertData = true;
        consumer = m_channelListener;
      }
      if (convertData) {
        nsCOMPtr<nsIStreamConverterService> streamConverter =
            mozilla::components::StreamConverter::Service();
        nsCOMPtr<nsIStreamListener> conversionListener;
        nsCOMPtr<nsIChannel> channel;
        QueryInterface(NS_GET_IID(nsIChannel), getter_AddRefs(channel));

        rv = streamConverter->AsyncConvertData(
            "message/rfc822", "*/*", consumer, channel,
            getter_AddRefs(m_channelListener));
      }

      if (NS_SUCCEEDED(rv)) {
        switch (m_mailboxAction) {
          case nsIMailboxUrl::ActionInvalid:
            MOZ_ASSERT(false);  // Bad URL.
            break;
          case nsIMailboxUrl::ActionSaveMessageToDisk: {
            nsCOMPtr<nsIMsgMessageUrl> messageUrl =
                do_QueryInterface(m_runningUrl, &rv);
            NS_ENSURE_SUCCESS(rv, rv);
            nsCOMPtr<nsIFile> tempMsgFile;
            messageUrl->GetMessageFile(getter_AddRefs(tempMsgFile));
            NS_ENSURE_STATE(tempMsgFile);
            rv = MsgNewBufferedFileOutputStream(
                getter_AddRefs(m_msgFileOutputStream), tempMsgFile, -1, 00600);
            NS_ENSURE_SUCCESS(rv, rv);

            bool addDummyEnvelope = false;
            messageUrl->GetAddDummyEnvelope(&addDummyEnvelope);
            if (addDummyEnvelope)
              SetFlag(MAILBOX_MSG_PARSE_FIRST_LINE);
            else
              ClearFlag(MAILBOX_MSG_PARSE_FIRST_LINE);

            m_nextState = MAILBOX_READ_MESSAGE;
            break;
          }
          case nsIMailboxUrl::ActionCopyMessage:
          case nsIMailboxUrl::ActionMoveMessage:
          case nsIMailboxUrl::ActionFetchMessage:
            ClearFlag(MAILBOX_MSG_PARSE_FIRST_LINE);
            m_nextState = MAILBOX_READ_MESSAGE;
            break;
          case nsIMailboxUrl::ActionFetchPart:
            m_nextState = MAILBOX_READ_MESSAGE;
            break;
          default:
            break;
        }
      }

      rv = nsMsgProtocol::LoadUrl(aURL, m_channelListener);

    }  // if we received an MAILBOX url...
  }  // if we received a url!

  return rv;
}

int32_t nsMailboxProtocol::ReadMessageResponse(nsIInputStream* inputStream,
                                               uint64_t sourceOffset,
                                               uint32_t length) {
  char* line = nullptr;
  uint32_t status = 0;
  nsresult rv = NS_OK;
  mCurrentProgress += length;

  // if we are doing a move or a copy, forward the data onto the copy handler...
  // if we want to display the message then parse the incoming data...

  if (m_channelListener) {
    // just forward the data we read in to the listener...
    rv = m_channelListener->OnDataAvailable(this, inputStream, sourceOffset,
                                            length);
  } else {
    bool pauseForMoreData = false;
    bool canonicalLineEnding = false;
    nsCOMPtr<nsIMsgMessageUrl> msgurl = do_QueryInterface(m_runningUrl);

    if (msgurl) msgurl->GetCanonicalLineEnding(&canonicalLineEnding);

    while ((line = m_lineStreamBuffer->ReadNextLine(inputStream, status,
                                                    pauseForMoreData)) &&
           !pauseForMoreData) {
      /* When we're sending this line to a converter (ie,
      it's a message/rfc822) use the local line termination
      convention, not CRLF.  This makes text articles get
      saved with the local line terminators.  Since SMTP
      and NNTP mandate the use of CRLF, it is expected that
      the local system will convert that to the local line
      terminator as it is read.
      */
      // mscott - the firstline hack is aimed at making sure we don't write
      // out the dummy header when we are trying to display the message.
      // The dummy header is the From line with the date tag on it.
      if (m_msgFileOutputStream && TestFlag(MAILBOX_MSG_PARSE_FIRST_LINE)) {
        uint32_t count = 0;
        rv = m_msgFileOutputStream->Write(line, PL_strlen(line), &count);
        if (NS_FAILED(rv)) break;

        if (canonicalLineEnding)
          rv = m_msgFileOutputStream->Write(CRLF, 2, &count);
        else
          rv = m_msgFileOutputStream->Write(MSG_LINEBREAK, MSG_LINEBREAK_LEN,
                                            &count);

        if (NS_FAILED(rv)) break;
      } else
        SetFlag(MAILBOX_MSG_PARSE_FIRST_LINE);
      PR_Free(line);
    }
    PR_Free(line);
  }

  SetFlag(MAILBOX_PAUSE_FOR_READ);  // wait for more data to become available...
  if (mProgressEventSink && m_runningUrl) {
    int64_t maxProgress;
    nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl(do_QueryInterface(m_runningUrl));
    mailnewsUrl->GetMaxProgress(&maxProgress);
    mProgressEventSink->OnProgress(this, mCurrentProgress, maxProgress);
  }

  if (NS_FAILED(rv)) return -1;

  return 0;
}

/*
 * returns negative if the transfer is finished or error'd out
 *
 * returns zero or more if the transfer needs to be continued.
 */
nsresult nsMailboxProtocol::ProcessProtocolState(nsIURI* url,
                                                 nsIInputStream* inputStream,
                                                 uint64_t offset,
                                                 uint32_t length) {
  nsresult rv = NS_OK;
  int32_t status = 0;
  ClearFlag(MAILBOX_PAUSE_FOR_READ); /* already paused; reset */

  while (!TestFlag(MAILBOX_PAUSE_FOR_READ)) {
    switch (m_nextState) {
      case MAILBOX_READ_MESSAGE:
        if (inputStream == nullptr)
          SetFlag(MAILBOX_PAUSE_FOR_READ);
        else
          status = ReadMessageResponse(inputStream, offset, length);
        break;
      case MAILBOX_DONE:
      case MAILBOX_ERROR_DONE: {
        nsCOMPtr<nsIMsgMailNewsUrl> anotherUrl =
            do_QueryInterface(m_runningUrl);
        rv = m_nextState == MAILBOX_DONE ? NS_OK : NS_ERROR_FAILURE;
        anotherUrl->SetUrlState(false, rv);
        m_nextState = MAILBOX_FREE;
      } break;

      case MAILBOX_FREE:
        // MAILBOX is a one time use connection so kill it if we get here...
        CloseSocket();
        return rv; /* final end */

      default: /* should never happen !!! */
        m_nextState = MAILBOX_ERROR_DONE;
        break;
    }

    /* check for errors during load and call error
     * state if found
     */
    if (status < 0 && m_nextState != MAILBOX_FREE) {
      m_nextState = MAILBOX_ERROR_DONE;
      /* don't exit! loop around again and do the free case */
      ClearFlag(MAILBOX_PAUSE_FOR_READ);
    }
  } /* while(!MAILBOX_PAUSE_FOR_READ) */

  return rv;
}

nsresult nsMailboxProtocol::CloseSocket() {
  // how do you force a release when closing the connection??
  nsMsgProtocol::CloseSocket();
  m_runningUrl = nullptr;
  return NS_OK;
}

// vim: ts=2 sw=2
