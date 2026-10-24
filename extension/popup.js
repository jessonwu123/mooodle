const notes = document.getElementById("notes");
const status = document.getElementById("status");
const stage = document.getElementById("stage");
const key = "classroomMeetingDraft";
const title = document.getElementById("title");
const date = document.getElementById("date");
const select = document.getElementById("session");
const save = document.getElementById("save");
let sessions = [];
date.value = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const update = () => { stage.disabled = !notes.value.trim(); save.disabled = !notes.value.trim() || !select.value; };
const remember = () => chrome.storage.local.set({[key]:{text:notes.value,title:title.value,createdAt:Date.now()}});
const render = () => {
  const ranked = MeetingMatching.rank(title.value,sessions);
  select.replaceChildren(new Option("请选择课次", ""));
  for (const s of ranked) select.add(new Option(`${s.matchScore ? "匹配 · " : ""}${s.time} ${s.name}（${s.studentName}）${s.ambiguousDay ? " · 同日多课" : ""}`,s.id));
  const matches = ranked.filter(s => s.matchScore > 0);
  if (matches.length === 1) {select.value = matches[0].id;status.textContent = "已按关键名字匹配，请核对课次后存档。";}
  else status.textContent = matches.length ? "存在多个匹配课次，请选择正确课次。" : ranked.length ? "没有唯一名字匹配，请手动选择课次。" : "当天没有关联学生的可存档课次，请调整日期。";
  update();
};
title.addEventListener("input", () => {if (sessions.length) render();});
date.addEventListener("change", () => {sessions=[];select.replaceChildren(new Option("日期已改变，请重新匹配", ""));update();});
select.addEventListener("change",update);
notes.addEventListener("input", update);
chrome.storage.local.get(key).then((data) => {
  const draft = data[key];
  if (draft && Date.now() - draft.createdAt < 86400000) {notes.value = draft.text; title.value = draft.title || "";}
  else chrome.storage.local.remove(key);
  update();
});
document.getElementById("read").addEventListener("click", async () => {
  try {
    notes.value = await navigator.clipboard.readText();
    status.textContent = notes.value.trim() ? "请核对这确实是本节课的完整纪要，再准备存档。" : "剪贴板为空，请先点击腾讯会议的复制按钮。";
    update();
    await remember();
  } catch { status.textContent = "无法读取剪贴板，请直接粘贴到上方预览框。"; }
});
stage.addEventListener("click", async () => {
  const text = notes.value.trim();
  if (!text || text.length > 100000) { status.textContent = "纪要为空或过长，请检查内容。"; return; }
  await chrome.storage.local.set({ [key]: { text, createdAt: Date.now() } });
  status.textContent = "已准备；请到对应学生课节的课堂评分中导入并保存。";
});
document.getElementById("open").addEventListener("click", async () => { await remember(); await chrome.tabs.create({ url: "https://mooodle.lovable.app/meeting-import" }); });
document.getElementById("load").addEventListener("click", async () => {
  await remember(); status.textContent="读取当日课表中…";
  try {const result=await chrome.runtime.sendMessage({type:"MEETING_APP",action:"list",date:date.value});if(result.error) throw new Error(result.error);sessions=result.sessions || [];render();}
  catch(error) {status.textContent=error.message || "读取失败";}
});
document.getElementById("title-read").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || !tab.url?.startsWith("https://meeting.tencent.com/")) throw new Error("请在腾讯会议录制页面打开插件，再读取标题");
    const results = await chrome.scripting.executeScript({target:{tabId:tab.id},func:() => {
      const candidates = [...document.querySelectorAll("h1,h2,[title],[class*=title],[class*=Title]")].map(el => ({el,rect:el.getBoundingClientRect(),text:(el.getAttribute("title") || el.textContent || "").trim()})).filter(x => x.rect.width>0 && x.rect.height>0 && x.rect.top>=0 && x.rect.top<180 && x.rect.left<500 && x.text.length>=2 && x.text.length<120 && !["腾讯会议","纪要","录制","登录","会议纪要"].includes(x.text)).sort((a,b) => a.rect.top-b.rect.top || a.rect.left-b.rect.left);
      return candidates[0]?.text || document.title.replace(/[-_|｜]\s*腾讯会议.*$/, "").trim();
    }});
    title.value=results[0]?.result || "";
    status.textContent="已读取页面标题，请核对左上角课堂名称；不准确时可直接修改。";
    await remember();if(sessions.length) render();
  } catch(error) {status.textContent=error.message || "无法读取标题，请手动填写课堂关键名字";}
});
save.addEventListener("click", async () => {
  if (!select.value || !notes.value.trim() || notes.value.length>100000) return;
  const lesson=sessions.find(s=>s.id===select.value);
  if (lesson?.ambiguousDay) {status.textContent="同一学生当天有多节课，请先到学生档案手动确认；当前评分按学生和日期保存，不能独立存档。";return;}
  await remember();save.disabled=true;status.textContent="请在 mooodle 页面确认课次并存档…";
  try {const result=await chrome.runtime.sendMessage({type:"MEETING_APP",action:"save",date:date.value,sessionId:select.value,text:notes.value.trim()});status.textContent=result.error || result.message || "请查看 mooodle 页面";}
  catch {status.textContent="未收到确认，请先查看课堂总结，避免重复存档。";}
  finally {update();}
});
document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(key); notes.value = ""; update(); status.textContent = "本机纪要已清除。";
});