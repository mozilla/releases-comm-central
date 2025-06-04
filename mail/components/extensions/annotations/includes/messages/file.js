let attachments = await browser.messages.listAttachments(messageId);
for (let att of attachments) {
  let file = await browser.messages.getAttachmentFile(messageId, att.partName);
  let content = await file.text();
}
