/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mimemmix.h"
#include "prlog.h"
#include "plstr.h"
#include "prmem.h"
#include "mimemoz2.h"
#include "nsMimeStringResources.h"
#include "mozilla/dom/Promise.h"

using namespace mozilla;

#define MIME_SUPERCLASS mimeMultipartClass
MimeDefClass(MimeMultipartMixed, MimeMultipartMixedClass,
             mimeMultipartMixedClass, &MIME_SUPERCLASS);

extern void MimeCMSGetFromSender(MimeObject* obj, nsCString& from_addr,
                                 nsCString& from_name, nsCString& sender_addr,
                                 nsCString& sender_name, nsCString& msg_date);

static int MimeMultipartMixed_initialize(MimeObject*);
static int MimeMultipartMixed_create_child(MimeObject*);
static int MimeMultipartMixed_close_child(MimeObject*);
static int MimeMultipartMixed_parse_line(const char*, int32_t, MimeObject*);
static int MimeMultipartMixed_parse_eof(MimeObject*, bool);
static void MimeMultipartMixed_finalize(MimeObject*);

static int MimeMultipartMixedClassInitialize(MimeObjectClass* oclass) {
  MimeMultipartClass* mclass = (MimeMultipartClass*)oclass;

  oclass->initialize = MimeMultipartMixed_initialize;
  oclass->parse_line = MimeMultipartMixed_parse_line;
  oclass->parse_eof = MimeMultipartMixed_parse_eof;
  oclass->finalize = MimeMultipartMixed_finalize;
  mclass->create_child = MimeMultipartMixed_create_child;
  mclass->close_child = MimeMultipartMixed_close_child;

  PR_ASSERT(!oclass->class_initialized);
  return 0;
}

// TODO: check for expected properties of an unobtrusively signed
// message, as specified in the draft, as explained in section
// "Detecting an Unobtrusive Signature"
// currently:
// https://www.ietf.org/archive/id/draft-gallagher-email-unobtrusive-signatures-02.html#name-detecting-an-unobtrusive-si

static int MimeMultipartMixed_initialize(MimeObject* obj) {
  MimeMultipartMixed* mix = (MimeMultipartMixed*)obj;
  mix->childCounter = 0;
  mix->payload = nullptr;

  mix->headerState = MimeMultipartMixed::expectingInitialBoundary;
  mix->postponedCRLFCounter = 0;

  mix->payload = MimePartBufferCreate();
  if (!mix->payload) {
    return MIME_OUT_OF_MEMORY;
  }
  mix->cpp = new MMMCppMembers;
  return ((MimeObjectClass*)&MIME_SUPERCLASS)->initialize(obj);
}

static void MimeMultipartMixed_finalize(MimeObject* obj) {
  MimeMultipartMixed* mix = (MimeMultipartMixed*)obj;

  if (mix->payload) {
    MimePartBufferDestroy(mix->payload);
    mix->payload = 0;
  }

  if (mix->cpp) {
    delete mix->cpp;
    mix->cpp = nullptr;
  }

  ((MimeObjectClass*)&MIME_SUPERCLASS)->finalize(obj);
}

class MimeStringCollector {
 public:
  MimeStringCollector() {}

  nsCString mData;
};

int MimePartBufOutputCB(const char* buf, int32_t size, MimeClosure closure) {
  MimeStringCollector* msc = closure.AsStringCollector();
  if (!msc) {
    return -1;
  }

  if (size) {
    msc->mData.Append(buf, size);
  }
  return 0;
}

