/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ews::Operation;
use mailnews_ui_glue::UserInteractiveServer;
use nsstring::{nsACString, nsCString};
use thin_vec::ThinVec;
use xpcom::{RefCounted, RefPtr};

use crate::client::{
    process_error_with_cb_cpp, AuthFailureBehavior, XpComEwsClient, XpComEwsError,
};

/// Trait to adapt varying completion reporting interfaces to a common interface.
pub(super) trait MoveCallbacks<InputDataT> {
    /// Notification called to signal that a move operation has successfully completed.
    ///
    /// The `input_data` parameter will contain the input data to the move
    /// operation and the `new_ids` parameter will contain a list of updated EWS
    /// IDs resulting from the operation, if the operation supported the return
    /// of new IDs, otherwise `new_ids` will be empty.
    fn on_success(
        &self,
        input_data: InputDataT,
        new_ids: ThinVec<nsCString>,
    ) -> Result<(), XpComEwsError>;

    /// Notification called to signal that a move operation completed with an error.
    ///
    /// The error code will be indicated in `error`, and a description (if available)
    /// will be provided in `description`.
    fn on_error(&self, error: u8, description: &nsACString);
}

/// Perform a generic move operation.
///
/// A move operation can apply to multiple EWS types, including EWS items
/// (messages, calendar items, meetings, ...) and EWS folders. This function
/// provides a generic implementation of an EWS move operation with function
/// arguments to provide customizations required for specific EWS types.
///
/// The input data type for the EWS operation is represented by the
/// `OperationDataT` type parameter, and the success/failure callback type is
/// represented by the `CallbacksT` type parameter.
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
pub(super) async fn move_generic<ServerT, OperationDataT, CallbacksT>(
    client: XpComEwsClient<ServerT>,
    destination_folder_id: String,
    ids: Vec<String>,
    operation_builder: fn(&XpComEwsClient<ServerT>, String, Vec<String>) -> OperationDataT,
    response_to_ids: fn(OperationDataT::Response) -> ThinVec<nsCString>,
    callbacks: RefPtr<CallbacksT>,
) where
    ServerT: UserInteractiveServer + RefCounted,
    OperationDataT: Operation + Clone,
    CallbacksT: MoveCallbacks<OperationDataT> + RefCounted,
{
    move_generic_inner(
        &client,
        destination_folder_id,
        ids,
        operation_builder,
        response_to_ids,
        &*callbacks,
    )
    .await
    .unwrap_or_else(process_error_with_cb_cpp(move |error, description| {
        callbacks.on_error(error, &*description);
    }));
}

async fn move_generic_inner<ServerT, OperationDataT, CallbacksT>(
    client: &XpComEwsClient<ServerT>,
    destination_folder_id: String,
    ids: Vec<String>,
    operation_builder: fn(&XpComEwsClient<ServerT>, String, Vec<String>) -> OperationDataT,
    response_to_ids: fn(OperationDataT::Response) -> ThinVec<nsCString>,
    callbacks: &CallbacksT,
) -> Result<(), XpComEwsError>
where
    ServerT: UserInteractiveServer + RefCounted,
    OperationDataT: Operation + Clone,
    CallbacksT: MoveCallbacks<OperationDataT> + RefCounted,
{
    let operation_data = operation_builder(client, destination_folder_id, ids);

    let response = client
        .make_operation_request(operation_data.clone(), AuthFailureBehavior::ReAuth)
        .await?;

    let new_ids = response_to_ids(response);

    callbacks.on_success(operation_data, new_ids)?;

    Ok(())
}
