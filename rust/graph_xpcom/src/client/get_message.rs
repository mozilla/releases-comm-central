/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ms_graph_tb::paths::me::messages;
use protocol_shared::{
    authentication::credentials::AuthenticationProvider, client::DoOperation,
    safe_xpcom::SafeEwsMessageFetchListener,
};
use url::Url;
use xpcom::RefCounted;

struct DoGetMessage<'a> {
    listener: &'a SafeEwsMessageFetchListener,
    message_id: String,
    endpoint: &'a Url,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoGetMessage<'_>
{
    const NAME: &'static str = "get message";

    type Okay = ();

    type Listener = SafeEwsMessageFetchListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let endpoint = self.endpoint.to_string();
        let request = messages::message_id::value::Get::new(endpoint, self.message_id.clone());

        self.listener.on_fetch_start()?;

        let response = client.send_request(request).await?;

        self.listener.on_fetched_data_available(response.body())?;

        Ok(())
    }

    fn into_success_arg(
        self,
        _ok: Self::Okay,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnSuccessArg {
    }

    fn into_failure_arg(
        self,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnFailureArg {
    }
}

use crate::{client::XpComGraphClient, error::XpComGraphError};

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    pub async fn get_message(self, listener: SafeEwsMessageFetchListener, message_id: String) {
        let operation = DoGetMessage {
            listener: &listener,
            message_id,
            endpoint: &self.endpoint,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
