/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use base64::prelude::{Engine, BASE64_STANDARD};
use ews::{get_item::GetItem, Operation};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::SafeEwsMessageFetchListener;

use super::{ServerType, XpComEwsClient, XpComEwsError};

struct DoGetMessage<'a> {
    pub listener: &'a SafeEwsMessageFetchListener,
    pub id: String,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError> for DoGetMessage<'_> {
    const NAME: &'static str = GetItem::NAME;
    type Okay = ();
    type Listener = SafeEwsMessageFetchListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        self.listener.on_fetch_start()?;

        let items = client.get_items([self.id.clone()], &[], true).await?;
        if items.len() != 1 {
            return Err(XpComEwsError::Processing {
                message: format!(
                    "provided single ID to GetItem operation, got {} responses",
                    items.len()
                ),
            });
        }

        // Extract the Internet Message Format content of the message from the
        // response. We've guaranteed above that the iteration will produce
        // at least one element, so unwrapping is okay here.
        let item = items.into_iter().next().unwrap();
        let message = item.inner_message();

        let raw_mime = if let Some(raw_mime) = &message.mime_content {
            &raw_mime.content
        } else {
            return Err(XpComEwsError::Processing {
                message: "item has no content".to_string(),
            });
        };

        // EWS returns the content of the email b64encoded on top of any
        // encoding within the message.
        let mime_content =
            BASE64_STANDARD
                .decode(raw_mime)
                .map_err(|_| XpComEwsError::Processing {
                    message: "MIME content for item is not validly base64 encoded".to_string(),
                })?;

        Ok(self.listener.on_fetched_data_available(mime_content)?)
    }

    fn into_success_arg(self, _ok: Self::Okay) {}
    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    pub(crate) async fn get_message(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsMessageFetchListener,
        id: String,
    ) {
        let operation = DoGetMessage {
            listener: &listener,
            id,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
