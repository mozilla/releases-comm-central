/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionError } = ExtensionUtils;

/**
 * Represents (in the child extension process) an attachment in a compose
 * window. This is wrapped around an attachment object from the parent process
 * in order to provide the getFile function, which lazily returns the content
 * of the attachment.
 *
 * @param {ExtensionPageContextChild} context
 *     The extension context which has registered the compose script.
 * @param {object} attachment
 *     The object provided by the parent extension process.
 */
class ComposeAttachment {
  constructor(context, attachment) {
    this.context = context;
    this.attachment = attachment;
  }

  getFile() {
    return this.context.childManager.callParentAsyncFunction(
      "compose.getFile",
      [this.attachment.id]
    );
  }

  api() {
    return {
      id: this.attachment.id,
      name: this.attachment.name,
      size: this.attachment.size,
      getFile: () => {
        return this.context.wrapPromise(this.getFile());
      },
    };
  }
}

this.compose = class extends ExtensionAPI {
  getAPI(context) {
    return {
      compose: {
        onAttachmentAdded: new EventManager({
          context,
          name: "compose.onAttachmentAdded",
          register(fire) {
            let listener = (tab, attachment) => {
              // We use the "without clone" version of this function since the
              // ComposeAttachment argument has a function we need to clone,
              // and the normal version clones without functions, throwing an
              // error. This means we have to clone the arguments ourselves.
              fire.asyncWithoutClone(
                Cu.cloneInto(tab, context.cloneScope),
                Cu.cloneInto(
                  new ComposeAttachment(context, attachment).api(),
                  context.cloneScope,
                  { cloneFunctions: true }
                )
              );
            };

            let event = context.childManager.getParentEvent(
              "compose.onAttachmentAdded"
            );
            event.addListener(listener);
            return () => {
              event.removeListener(listener);
            };
          },
        }).api(),
        listAttachments(tabId) {
          return context.cloneScope.Promise.resolve().then(async () => {
            let attachments = await context.childManager.callParentAsyncFunction(
              "compose.listAttachments",
              [tabId]
            );

            return Cu.cloneInto(
              attachments.map(a => new ComposeAttachment(context, a).api()),
              context.cloneScope,
              { cloneFunctions: true }
            );
          });
        },
        addAttachment(tabId, data) {
          return context.cloneScope.Promise.resolve().then(async () => {
            let attachment = await context.childManager.callParentAsyncFunction(
              "compose.addAttachment",
              [tabId, data]
            );

            return Cu.cloneInto(
              new ComposeAttachment(context, attachment).api(),
              context.cloneScope,
              { cloneFunctions: true }
            );
          });
        },
        updateAttachment(tabId, attachmentId, data) {
          return context.cloneScope.Promise.resolve().then(async () => {
            let attachment = await context.childManager.callParentAsyncFunction(
              "compose.updateAttachment",
              [tabId, attachmentId, data]
            );

            return Cu.cloneInto(
              new ComposeAttachment(context, attachment).api(),
              context.cloneScope,
              { cloneFunctions: true }
            );
          });
        },
      },
    };
  }
};
