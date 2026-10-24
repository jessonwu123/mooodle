const origins = ["https://mooodle.lovable.app", "https://id-preview--3dd5f5e0-1336-4d26-858d-3ccea85aeb60.lovable.app"];
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message?.type !== "MEETING_APP") return;
  (async () => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find(t => t.url && origins.some(origin => t.url === `${origin}/meeting-import` || t.url.startsWith(`${origin}/meeting-import?`)));
    if (!tab?.id) {
      await chrome.tabs.create({url:`${origins[0]}/meeting-import`});
      return {error:"已打开 mooodle 连接页面，请登录并点击允许本次插件连接，然后返回插件重试"};
    }
    if (message.action === "save") await chrome.tabs.update(tab.id,{active:true});
    try { return await chrome.tabs.sendMessage(tab.id,{type:"MEETING_COMMAND",action:message.action,date:message.date,sessionId:message.sessionId,text:message.text}); }
    catch { return {error:"连接页面尚未准备好，请刷新页面并允许本次插件连接；正式网站需先更新发布"}; }
  })().then(reply).catch(() => reply({error:"连接失败，请打开 mooodle 重试"}));
  return true;
});