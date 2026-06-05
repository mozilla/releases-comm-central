/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ews::{
    BaseItemId, ExtendedFieldURI, ExtendedProperty, Flag, FlagStatus, Message, MessageDisposition,
    Operation, OperationResponse, PathToElement, PropertyType,
    update_item::{
        ConflictResolution, ItemChange, ItemChangeDescription, ItemChangeInner, UpdateItem, Updates,
    },
};
use nsstring::nsCString;
use protocol_shared::{
    client::DoOperation,
    safe_xpcom::{self, SafeEwsSimpleOperationListener, SafeListener, UseLegacyFallback},
};
use thin_vec::ThinVec;

use crate::{
    client::{ServerType, XpComEwsClient, process_response_message_class},
    error::XpComEwsError,
};

struct DoChangeFlagStatus<'a> {
    listener: &'a SafeEwsSimpleOperationListener,
    message_ids: ThinVec<nsCString>,
    is_flagged: bool,
}

impl<ServerT: ServerType> DoOperation<XpComEwsClient<ServerT>, XpComEwsError>
    for DoChangeFlagStatus<'_>
{
    const NAME: &'static str = "change flag status";
    type Okay = ();
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, crate::error::XpComEwsError> {
        let flag = if self.is_flagged {
            Some(Flag {
                flag_status: Some(FlagStatus::Flagged),
                start_date: None,
                due_date: None,
                complete_date: None,
            })
        } else {
            Some(Flag {
                flag_status: Some(FlagStatus::NotFlagged),
                start_date: None,
                due_date: None,
                complete_date: None,
            })
        };

        // We need to set the PidTagFlagStatus property on the message,
        // which is documented in the MS-OXOFLAG standard at
        // https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxoflag/eda9fd25-6407-4cec-9e62-26e4f9d6a098
        //
        // We set unflagged messages to zero so they are not marked as complete.
        //
        // Note: The `0` value is not a documented behavior. The documentation
        // indicates that this setting is either 1, for completed, or 2, for
        // flagged. Setting to 0 appears to reset the item to a completely
        // unflagged state.
        let pid_tag_flag_status_value = match flag {
            Some(Flag {
                flag_status: Some(FlagStatus::Flagged),
                ..
            }) => "2".to_string(),
            _ => "0".to_string(),
        };

        let item_changes: Vec<ItemChange> = self
            .message_ids
            .clone()
            .into_iter()
            .map(|message_id| {
                let updates = Updates {
                    inner: vec![
                        ItemChangeDescription::SetItemField {
                            field_uri: PathToElement::FieldURI {
                                field_URI: "item:Flag".to_string(),
                            },
                            message: Message {
                                flag: flag.clone(),
                                ..Default::default()
                            },
                        },
                        // Flag status is the PidTagFlagStatus from MX-OXPROPS,
                        // the standard Exchange property master list.
                        //
                        // See https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxprops/45ab141b-cec3-45cd-bcd4-8023c97b7b4a
                        //
                        // We have to identify it by the property tag, otherwise
                        // the status does not apply on the server side.
                        // According to the above referenced document, the
                        // property tag ID is 0x1090, which is 4240 in base 10.
                        make_extended_property_change_description_by_tag(
                            "4240".to_string(),
                            PropertyType::Integer,
                            pid_tag_flag_status_value.clone(),
                        ),
                    ],
                };

                ItemChange {
                    item_change: ItemChangeInner {
                        item_id: BaseItemId::ItemId {
                            id: message_id.to_string(),
                            // TODO: We should be able to get the change key from the
                            // database or server, but we don't have a way to do that yet.
                            change_key: None,
                        },
                        updates,
                    },
                }
            })
            .collect();

        let update_item = UpdateItem {
            item_changes,
            message_disposition: MessageDisposition::SaveOnly,
            // If we don't provide a ChangeKey as part of the ItemChange, then
            // we cannot use the default value of `AutoResolve` for
            // `ConflictResolution`. Instead, we will use `AlwaysOverwrite` for now.
            conflict_resolution: Some(ConflictResolution::AlwaysOverwrite),
        };

        let response = client.make_update_item_request(update_item).await?;
        let response_messages = response.into_response_messages();

        let (successes, errors): (Vec<_>, Vec<_>) = response_messages
            .into_iter()
            .map(|r| process_response_message_class(UpdateItem::NAME, r))
            .enumerate()
            .partition(|(_index, result)| result.is_ok());

        let successes: ThinVec<nsCString> = successes
            .into_iter()
            .flat_map(|(_, success)| {
                let message = success.expect("partition should only populate this with okays");
                message.items.inner.into_iter()
            })
            .filter_map(|item| item.into_inner_message().item_id)
            .map(|item_id| item_id.id.into())
            .collect();

        let ret = if !successes.is_empty() {
            self.listener
                .on_success((successes, UseLegacyFallback::No).into())
        } else {
            // This branch only happens if no messages were requested,
            // or we're about to return an aggregated error in the next block.
            Ok(())
        };

        // If there were errors, return an aggregated error.
        if !errors.is_empty() {
            let num_errs = errors.len();
            let (index, ref first_err) = errors[0];
            let first_error = first_err
                .as_ref()
                .expect_err("partition should only populate this with errs");
            return Err(XpComEwsError::Processing {
                message: format!(
                    "response contained {num_errs} errors; the first error (at index {index}) was: {first_error:?}"
                ),
            });
        }

        Ok(ret?)
    }

    fn into_success_arg(
        self,
        _ok: Self::Okay,
    ) -> <Self::Listener as safe_xpcom::SafeListener>::OnSuccessArg {
        // this isn't actually used in this case
        (std::iter::empty::<String>(), UseLegacyFallback::No).into()
    }

    fn into_failure_arg(self) -> <Self::Listener as safe_xpcom::SafeListener>::OnFailureArg {}
}

impl<ServerT: ServerType> XpComEwsClient<ServerT> {
    /// Mark a message as flagged or not flagged by performing an [`UpdateItem` operation] via EWS.
    ///
    /// [`UpdateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem-operation
    pub async fn change_flag_status(
        self: Arc<XpComEwsClient<ServerT>>,
        listener: SafeEwsSimpleOperationListener,
        message_ids: ThinVec<nsCString>,
        is_flagged: bool,
    ) {
        let operation = DoChangeFlagStatus {
            listener: &listener,
            message_ids,
            is_flagged,
        };
        operation.handle_operation(&self, &listener).await;
    }
}

fn make_extended_property_change_description_by_tag(
    property_tag: String,
    property_type: PropertyType,
    value: String,
) -> ItemChangeDescription {
    ItemChangeDescription::SetItemField {
        field_uri: PathToElement::ExtendedFieldURI {
            distinguished_property_set_id: None,
            property_set_id: None,
            property_tag: Some(property_tag.clone()),
            property_name: None,
            property_id: None,
            property_type: PropertyType::Integer,
        },
        message: Message {
            extended_property: Some(vec![ExtendedProperty {
                extended_field_URI: ExtendedFieldURI {
                    distinguished_property_set_id: None,
                    property_set_id: None,
                    property_tag: Some(property_tag),
                    property_name: None,
                    property_id: None,
                    property_type: Some(property_type),
                },
                value,
            }]),
            ..Default::default()
        },
    }
}
