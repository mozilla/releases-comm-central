/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use base64::prelude::{Engine, BASE64_STANDARD};
use ews::{
    create_item::CreateItem, BaseFolderId, ExtendedFieldURI, ExtendedProperty, Message,
    MessageDisposition, MimeContent, Operation, RealItem,
};

use super::{
    create_and_populate_header_from_create_response, DoOperation, ServerType, XpComEwsClient,
    XpComEwsError, MSGFLAG_READ, MSGFLAG_UNMODIFIED, MSGFLAG_UNSENT,
};

use crate::safe_xpcom::SafeEwsMessageCreateListener;

struct DoCreateMessage<'a> {
    pub listener: &'a SafeEwsMessageCreateListener,
    pub folder_id: String,
    pub is_draft: bool,
    pub is_read: bool,
    pub content: Vec<u8>,
}

impl DoOperation for DoCreateMessage<'_> {
    const NAME: &'static str = CreateItem::NAME;
    type Okay = ();
    type Listener = SafeEwsMessageCreateListener;

    async fn do_operation<ServerT: ServerType>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        // Create a new message from the binary content we got.
        let mut message = Message {
            mime_content: Some(MimeContent {
                character_set: None,
                content: BASE64_STANDARD.encode(&self.content),
            }),
            is_read: Some(self.is_read),
            ..Default::default()
        };

        // Set the `PR_MESSAGE_FLAGS` MAPI property. If not set, the EWS server
        // uses `MSGFLAG_UNSENT` | `MSGFLAG_UNMODIFIED` as the default value,
        // which is not what we want.
        //
        // See
        // https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagmessageflags-canonical-property
        let mut mapi_flags = MSGFLAG_READ;
        if self.is_draft {
            mapi_flags |= MSGFLAG_UNSENT;
        } else {
            mapi_flags |= MSGFLAG_UNMODIFIED;
        }

        message.extended_property = Some(vec![ExtendedProperty {
            extended_field_URI: ExtendedFieldURI {
                distinguished_property_set_id: None,
                property_set_id: None,
                property_name: None,
                property_id: None,

                // 3591 (0x0E07) is the `PR_MESSAGE_FLAGS` MAPI property.
                property_tag: Some("3591".into()),
                property_type: Some(ews::PropertyType::Integer),
            },
            value: mapi_flags.to_string(),
        }]);

        let create_item = CreateItem {
            items: vec![RealItem::Message(message)],
            message_disposition: Some(MessageDisposition::SaveOnly),
            saved_item_folder_id: Some(BaseFolderId::FolderId {
                id: self.folder_id.clone(),
                change_key: None,
            }),
        };

        let response_message = client
            .make_create_item_request(create_item, Default::default())
            .await?;

        let hdr = create_and_populate_header_from_create_response(
            response_message,
            &self.content,
            self.listener,
        )?;

        // Let the listeners know of the local key for the newly created message.
        self.listener.on_new_message_key(&hdr)?;

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}
    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    /// Create a message on the server by performing a [`CreateItem` operation]
    /// via EWS.
    ///
    /// All headers are expected to be included in the provided MIME content.
    ///
    /// [`CreateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    pub async fn create_message(
        self: Arc<XpComEwsClient<ServerT>>,
        folder_id: String,
        is_draft: bool,
        is_read: bool,
        content: Vec<u8>,
        listener: SafeEwsMessageCreateListener,
    ) {
        let operation = DoCreateMessage {
            listener: &listener,
            folder_id,
            is_draft,
            is_read,
            content,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
