/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{notnull, paths::me::calendars};
use protocol_shared::{
    ServerType, client::DoOperation, safe_xpcom::event_listener::SafeGraphCalendarEventListener,
};

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoSyncCalendarItems<'a> {
    pub listener: &'a SafeGraphCalendarEventListener,
    pub calendar_id: String,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoSyncCalendarItems<'_>
{
    const NAME: &'static str = "sync calendar";
    type Okay = ();
    type Listener = SafeGraphCalendarEventListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        // TODO: https://bugzilla.mozilla.org/show_bug.cgi?id=2058691
        // Right now, we are just listing events. This needs to be a delta
        // request with a sync token so we can incrementally sync events.
        // However, it's not clear whether graph supports per-calendar delta
        // requests. See the referenced issue.
        let base_url = client.base_api_url()?;

        let request = calendars::calendar_id::events::Get::new(
            base_url.to_string(),
            self.calendar_id.clone(),
        );
        let response = client
            .send_request_json_response(request, Default::default())
            .await?;

        let events = response.response;

        for event in events.value.ok_or(XpComGraphError::Processing {
            message: "Failed to get event list.".to_string(),
        })? {
            let id = event
                .outlook_item
                .entity
                .id
                .ok_or(XpComGraphError::Processing {
                    message: "Event ID is not present.".to_string(),
                })?;
            let title = match event.subject {
                notnull!(title) => title,
                _ => String::new(),
            };

            let start_date_time = event.start.and_then(|start| start.date_time).ok_or(
                XpComGraphError::Processing {
                    message: "Event start time not present.".to_string(),
                },
            )?;
            let end_date_time =
                event
                    .end
                    .and_then(|end| end.date_time)
                    .ok_or(XpComGraphError::Processing {
                        message: "Event end time not present.".to_string(),
                    })?;

            self.listener
                .on_event_present(id, title, start_date_time, end_date_time);
        }

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    pub(crate) async fn sync_calendar_items(
        self: Arc<XpComGraphClient<ServerT>>,
        listener: SafeGraphCalendarEventListener,
        calendar_id: String,
    ) {
        let operation = DoSyncCalendarItems {
            listener: &listener,
            calendar_id,
        };

        operation.handle_operation(&self, &listener).await;
    }
}
