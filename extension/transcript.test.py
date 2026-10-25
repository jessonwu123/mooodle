import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  await page.route('**/transcript-fixture',lambda route:route.fulfill(content_type='text/html',body='<html><body></body></html>')); await page.goto('http://localhost:8080/transcript-fixture')
  await page.set_content('''<style>#list{height:180px;overflow-y:auto}article{height:60px}</style><div id="list"><div id="space" style="height:1800px;position:relative"><div id="rows"></div></div></div><script>
  const list=document.querySelector('#list'),rows=document.querySelector('#rows');
  function render(){const first=Math.max(0,Math.floor(list.scrollTop/60)-1);rows.style.position='absolute';rows.style.top=(first*60)+'px';rows.innerHTML=Array.from({length:Math.min(5,30-first)},(_,j)=>{const i=first+j;return '<article><span>00:'+String(i).padStart(2,'0')+'</span><div>老师</div><div>'+((i===3||i===18)?'重复提醒先看总量':'第'+i+'条发言，保留算式中的时间12:34和解题过程')+'</div></article>';}).join('')}
  list.addEventListener('scroll',()=>setTimeout(render,250));render();list.scrollTop=900;
  </script>''')
  await page.wait_for_timeout(350)
  await page.add_script_tag(path=str(ROOT/'extension/transcript.js'))
  result=await page.evaluate('extractMeetingTranscript()')
  assert result['count']==30,result
  assert result['firstTime']=='00:00' and result['lastTime']=='00:29'
  assert result['reachedStart'] and result['reachedEnd'] and not result['truncated']
  assert result['text'].count('重复提醒先看总量')==2
  assert '12:34' in result['text']
  assert await page.locator('#list').evaluate('(el)=>el.scrollTop')==900
  print('PASS delayed virtual rows: 30/30, repeated utterances retained, math timestamps retained, original scroll restored')
  await page.set_content('<h1>会议纪要</h1><p>只有页面菜单与纪要，没有逐字稿</p>')
  await page.add_script_tag(path=str(ROOT/'extension/transcript.js'))
  error=await page.evaluate('async()=>{try{await extractMeetingTranscript();return null}catch(e){return e.message}}')
  assert error and '未找到' in error
  print('PASS no page-body fallback')
  await browser.close()
asyncio.run(main())
