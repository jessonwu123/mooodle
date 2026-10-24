const notes = document.getElementById("notes");
const status = document.getElementById("status");
const stage = document.getElementById("stage");
const key = "classroomMeetingDraft";
const update = () => { stage.disabled = !notes.value.trim(); };
notes.addEventListener("input", update);
chrome.storage.local.get(key).then((data) => {
  const draft = data[key];
  if (draft && Date.now() - draft.createdAt < 86400000) notes.value = draft.text;
  else chrome.storage.local.remove(key);
  update();
});
document.getElementById("read").addEventListener("click", async () => {
  try {
    notes.value = await navigator.clipboard.readText();
    status.textContent = notes.value.trim() ? "请核对这确实是本节课的完整纪要，再准备存档。" : "剪贴板为空，请先点击腾讯会议的复制按钮。";
    update();
  } catch { status.textContent = "无法读取剪贴板，请直接粘贴到上方预览框。"; }
});
stage.addEventListener("click", async () => {
  const text = notes.value.trim();
  if (!text || text.length > 100000) { status.textContent = "纪要为空或过长，请检查内容。"; return; }
  await chrome.storage.local.set({ [key]: { text, createdAt: Date.now() } });
  status.textContent = "已准备；请到对应学生课节的课堂评分中导入并保存。";
});
document.getElementById("open").addEventListener("click", () => chrome.tabs.create({ url: "https://mooodle.lovable.app" }));
document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(key); notes.value = ""; update(); status.textContent = "本机纪要已清除。";
});