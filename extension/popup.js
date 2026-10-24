const notes = document.getElementById("notes");
const status = document.getElementById("status");
const stage = document.getElementById("stage");
const key = "classroomMeetingDraft";
const title = document.getElementById("title");
const date = document.getElementById("date");
const select = document.getElementById("session");
const save = document.getElementById("save");
const acct = document.getElementById("acct");
const pwd = document.getElementById("pwd");
const box = document.getElementById("acct-box");
const summary = document.getElementById("acct-summary");
let sessions = [];
let notice = "";
const set = (msg, cls = "") => { status.textContent = notice ? `${notice}${msg}` : msg; status.className = cls; };
const loginNote = (msg) => `${(msg || "登录成功，已连接 mooodle").trim().replace(/。$/, "")}。`;
const sendToApp = async (message) => {
  let timer;
  try {
    const result = await Promise.race([
      chrome.runtime.sendMessage({ type: "MEETING_APP", ...message }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("连接超时，请检查网络后重试")), 20000); }),
    ]);
    if (!result || typeof result !== "object") throw new Error("插件未收到响应，请到扩展管理页面重新加载插件后重试");
    return result;
  } finally { clearTimeout(timer); }
};
date.value = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const update = () => { stage.disabled = !notes.value.trim(); save.disabled = !notes.value.trim() || !select.value; };
const remember = () => chrome.storage.local.set({[key]:{text:notes.value,title:title.value,createdAt:Date.now()}});
const render = () => {
  const ranked = MeetingMatching.rank(title.value,sessions);
  select.replaceChildren(new Option("请选择课次", ""));
  for (const s of ranked) select.add(new Option(`${s.matchScore ? "匹配 · " : ""}${s.time} ${s.name}（${s.studentName}）${s.ambiguousDay ? " · 同日多课" : ""}`,s.id));
  const matches = ranked.filter(s => s.matchScore > 0);
  if (matches.length === 1) {select.value = matches[0].id;set("已按关键名字匹配，请核对课次后存档。","ok");}
  else set(matches.length ? "存在多个匹配课次，请选择正确课次。" : ranked.length ? "没有唯一名字匹配，请手动选择课次。" : "当天没有关联学生的可存档课次，请调整日期。", matches.length || ranked.length ? "ok" : "");
  update();
};
title.addEventListener("input", () => {if (sessions.length) render();});
date.addEventListener("change", () => {sessions=[];select.replaceChildren(new Option("读取中…", ""));update();loadSessions();});
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
    set(notes.value.trim() ? "请核对这确实是本节课的完整纪要，再准备存档。" : "剪贴板为空，请先点击腾讯会议的复制按钮。", notes.value.trim() ? "ok" : "err");
    update();
    await remember();
  } catch { set("无法读取剪贴板，请直接粘贴到上方预览框。", "err"); }
});
stage.addEventListener("click", async () => {
  const text = notes.value.trim();
  if (!text || text.length > 100000) { set("纪要为空或过长，请检查内容。", "err"); return; }
  await chrome.storage.local.set({ [key]: { text, createdAt: Date.now() } });
  set("已准备；请到对应学生课节的课堂评分中导入并保存。", "ok");
});
const loadSessions = async (successNote = "") => {
  set("读取当日课表中…");
  try {
    const result = await sendToApp({action:"list",date:date.value});
    if (result.error) throw new Error(result.error);
    sessions = result.sessions || [];
    notice = successNote;
    summary.textContent = `已登录 · mooodle 账号：${acct.value.trim() || "已保存的账号"}`;
    render();
    notice = "";
  } catch (error) { notice = ""; set(error.message || "读取失败", "err"); }
};
document.getElementById("load").addEventListener("click", async () => {await remember();await loadSessions();});
chrome.storage.local.get("mooodleAccount").then(({mooodleAccount}) => {
  if (mooodleAccount?.account) {acct.value=mooodleAccount.account;summary.textContent=`mooodle 账号：${mooodleAccount.account}`;loadSessions(loginNote("已自动登录 mooodle"));}
  else box.open=true;
});
document.getElementById("acct-save").addEventListener("click", async () => {
  if (!acct.value.trim() || !pwd.value) {set("请填写账号和密码","err");return;}
  const button = document.getElementById("acct-save");
  button.disabled=true;set("登录中…");
  try {
    await chrome.storage.local.set({mooodleAccount:{account:acct.value.trim(),password:pwd.value}});
    await chrome.storage.local.remove("mooodleToken");
    const r = await sendToApp({action:"login"});
    if (r.error) throw new Error(r.error);
    pwd.value="";box.open=false;summary.textContent=`已登录 · mooodle 账号：${acct.value.trim()}`;
    set(loginNote(r.message),"ok");
    await loadSessions(loginNote(r.message));
  } catch (error) { box.open=true;set(error.message || "登录失败，请重新加载插件后重试","err"); }
  finally {button.disabled=false;}
});
document.getElementById("acct-clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(["mooodleAccount","mooodleToken"]);acct.value="";pwd.value="";summary.textContent="mooodle 账号";box.open=true;sessions=[];select.replaceChildren(new Option("请先登录", ""));update();set("已清除本机保存的账号密码。","ok");
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
    set("已读取页面标题，请核对左上角课堂名称；不准确时可直接修改。","ok");
    await remember();if(sessions.length) render();
  } catch(error) {set(error.message || "无法读取标题，请手动填写课堂关键名字","err");}
});
save.addEventListener("click", async () => {
  if (!select.value || !notes.value.trim() || notes.value.length>100000) return;
  const lesson=sessions.find(s=>s.id===select.value);
  if (lesson?.ambiguousDay) {set("同一学生当天有多节课，请先到学生档案手动确认；当前评分按学生和日期保存，不能独立存档。","err");return;}
  if (!confirm(`将纪要追加到 ${lesson.date} ${lesson.time} · ${lesson.name}（${lesson.studentName}）的课堂总结？不会修改已有评分。`)) return;
  await remember();save.disabled=true;set("存档中…");
  try {const result=await sendToApp({action:"save",date:date.value,sessionId:select.value,text:notes.value.trim()});set(result.error || result.message || "已提交，请到学生档案核对", result.error ? "err" : "ok");}
  catch {set("未收到确认，请先查看课堂总结，避免重复存档。","err");}
  finally {update();}
});
document.getElementById("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove(key); notes.value = ""; update(); set("本机纪要已清除。","ok");
});
