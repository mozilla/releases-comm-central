/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::Deserialize;
use xml_struct::XmlSerialize;

use crate::{
    prepare_request,
    types::{
        folders::{BaseFolderId, FolderShape, Folders},
        soap::response,
        BaseShape, ResponseClass, ResponseMessages,
    },
    CustomError, EwsClient, OperationRequest, OperationResponse, ResponseMessageContents,
};

pub async fn get_folder<C, E>(
    client: &C,
    ids: Vec<BaseFolderId>,
) -> Result<Vec<GetFolderResponseMessage>, E>
where
    C: EwsClient<Error = E>,
    E: CustomError,
{
    let body = prepare_request(OperationRequest::GetFolder(GetFolder {
        folder_shape: FolderShape {
            base_shape: BaseShape::AllProperties,
        },
        folder_ids: ids,
    }))?;

    let response_body = client.make_request(&body).await?;

    let response: response::Envelope = quick_xml::de::from_str(&response_body).map_err(|err| {
        eprintln!("deserialize err {err}");
        E::make_custom("Unable to deserialize GetFolder response")
    })?;

    match response.body.response {
        OperationResponse::GetFolderResponse(response) => Ok(response
            .response_messages
            .contents
            .into_iter()
            .map(|message| match message {
                ResponseMessageContents::GetFolderResponseMessage(message) => Ok(message),

                _ => Err(E::make_custom("Unexpected response message")),
            })
            .collect::<Result<Vec<GetFolderResponseMessage>, _>>()?),

        _ => Err(E::make_custom("error")),
    }
}

#[derive(Debug, XmlSerialize)]
pub struct GetFolder {
    pub folder_shape: FolderShape,
    pub folder_ids: Vec<BaseFolderId>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetFolderResponse {
    pub response_messages: ResponseMessages,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct GetFolderResponseMessage {
    #[serde(rename = "@ResponseClass")]
    pub response_class: ResponseClass,
    pub folders: Folders,
}
