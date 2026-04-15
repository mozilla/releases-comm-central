/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use base64::prelude::*;
use ews::{
    BaseFolderId, ExtendedFieldURI, ExtendedProperty, Message, MessageDisposition, MimeContent,
    Operation, RealItem, create_item::CreateItem,
};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::SafeEwsMessageCreateListener;

use super::{
    MSGFLAG_READ, MSGFLAG_UNMODIFIED, MSGFLAG_UNSENT, ServerType, XpComEwsClient, XpComEwsError,
};

struct DoCreateMessage {
    pub folder_id: String,
    pub is_draft: bool,
    pub is_read: bool,
    pub content: Vec<u8>,
    new_ews_id: String,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError> for DoCreateMessage {
    const NAME: &'static str = CreateItem::NAME;
    type Okay = ();
    type Listener = SafeEwsMessageCreateListener;

    async fn do_operation(
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
            // TODO: Should we be setting is_draft here too? i.e.
            // is_draft: Some(self.is_draft),
            // See https://bugzilla.mozilla.org/show_bug.cgi?id=2026218
            ..Default::default()
        };

        // Set the `PR_MESSAGE_FLAGS` MAPI property. If not set, the EWS server
        // uses `MSGFLAG_UNSENT` | `MSGFLAG_UNMODIFIED` as the default value,
        // which is not what we want.
        //
        // See
        // https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagmessageflags-canonical-property
        //
        // TODO: Should we set MSGFLAG_READ only if is_read is true? See
        // https://bugzilla.mozilla.org/show_bug.cgi?id=2026218
        let mut mapi_flags = MSGFLAG_READ;
        if self.is_draft {
            mapi_flags |= MSGFLAG_UNSENT;
        } else {
            // TODO: What behaviour does MSGFLAG_UNMODIFIED actually trigger?
            // Why is it not set for drafts? See
            // https://bugzilla.mozilla.org/show_bug.cgi?id=2026218
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

        // Get the ews id of the new message from the response.
        let item = super::single_response_or_error(response_message.items.inner)?;
        let message = item.inner_message();

        self.new_ews_id = message
            .item_id
            .as_ref()
            .ok_or(XpComEwsError::MissingIdInResponse)?
            .id
            .clone();

        // NOTE: we rely on the on_success()/on_failure() call to invoke
        // on_remote_create_finished().
        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> String {
        self.new_ews_id
    }
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
            folder_id,
            is_draft,
            is_read,
            content,
            new_ews_id: String::new(),
        };
        operation.handle_operation(&self, &listener).await;
    }
}