static int MimeMultipartMixed_parse_eof(MimeObject* obj, bool abort_p) {
  MimeMultipartMixed* mix = (MimeMultipartMixed*)obj;

  // TODO: How do we output the additional postponedCRLFCounter * CRLF,
  // without using them for signature calculation?
  // Did superclass _parse_line already handle that?

  if (mix->payload) {
    MimePartBufferClose(mix->payload);
  }

  if (obj->closed_p) return 0;

  if (!abort_p && mix->cpp->isTopPart == Some(true)) {
    if (mix->childCounter == 1 && mix->cpp->sigs.Length() >= 1 &&
        obj->options->stream_closure) {
      mime_stream_data* msd =
          obj->options->stream_closure.IsMimeDraftData()
              ? nullptr
              : obj->options->stream_closure.AsMimeStreamData();
      nsIChannel* channel = msd ? msd->channel.get() : nullptr;

      if (channel) {
        nsCOMPtr<nsIURI> uri;
        channel->GetURI(getter_AddRefs(uri));
        if (uri) {
          nsresult rv = uri->GetSpec(mix->url);

          // We only want to update the UI if the current mime transaction
          // is intended for display.
          // If the current transaction is intended for background processing,
          // we can learn that by looking at the additional header=filter
          // string contained in the URI.
          //
          // If we find something, we do not set smimeSink,
          // which will prevent us from giving UI feedback.
          //
          // If we do not find header=filter, we assume the result of the
          // processing will be shown in the UI.

          if (NS_SUCCEEDED(rv) && !strstr(mix->url.get(), "?header=filter") &&
              !strstr(mix->url.get(), "&header=filter") &&
              !strstr(mix->url.get(), "?header=attach") &&
              !strstr(mix->url.get(), "&header=attach")) {
            nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(channel);
            if (mailChannel) {
              mailChannel->GetOpenpgpSink(
                  getter_AddRefs(mix->cpp->openpgpSink));
            }

            if (mix->cpp->openpgpSink) {
              MimeStringCollector msc;

              MimePartBufferRead(
                  mix->payload, MimePartBufOutputCB,
                  MimeClosure(MimeClosure::isStringCollector, &msc));

              nsCString flatMsg(PromiseFlatCString(msc.mData));
              nsCString from_addr;
              nsCString from_name;
              nsCString sender_addr;
              nsCString sender_name;
              nsCString msg_date;

              MimeCMSGetFromSender(obj, from_addr, from_name, sender_addr,
                                   sender_name, msg_date);
              // We ignore the signature if the message's date header
              // value is non-conforming (cannot be parsed).
              // TODO: We could check for an invalid date header at an
              // earlier time, and if it's invalid, we could skip most
              // of the processing logic, such as buffering the payload.
              PRTime msgTime;
              if (PR_ParseTimeString(msg_date.get(), false, &msgTime) ==
                  PR_SUCCESS) {
                RefPtr<mozilla::dom::Promise> promise;
                nsAutoCString partNum;
                partNum.Adopt(mime_part_address(obj));
                mix->cpp->openpgpSink->ProcessUnobtrusiveSignature(
                    flatMsg, mix->cpp->sigs[0],
                    from_addr.Length() ? from_addr : sender_addr, msgTime, uri,
                    partNum, getter_AddRefs(promise));
              }
            }
          }
        }
      }  // if channel
    }
  }

  return ((MimeObjectClass*)&MIME_SUPERCLASS)->parse_eof(obj, abort_p);
}

static int flushPostponedCRLF(MimeMultipartMixed* mix) {
  int status = 0;
  for (; !status && mix->postponedCRLFCounter; mix->postponedCRLFCounter--) {
    status = MimePartBufferWrite(mix->payload, "\r\n", 2);
  }
  return status;
}

static int writeLineBufCRLF(MimePartBufferData* buf, const char* line,
                            int32_t length) {
  while (length > 0) {
    char c = line[length - 1];
    if (c != '\r' && c != '\n') {
      break;
    }
    length--;
  }
  int status = 0;
  if (length) {
    status = MimePartBufferWrite(buf, line, length);
  }
  if (status >= 0) {
    status = MimePartBufferWrite(buf, "\r\n", 2);
  }
  return status;
}

static bool isEmptyLine(const char* line, const int32_t length) {
  return (length == 1 && line[0] == '\n') ||
         (length == 2 && line[0] == '\r' && line[1] == '\n');
}

static bool isPotentialBoundaryLine(const char* line, const int32_t length) {
  return (length > 2 && line[0] == '-' && line[1] == '-');
}

static bool startsWithWhitespace(const char* line, const int32_t length) {
  return (length > 0 && (line[0] == ' ' || line[0] == '\t'));
}

