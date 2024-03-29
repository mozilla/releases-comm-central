/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    prepare_request,
    types::{
        folders::{BaseFolderId, Folder, FolderId, FolderShape},
        soap::response,
        BaseShape, ResponseClass, ResponseMessages,
    },
    CustomError, EwsClient, OperationRequest, OperationResponse, ResponseMessageContents,
};

pub async fn sync_folder_hierarchy<C, E>(
    client: &C,
    sync_folder_id: Option<BaseFolderId>,
    sync_state: Option<String>,
) -> Result<SyncFolderHierarchyResponseMessage, E>
where
    C: EwsClient<Error = E>,
    E: CustomError,
{
    let request = prepare_request(OperationRequest::SyncFolderHierarchy(SyncFolderHierarchy {
        folder_shape: FolderShape {
            base_shape: BaseShape::IdOnly,
        },
        sync_folder_id,
        sync_state,
    }))?;

    let response = {
        let response = client.make_request(&request).await?;
        let response: response::Envelope = quick_xml::de::from_str(&response).map_err(|err| {
            eprintln!("{err:?}");
            E::make_custom("Unable to deserialize response")
        })?;

        response.body.response
    };

    match response {
        OperationResponse::SyncFolderHierarchyResponse(response) => {
            match response.response_messages.contents.into_iter().next() {
                Some(ResponseMessageContents::SyncFolderHierarchyResponseMessage(message)) => {
                    Ok(message)
                }

                _ => Err(E::make_custom("Unexpected response body")),
            }
        }

        _ => Err(E::make_custom("Unexpected response body")),
    }
}

#[derive(Debug, XmlSerialize)]
pub struct SyncFolderHierarchy {
    pub folder_shape: FolderShape,
    pub sync_folder_id: Option<BaseFolderId>,
    pub sync_state: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SyncFolderHierarchyResponse {
    pub response_messages: ResponseMessages,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SyncFolderHierarchyResponseMessage {
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,
    pub sync_state: String,
    pub includes_last_folder_in_range: bool,
    pub changes: Changes,
}

#[derive(Debug, Deserialize)]
pub struct Changes {
    #[serde(default, rename = "$value")]
    pub inner: Vec<Change>,
}

#[derive(Debug, Deserialize)]
pub enum Change {
    Create {
        #[serde(rename = "$value")]
        folder: Folder,
    },
    Update {
        #[serde(rename = "$value")]
        folder: Folder,
    },
    Delete(FolderId),
}
