/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{Operation, OperationResponse};
use mailnews_ui_glue::UserInteractiveServer;
use xpcom::RefCounted;

use crate::authentication::credentials::AuthenticationProvider;
use crate::client::{response_into_messages, XpComEwsClient, XpComEwsError};

/// An EWS operation that copies or moves folders or items.
pub(crate) trait CopyMoveOperation: Operation + Clone {
    /// Whether the consumer should sync the folder or account again after this
    /// operation has completed.
    fn requires_resync(&self) -> bool;

    /// Specifies the mapping from the available input data, including the EWS
    /// client, the destination EWS ID, and the input collection of EWS IDs to
    /// be moved, to the input to the EWS operation.
    fn operation_builder<ServerT>(
        client: &XpComEwsClient<ServerT>,
        destination_folder_id: String,
        ids: Vec<String>,
    ) -> Self
    where
        ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted;

    /// Maps from the EWS response object to the collection of EWS IDs for the
    /// moved objects.
    fn response_to_ids(
        response: Vec<<Self::Response as OperationResponse>::Message>,
    ) -> Vec<String>;
}

/// The result of a successful copy or move operation.
pub(crate) struct CopyMoveSuccess {
    pub new_ids: Vec<String>,
    pub requires_resync: bool,
}

/// Perform a generic copy/move operation.
///
/// A move operation can apply to multiple EWS types, including EWS items
/// (messages, calendar items, meetings, ...) and EWS folders. This function
/// provides a generic implementation of an EWS move operation with function
/// arguments to provide customizations required for specific EWS types.
///
/// The input data type for the EWS operation is represented by the
/// `OperationDataT` type parameter.
///
/// The EWS client to use for the operation is given by the `client` parameter.
/// The `destination_folder_id` parameter specifies the destination folder for
/// the generic move operation, and the `ids` parameter specifies the the
/// collection of EWS IDs to move.
pub(super) async fn move_generic<ServerT, OperationDataT>(
    client: &XpComEwsClient<ServerT>,
    destination_folder_id: String,
    ids: Vec<String>,
) -> Result<CopyMoveSuccess, XpComEwsError>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    OperationDataT: CopyMoveOperation,
{
    let operation_data = OperationDataT::operation_builder(client, destination_folder_id, ids);
    let requires_resync = operation_data.requires_resync();

    let resp = client
        .make_operation_request(operation_data, Default::default())
        .await?;

    let messages = response_into_messages(resp)?;
    let new_ids = OperationDataT::response_to_ids(messages);

    Ok(CopyMoveSuccess {
        new_ids,
        requires_resync,
    })
}