static int MimeMultipartMixed_parse_line(const char* line, const int32_t length,
                                         MimeObject* obj) {
  if (length < 0) {
    return -1;
  }

  MimeMultipartMixed* mix = (MimeMultipartMixed*)obj;

  if (mix->cpp->isTopPart.isNothing()) {
    // We don't know yet whether we are the top part, let's find out.
    const char* partAddr = mime_part_address(obj);
    mix->cpp->isTopPart = Some(strcmp("1", partAddr) == 0);
    PR_Free((void*)partAddr);
  }

  bool ignoreLine = false;

  if (mix->cpp->isTopPart == Some(false)) {
    // We are not the top part, we skip this part completely.
    ignoreLine = true;
  } else if (mix->headerState ==
             MimeMultipartMixed::skippingOverAdditionalParts) {
    ignoreLine = true;
  } else if (isEmptyLine(line, length) &&
             mix->headerState <=
                 MimeMultipartMixed::expectingSigOrOtherHeader) {
    // empty line before the first part contents
    ignoreLine = true;
  } else if (isPotentialBoundaryLine(line, length)) {
    // AFAICT function MimeMultipart_check_boundary has no side effect on
    // state, so it should be fine to call it here.
    MimeMultipartClass* multClass = ((MimeMultipartClass*)(&MIME_SUPERCLASS));
    MimeMultipartBoundaryType boundaryType =
        multClass->check_boundary(obj, line, length);

    if (boundaryType == MimeMultipartBoundaryTypeTerminator) {
      // Don't process further.
      mix->headerState = MimeMultipartMixed::skippingOverAdditionalParts;
      ignoreLine = true;
    } else if (boundaryType == MimeMultipartBoundaryTypeSeparator) {
      ignoreLine = true;
      if (mix->headerState == MimeMultipartMixed::expectingInitialBoundary) {
        // ok, move on to processing
        mix->headerState = MimeMultipartMixed::expectingSigOrOtherHeader;
      } else {
        // We were already inside the first payload part.
        // This separator signals another part, and that isn't
        // allowed for unob-sigs, so we're done.
        mix->headerState = MimeMultipartMixed::skippingOverAdditionalParts;
      }
    } else if (boundaryType == MimeMultipartBoundaryTypeNone) {
      if (mix->headerState == MimeMultipartMixed::expectingInitialBoundary) {
        ignoreLine = true;
      }
    }
  }

  if (ignoreLine) {
    return (
        ((MimeObjectClass*)(&MIME_SUPERCLASS))->parse_line(line, length, obj));
  }

  int status = 0;
  if (mix->headerState >= MimeMultipartMixed::expectingSigOrOtherHeader &&
      mix->headerState <=
          MimeMultipartMixed::expectingMoreHeadersOrEndOfHeaders) {
    if (isEmptyLine(line, length)) {
      if (mix->headerState ==
          MimeMultipartMixed::expectingSigContinueOrOtherHeader) {
        // This shouldn't happen, even if the sender violated the
        // spec and didn't use header protection, there should at least
        // be a Content-Type header following the Sig: line.
        // Flush sig nevertheless.
        mix->cpp->sigs.AppendElement(mix->cpp->currentSig);
        mix->cpp->currentSig.Truncate();
      }
      mix->headerState = MimeMultipartMixed::expectingBodyLinesOrBoundary;
      status = writeLineBufCRLF(mix->payload, line, length);
      if (status < 0) {
        return status;
      }
      return (((MimeObjectClass*)(&MIME_SUPERCLASS))
                  ->parse_line(line, length, obj));
    }
  }

  if (mix->headerState <=
      MimeMultipartMixed::expectingMoreHeadersOrEndOfHeaders) {
    if (mix->headerState ==
        MimeMultipartMixed::expectingSigContinueOrOtherHeader) {
      // Concat following indented lines. Flush sig on other lines.
      if (startsWithWhitespace(line, length)) {
        nsCString tmp(line, length);
        tmp.Trim(" \t\r\n");
        mix->cpp->currentSig.Append(tmp);
        // Keep in current state to potentially process additional lines
      } else {
        // Flush sig
        mix->cpp->sigs.AppendElement(mix->cpp->currentSig);
        mix->cpp->currentSig.Truncate();

        // Move the state back to allow processing further Sig headers
        // or a non-Sig header. Fall through and check below what kind
        // of line we are processing.
        mix->headerState = MimeMultipartMixed::expectingSigOrOtherHeader;
      }
    }

    if (mix->headerState == MimeMultipartMixed::expectingSigOrOtherHeader) {
      bool isSigLine = (PL_strncasecmp(line, "Sig:", 4) == 0);

      if (isSigLine) {
        mix->cpp->currentSig = line + 4;
        mix->cpp->currentSig.Trim(" \r\n");
        mix->headerState =
            MimeMultipartMixed::expectingSigContinueOrOtherHeader;
      } else {
        // Fall through and continue to check what kind of line we have
        mix->headerState =
            MimeMultipartMixed::expectingMoreHeadersOrEndOfHeaders;
      }
    }
  }

  if (mix->headerState ==
      MimeMultipartMixed::expectingMoreHeadersOrEndOfHeaders) {
    status = writeLineBufCRLF(mix->payload, line, length);
    if (status < 0) {
      return status;
    }

    return (
        ((MimeObjectClass*)(&MIME_SUPERCLASS))->parse_line(line, length, obj));
  }

  if (mix->headerState == MimeMultipartMixed::expectingBodyLinesOrBoundary) {
    if (isEmptyLine(line, length)) {
      ++mix->postponedCRLFCounter;
    } else {
      if (mix->postponedCRLFCounter) {
        status = flushPostponedCRLF(mix);
        if (status < 0) {
          return status;
        }
      }

      status = writeLineBufCRLF(mix->payload, line, length);
      if (status < 0) {
        return status;
      }
    }
  }

  // example: MimeMultipartSigned_parse_line
  return (
      ((MimeObjectClass*)(&MIME_SUPERCLASS))->parse_line(line, length, obj));
}

static int MimeMultipartMixed_create_child(MimeObject* obj) {
  MimeMultipartMixed* mix = (MimeMultipartMixed*)obj;
  if (mix->cpp->isTopPart == Some(true)) {
    ++mix->childCounter;
  }
  return (((MimeMultipartClass*)(&MIME_SUPERCLASS))->create_child(obj));
}

static int MimeMultipartMixed_close_child(MimeObject* obj) {
  return (((MimeMultipartClass*)(&MIME_SUPERCLASS))->close_child(obj));
}

#undef MIME_SUPERCLASS
