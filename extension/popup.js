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
let loadRequest = 0;
const loadButton = document.getElementById("load");
const polish = document.getElementById("polish");
const feedbackLanguage = document.getElementById("feedback-language");
const languageKey = "meetingFeedbackLanguage";
const stopPolish = document.getElementById("polish-stop");
const feedback = document.getElementById("feedback");
const useFeedback = document.getElementById("feedback-use");
const copyFeedback = document.getElementById("feedback-copy");
const restoreOriginal = document.getElementById("original-restore");
let polishController;
let originalText = "";
let feedbackReady = false;
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
const update = () => { stage.disabled = !notes.value.trim(); save.disabled = !notes.value.trim() || !select.value || !!polishController; polish.disabled = !notes.value.trim() || !!polishController; feedbackLanguage.disabled = !!polishController; };
const remember = () => chrome.storage.local.set({[key]:{text:notes.value,title:title.value,originalText,feedback:feedback.value,feedbackReady,createdAt:Date.now()}});
const render = () => {
  const ranked = MeetingMatching.rank(title.value,sessions);
  select.replaceChildren(new Option(ranked.length ? `请选择课次（${date.value} · ${ranked.length}节）` : `${date.value} 暂无可存档课次`, ""));
  for (const s of ranked) select.add(new Option(`${s.matchScore ? "匹配 · " : ""}${s.time} ${s.name}（${s.studentName}）${s.ambiguousDay ? " · 同日多课" : ""}`,s.id));
  const matches = ranked.filter(s => s.matchScore > 0);
  if (matches.length === 1) {select.value = matches[0].id;set("已按关键名字匹配，请核对课次后存档。","ok");}
  else set(matches.length ? "存在多个匹配课次，请选择正确课次。" : ranked.length ? "没有唯一名字匹配，请手动选择课次。" : "当天没有关联学生的可存档课次，请调整日期。", matches.length || ranked.length ? "ok" : "");
  update();
};
title.addEventListener("input", () => {if (sessions.length) render();});
date.addEventListener("change", () => {loadSessions();});
select.addEventListener("change",update);
notes.addEventListener("input", update);
chrome.storage.local.get(languageKey).then((data) => { feedbackLanguage.value = data[languageKey] === "en" ? "en" : "zh"; });
feedbackLanguage.addEventListener("change", () => chrome.storage.local.set({ [languageKey]: feedbackLanguage.value }));
chrome.storage.local.get(key).then((data) => {
  const draft = data[key];
  if (draft && Date.now() - draft.createdAt < 86400000) {notes.value = draft.text; title.value = draft.title || "";originalText=draft.originalText || "";feedback.value=draft.feedback || "";feedbackReady=!!draft.feedbackReady;document.getElementById("feedback-box").hidden=!feedback.value;useFeedback.disabled=!feedbackReady;copyFeedback.disabled=!feedbackReady;restoreOriginal.hidden=!originalText;}
  else chrome.storage.local.remove(key);
  update();
});
document.getElementById("read").addEventListener("click", async () => {
  try {
    notes.value = await navigator.clipboard.readText();
    originalText="";restoreOriginal.hidden=true;
    set(notes.value.trim() ? "请核对这确实是本节课的完整纪要，再准备存档。" : "剪贴板为空，请先点击腾讯会议的复制按钮。", notes.value.trim() ? "ok" : "err");
    update();
    await remember();
  } catch { set("无法读取剪贴板，请直接粘贴到上方预览框。", "err"); }
});
stage.addEventListener("click", async () => {
  const text = notes.value.trim();
  if (!text || text.length > 100000) { set("纪要为空或过长，请检查内容。", "err"); return; }
  await remember();
  set("已准备；请到对应学生课节的课堂评分中导入并保存。", "ok");
});
const loadSessions = async (successNote = "") => {
  const request = ++loadRequest;
  const selectedDate = date.value;
  sessions=[];select.replaceChildren(new Option("读取中…", ""));update();
  loadButton.disabled=true;loadButton.textContent="读取课次中…";
  set(`${successNote}正在读取 ${selectedDate} 的课次…`);
  try {
    const result = await sendToApp({action:"list",date:selectedDate});
    if (request !== loadRequest) return;
    if (result.error) throw new Error(result.error);
    if (!Array.isArray(result.sessions)) throw new Error("课表返回格式异常，请更新网站后重试");
    sessions = result.sessions;
    notice = successNote;
    summary.textContent = `已登录 · mooodle 账号：${acct.value.trim() || "已保存的账号"}`;
    render();
    notice = "";
  } catch (error) {
    if (request !== loadRequest) return;
    notice = "";select.replaceChildren(new Option("读取失败，请重新匹配", ""));
    set(`${successNote}${error.message || "读取失败"}`, "err");
  } finally {
    if (request === loadRequest) { loadButton.disabled=false;loadButton.textContent="匹配所选日期课次";update(); }
  }
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
const itemsBox = document.getElementById("items");
const addItem = () => { const row=document.createElement("div");row.className="item";row.innerHTML='<input placeholder="知识点名称" maxlength="100"><input type="number" min="0" max="100" value="80"><span>%</span><button type="button">×</button>';row.querySelector("button").onclick=()=>row.remove();itemsBox.append(row); };
document.getElementById("add-item").addEventListener("click", addItem);
const collectRating = () => {
  const r = {};
  for (const k of ["focus","interaction","discipline","accuracy","overall"]) { const v=document.getElementById(`r-${k}`).value; if (v) r[k]=Number(v); }
  const p=document.getElementById("r-progress").value; if (p!=="") r.overallProgress=Number(p);
  r.items=[...itemsBox.querySelectorAll(".item")].map(row=>{const [n,v]=row.querySelectorAll("input");return {item_name:n.value.trim(),percentage:Number(v.value||80)};}).filter(i=>i.item_name);
  return r;
};
const resetRating = () => { for (const k of ["focus","interaction","discipline","accuracy","overall"]) document.getElementById(`r-${k}`).value=""; document.getElementById("r-progress").value=""; itemsBox.replaceChildren(); };
save.addEventListener("click", async () => {
  if (!select.value || !notes.value.trim() || notes.value.length>100000) return;
  const lesson=sessions.find(s=>s.id===select.value);
  if (lesson?.ambiguousDay) {set("同一学生当天有多节课，请先到学生档案手动确认；当前评分按学生和日期保存，不能独立存档。","err");return;}
  if (!confirm(`将纪要追加到 ${lesson.date} ${lesson.time} · ${lesson.name}（${lesson.studentName}）的课堂总结？${Object.keys(collectRating()).length>1||collectRating().items.length?"填写的评分和授课进度会同步到 mooodle。":"未填写评分，已有评分保持不变。"}`)) return;
  await remember();save.disabled=true;set("存档中…");
  try {const result=await sendToApp({action:"save",date:date.value,sessionId:select.value,text:notes.value.trim(),rating:collectRating()});if(!result.error)resetRating();set(result.error || result.message || "已提交，请到学生档案核对", result.error ? "err" : "ok");}
  catch {set("未收到确认，请先查看课堂总结，避免重复存档。","err");}
  finally {update();}
});
document.getElementById("clear").addEventListener("click", async () => {
  polishController?.abort();await chrome.storage.local.remove(key); notes.value = "";feedback.value="";originalText="";feedbackReady=false;document.getElementById("feedback-box").hidden=true;restoreOriginal.hidden=true;update(); set("本机纪要已清除。","ok");
});
polish.addEventListener("click", async () => {
  const text=notes.value.trim();
  const language=feedbackLanguage.value;
  if(!text || text.length>100000){set("请粘贴完整纪要，最多100000字。","err");return;}
  const controller=new AbortController();polishController=controller;update();stopPolish.hidden=false;
  feedbackReady=false;useFeedback.disabled=true;copyFeedback.disabled=true;feedback.value="";document.getElementById("feedback-box").hidden=false;
  set("正在生成课堂反馈…原纪要保持不变。");
  try {
    await remember();
    const auth=await sendToApp({action:"ai-token"});
    if(auth.error || !auth.accessToken)throw new Error(auth.error || "请先登录教师账号");
    const res=await fetch("https://mooodle.lovable.app/api/public/meeting-polish",{method:"POST",headers:{Authorization:`Bearer ${auth.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({text,language}),signal:controller.signal});
    if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error || `生成失败（${res.status}），请确认网站已发布更新`);}
    if(!res.body || !res.headers.get("content-type")?.includes("application/x-ndjson"))throw new Error("网站未返回生成结果，请确认已发布最新更新");
    const reader=res.body.getReader(),decoder=new TextDecoder();let buffer="",done=false;
    const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==="error")throw new Error(event.message);if(event.type==="text")feedback.value+=event.text;if(event.type==="done")done=true;};
    while(true){const chunk=await reader.read();buffer+=decoder.decode(chunk.value,{stream:!chunk.done});const lines=buffer.split("\n");buffer=lines.pop() || "";for(const line of lines)consume(line);if(chunk.done)break;}
    consume(buffer);if(!done || !feedback.value.trim())throw new Error("生成未完成，原纪要已保留，请勿使用不完整反馈");
    feedbackReady=true;useFeedback.disabled=false;copyFeedback.disabled=false;await remember();set("课堂反馈已生成，请核对后使用或复制；尚未存档。","ok");
  }catch(error){set(error.name==="AbortError" ? "生成已停止，原纪要已保留。" : error.message || "生成失败，原纪要已保留。","err");}
  finally{polishController=undefined;stopPolish.hidden=true;update();}
});
stopPolish.addEventListener("click",()=>polishController?.abort());
window.addEventListener("pagehide",()=>polishController?.abort());
useFeedback.addEventListener("click",async()=>{if(!feedbackReady || !feedback.value.trim())return;if(notes.value!==feedback.value)originalText=notes.value;notes.value=feedback.value;restoreOriginal.hidden=false;update();await remember();set("已使用课堂反馈，原纪要已保留；存档仍需确认。","ok");});
copyFeedback.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(feedback.value);set("课堂反馈已复制。","ok");}catch{set("复制失败，请在反馈框内手动复制。","err");}});
restoreOriginal.addEventListener("click",async()=>{if(!originalText)return;notes.value=originalText;update();await remember();set("已恢复原纪要。","ok");});
