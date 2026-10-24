const origins = ["https://mooodle.lovable.app", "https://id-preview--3dd5f5e0-1336-4d26-858d-3ccea85aeb60.lovable.app"];
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message?.type !== "MEETING_APP") return;
  (async () => {
    const tabs = await chrome.tabs.query({});
    let tab = tabs.find(t => t.url && origins.some(origin => t.url === `${origin}/meeting-import` || t.url.startsWith(`${origin}/meeting-import?`)));
    if (!tab?.id) {
      tab = await chrome.tabs.create({url:`${origins[0]}/meeting-import`,active:message.action === "save"});
    }
    if (!tab?.id) return {error:"无法打开 mooodle，请重新连接"};
    let ready = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const result = await chrome.tabs.sendMessage(tab.id,{type:"MEETING_COMMAND",action:"ready"});
        if (result?.ready) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve,500));
    }
    if (!ready) {
      await chrome.tabs.update(tab.id,{active:true});
      return {error:"请确认 mooodle 已登录教师账号且连接未断开，然后返回插件重试；无需手动授权"};
    }
    if (message.action === "save") await chrome.tabs.update(tab.id,{active:true});
    try { return await chrome.tabs.sendMessage(tab.id,{type:"MEETING_COMMAND",action:message.action,date:message.date,sessionId:message.sessionId,text:message.text}); }
    catch { return {error:"连接已中断，请刷新 mooodle 后重试；若刚尝试保存，请先查看课堂总结，避免重复存档；正式网站需先更新发布"}; }
  })().then(reply).catch(() => reply({error:"连接失败，请打开 mooodle 重试"}));
  return true;
});