/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::{Operation, OperationResponse};
use mailnews_ui_glue::UserInteractiveServer;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::{
    interfaces::{IEwsFallibleOperationListener, IEwsSimpleOperationListener},
    RefCounted, RefPtr, XpCom,
};

use crate::authentication::credentials::AuthenticationProvider;
use crate::client::{handle_error, response_into_messages, XpComEwsClient, XpComEwsError};

/// An EWS operation that copies or moves folders or items.
pub(crate) trait CopyMoveOperation: Operation + Clone {
    /// Whether the consumer should sync the folder or account again after this
    /// operation has completed.
    fn requires_resync(&self) -> bool;
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
/// collection of EWS IDs to move. The `operation_builder` function specifies
/// the mapping from the available input data, including the EWS client, the
/// destination EWS ID, and the input collection of EWS IDs to be moved, to the
/// input to the EWS operation. The `response_to_ids` function maps from the EWS
/// response object to the collection of EWS IDs for the moved objects. The
/// `callbacks` parameter provides the asynchronous mechanism for signaling
/// success or failure.
pub(super) async fn move_generic<ServerT, OperationDataT>(
    client: XpComEwsClient<ServerT>,
    listener: RefPtr<IEwsSimpleOperationListener>,
    destination_folder_id: String,
    ids: Vec<String>,
    operation_builder: fn(&XpComEwsClient<ServerT>, String, Vec<String>) -> OperationDataT,
    response_to_ids: fn(
        Vec<<OperationDataT::Response as OperationResponse>::Message>,
    ) -> Vec<String>,
) where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    OperationDataT: CopyMoveOperation,
{
    match move_generic_functional(
        client,
        destination_folder_id,
        ids,
        operation_builder,
        response_to_ids,
    )
    .await
    {
        (_, Ok((new_ids, requires_resync))) => unsafe {
            let converted_new_ids = new_ids
                .iter()
                .map(|id| nsCString::from(id))
                .collect::<ThinVec<nsCString>>();
            listener.OnOperationSuccess(&converted_new_ids, requires_resync);
        },
        (operation_name, Err(err)) => handle_error(
            operation_name,
            err,
            listener.query_interface::<IEwsFallibleOperationListener>(),
        ),
    };
}

/// Perform a generic copy/move operation (functional version).
///
/// The EWS client to use for the operation is given by the `client` parameter.
/// The `destination_folder_id` parameter specifies the destination folder for
/// the generic move operation, and the `ids` parameter specifies the the
/// collection of EWS IDs to move. The `operation_builder` function specifies
/// the mapping from the available input data, including the EWS client, the
/// destination EWS ID, and the input collection of EWS IDs to be moved, to the
/// input to the EWS operation. The `response_to_ids` function maps from the EWS
/// response object to the collection of EWS IDs for the moved objects.
///
/// This version is suitable for use when a larger operation requires item
/// copy or move operations as part of its orchestration.
pub(super) async fn move_generic_functional<ServerT, OperationDataT>(
    client: XpComEwsClient<ServerT>,
    destination_folder_id: String,
    ids: Vec<String>,
    operation_builder: fn(&XpComEwsClient<ServerT>, String, Vec<String>) -> OperationDataT,
    response_to_ids: fn(
        Vec<<OperationDataT::Response as OperationResponse>::Message>,
    ) -> Vec<String>,
) -> (&'static str, Result<(Vec<String>, bool), XpComEwsError>)
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    OperationDataT: CopyMoveOperation,
{
    let operation_data = operation_builder(&client, destination_folder_id, ids);

    (
        operation_data.name(),
        move_generic_inner(client, operation_data.clone())
            .await
            .map(|messages| {
                let new_ids = response_to_ids(messages);
                let requires_resync = operation_data.requires_resync();
                (new_ids, requires_resync)
            }),
    )
}

async fn move_generic_inner<ServerT, OperationDataT>(
    client: XpComEwsClient<ServerT>,
    operation_data: OperationDataT,
) -> Result<
    Vec<<<OperationDataT as Operation>::Response as OperationResponse>::Message>,
    XpComEwsError,
>
where
    ServerT: AuthenticationProvider + UserInteractiveServer + RefCounted,
    OperationDataT: CopyMoveOperation,
{
    let resp = client
        .make_operation_request(operation_data, Default::default())
        .await?;
    let messages = response_into_messages(resp)?;
    Ok(messages)
}
