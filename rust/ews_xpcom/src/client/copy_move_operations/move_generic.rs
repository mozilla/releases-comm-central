/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{Operation, OperationResponse};

use crate::{
    client::{response_into_messages, ServerType, XpComEwsClient, XpComEwsError},
    safe_xpcom::UseLegacyFallback,
};

/// Whether the EWS copy/move operation should be followed by a resync to pick
/// up updated IDs.
pub(crate) enum RequiresResync {
    /// A resync is needed.
    Yes,

    /// A resync is not needed, because either IDs won't change over this
    /// operation, or the server version is recent enough that the server can
    /// provide us with new IDs in the response.
    No,
}

impl From<RequiresResync> for UseLegacyFallback {
    fn from(value: RequiresResync) -> Self {
        match value {
            RequiresResync::Yes => UseLegacyFallback::Yes,
            RequiresResync::No => UseLegacyFallback::No,
        }
    }
}

/// An EWS operation that copies or moves folders or items.
pub(crate) trait CopyMoveOperation: Operation + Clone {
    /// Pushes a new copy/move operation with the given parameters to the back
    /// of the client's queue and waits for a response.
    ///
    /// The success return value is the operation's response, as well as an
    /// indication of whether a resync is needed to pick up the new IDs of the
    /// copied/moved elements.
    async fn queue_operation<ServerT: ServerType>(
        client: &XpComEwsClient<ServerT>,
        destination_folder_id: String,
        ids: Vec<String>,
    ) -> Result<(Self::Response, RequiresResync), XpComEwsError>;

    /// Maps from the EWS response object to the collection of EWS IDs for the
    /// moved objects.
    fn response_to_ids(
        response: Vec<<Self::Response as OperationResponse>::Message>,
    ) -> Vec<String>;
}

/// The result of a successful copy or move operation.
pub(crate) struct CopyMoveSuccess {
    pub new_ids: Vec<String>,
    pub requires_resync: RequiresResync,
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
    ServerT: ServerType,
    OperationDataT: CopyMoveOperation,
{
    let (resp, requires_resync) =
        OperationDataT::queue_operation(client, destination_folder_id, ids).await?;

    let messages = response_into_messages(resp)?;
    let new_ids = OperationDataT::response_to_ids(messages);

    Ok(CopyMoveSuccess {
        new_ids,
        requires_resync,
    })
}
