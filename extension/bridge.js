window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = event.data;
  if (message?.type !== "CLASSROOM_REQUEST_MEETING_DRAFT" || typeof message.nonce !== "string") return;
  try {
    const data = await chrome.storage.local.get("classroomMeetingDraft");
    const draft = data.classroomMeetingDraft;
    const valid = draft && typeof draft.text === "string" && draft.text.length <= 100000 && Number.isFinite(draft.createdAt) && Date.now() - draft.createdAt >= 0 && Date.now() - draft.createdAt < 86400000;
    if (!valid) await chrome.storage.local.remove("classroomMeetingDraft");
    window.postMessage({ type: "CLASSROOM_MEETING_DRAFT", nonce: message.nonce, text: valid ? draft.text : "" }, location.origin);
  } catch {
    window.postMessage({ type: "CLASSROOM_MEETING_DRAFT", nonce: message.nonce, text: "", error: "插件已更新或失效，请刷新课堂档案页面。" }, location.origin);
  }
});