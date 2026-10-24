chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "MEETING_COMMAND" || location.pathname !== "/meeting-import") return;
  const nonce = crypto.randomUUID();
  const receive = event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== "CLASSROOM_EXTENSION_RESPONSE" || event.data.nonce !== nonce) return;
    clearTimeout(timer); window.removeEventListener("message", receive); reply(event.data.result);
  };
  const timer = setTimeout(() => {window.removeEventListener("message",receive);reply({error:"未收到确认，请在 mooodle 连接页面允许本次连接；如刚尝试保存请先查看课堂总结，避免重复存档"});},60000);
  window.addEventListener("message",receive);
  window.postMessage({type:"CLASSROOM_EXTENSION_REQUEST",nonce,action:message.action,date:message.date,sessionId:message.sessionId,text:message.text},location.origin);
  return true;
});
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