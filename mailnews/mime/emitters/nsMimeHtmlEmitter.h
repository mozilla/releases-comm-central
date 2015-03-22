/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef _nsMimeHtmlEmitter_h_
#define _nsMimeHtmlEmitter_h_

#include "mozilla/Attributes.h"
#include "prio.h"
#include "nsMimeBaseEmitter.h"
#include "nsMimeRebuffer.h"
#include "nsIStreamListener.h"
#include "nsIOutputStream.h"
#include "nsIInputStream.h"
#include "nsIURI.h"
#include "nsIChannel.h"
#include "nsIMimeMiscStatus.h"
#include "nsIMimeConverter.h"

class nsMimeHtmlDisplayEmitter : public nsMimeBaseEmitter {
public:
    nsMimeHtmlDisplayEmitter ();
    nsresult Init();

    virtual       ~nsMimeHtmlDisplayEmitter (void);

    // Header handling routines.
    NS_IMETHOD    EndHeader(const nsACString &name) override;

    // Attachment handling routines
    NS_IMETHOD    StartAttachment(const nsACString &name,
                                  const char *contentType, const char *url,
                                  bool aIsExternalAttachment) override;
    NS_IMETHOD    AddAttachmentField(const char *field, const char *value) override;
    NS_IMETHOD    EndAttachment() override;
    NS_IMETHOD    EndAllAttachments() override;

    // Body handling routines
    NS_IMETHOD    WriteBody(const nsACString &buf, uint32_t *amountWritten) override;
    NS_IMETHOD    EndBody() override;
    NS_IMETHOD    WriteHTMLHeaders(const nsACString &name) override;

    virtual nsresult    WriteHeaderFieldHTMLPrefix(const nsACString &name
                                                   ) override;
    virtual nsresult    WriteHeaderFieldHTML(const char *field,
                                             const char *value) override;
    virtual nsresult    WriteHeaderFieldHTMLPostfix() override;

protected:
    bool          mFirst;  // Attachment flag...
    bool          mSkipAttachment;  // attachments we shouldn't show...

    nsCOMPtr<nsIMsgHeaderSink> mHeaderSink;

    nsresult GetHeaderSink(nsIMsgHeaderSink ** aHeaderSink);
    bool BroadCastHeadersAndAttachments();
    nsresult StartAttachmentInBody(const nsACString &name,
                                   const char *contentType, const char *url);

    nsresult BroadcastHeaders(nsIMsgHeaderSink * aHeaderSink, int32_t aHeaderMode, bool aFromNewsgroup);
};


#endif /* _nsMimeHtmlEmitter_h_ */
