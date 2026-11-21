// SPDX-License-Identifier: MIT
import {test,expect} from '@playwright/test';

async function saved(page){return page.evaluate(async()=>{const {loadDraft}=await import('./static/js/editor/files.js');const {decode}=await import('./static/js/codeplug/model.js');const {CodeplugImage}=await import('./static/js/codeplug/image.js');const draft=await loadDraft();if(!draft)return null;const m=decode(CodeplugImage.from(draft.bytes),{profile:draft.profile});return {profile:draft.profile,channels:m.channels.map(c=>({name:c.name,kind:c.kind,contact:c.contact?.id,params:c.params,tagTx:c.tagTx,rxOnly:c.rxOnly}))}})}
test('new native P25 and NXDN programming uses contacts, keeps TX intent, and restores the native draft',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');
 await expect(page.getByLabel('Firmware profile')).toHaveValue('classic-r14');
 await page.getByRole('tab',{name:/^Contacts/}).click();await page.getByRole('button',{name:'Add',exact:true}).click();
 // Use the real contacts grid, then select that contact in the P25 form.
 const heads=await page.locator('thead th').allTextContents();
 for(const [label,text] of [['Name','Dispatch'],['DMR ID or Talkgroup','701']]){const i=heads.findIndex(x=>x===label);expect(i).toBeGreaterThan(-1);const cell=page.locator('tbody tr').first().locator('td').nth(i);await cell.dblclick();await cell.locator('input').fill(text);await cell.locator('input').press('Enter');}
 await page.getByRole('tab',{name:/^Channels/}).click();await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();
 let dlg=page.locator('dialog');await dlg.getByLabel('Name',{exact:true}).fill('Native P25');await dlg.getByLabel('Mode',{exact:true}).selectOption({label:'P25'});
 await expect(dlg.getByLabel('Talkgroup override')).toHaveCount(0);await dlg.getByLabel('RX NAC (hex)').fill('123');await dlg.getByLabel('TX NAC (hex)').fill('000');
 await dlg.getByLabel('Channel Radio ID').fill('101');await dlg.getByLabel('TX Contact',{exact:true}).selectOption({label:'Dispatch'});
 await dlg.getByLabel('RX MHz',{exact:true}).fill('154.585');await dlg.getByLabel('TX MHz',{exact:true}).fill('154.585');
 await expect(dlg.getByLabel('RX Only',{exact:true})).not.toBeChecked();await dlg.getByRole('button',{name:'Save',exact:true}).click();await expect(dlg).toHaveCount(0);
 await expect.poll(async()=>(await saved(page))?.channels?.[0]?.params?.txNac).toBe(0);
 expect((await saved(page)).channels[0]).toMatchObject({kind:2,contact:701,tagTx:true,params:{rxNac:0x123,txNac:0}});
 await page.reload();await expect(page.getByLabel('Firmware profile')).toHaveValue('classic-r14');await expect(page.locator('tbody tr').first()).toContainText('Native P25');
 await page.getByRole('button',{name:'Add',exact:true}).click();await page.locator('tbody tr').last().getByRole('button',{name:'Edit',exact:true}).click();dlg=page.locator('dialog');
 await dlg.getByLabel('Name',{exact:true}).fill('Native NXDN');await dlg.getByLabel('Mode',{exact:true}).selectOption({label:'NXDN'});
 await dlg.getByLabel('Rate',{exact:true}).selectOption({label:'4800 bit/s'});await dlg.getByLabel('RX RAN',{exact:true}).fill('3');await dlg.getByLabel(/^TX RAN/).fill('0');
 await dlg.getByRole('button',{name:'Save',exact:true}).click();await expect(dlg).toHaveCount(0);
 await expect.poll(async()=>(await saved(page))?.channels?.length).toBe(2);expect((await saved(page)).channels[1]).toMatchObject({kind:4,params:{rate9600:false,rxRan:3,txRan:0}});
 await page.screenshot({path:'build/native-cps-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'build/native-cps-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('old draft remains legacy, profile switching preserves its direct TG and blocks native programming before port access',async({page})=>{
 await page.goto('./');await page.evaluate(async()=>{const {empty,newChannel,encode}=await import('./static/js/codeplug/model.js');const {setKind}=await import('./static/js/codeplug/channelmodes.js');const {saveDraft}=await import('./static/js/editor/files.js');const m=empty(),c=newChannel({name:'Old r13',dmrId:101});m.channels.push(c);setKind(m,c,2);c.params.talkgroup=987;await saveDraft({bytes:encode(m).bytes,name:'old',dirty:true,at:new Date().toISOString()})});
 await page.reload();await expect(page.getByLabel('Firmware profile')).toHaveValue('classic-r13');await expect(page.locator('tbody tr').first()).toContainText('987');
 await page.getByLabel('Firmware profile').selectOption('classic-r14');await expect(page.getByRole('columnheader',{name:'Talkgroup override',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Write to Radio',exact:true}).click();await expect(page.locator('.ed-view')).toContainText('Upgrade with Flasher v3');
 await page.getByLabel('Firmware profile').selectOption('classic-r13');await page.getByRole('tab',{name:/^Channels/}).click();await expect(page.locator('tbody tr').first()).toContainText('987');
});
test('native simulated radio read edit write and reread follows the native profile',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./#sim-native');await page.getByRole('button',{name:'Read from Radio',exact:true}).click();
 await expect(page.getByLabel('Firmware profile')).toHaveValue('classic-r14');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();
 const dlg=page.locator('dialog');await dlg.getByLabel('Mode',{exact:true}).selectOption({label:'P25'});await dlg.getByLabel('Channel Radio ID').fill('101');await dlg.getByLabel('TX NAC (hex)').fill('321');await dlg.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('button',{name:'Write to Radio',exact:true}).click();await expect(page.locator('dialog')).toBeVisible();await page.locator('dialog').getByRole('button',{name:/Write/}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Read from Radio',exact:true}).click();await expect(page.locator('tbody tr').first()).toContainText('321');expect(errors).toEqual([]);
});
