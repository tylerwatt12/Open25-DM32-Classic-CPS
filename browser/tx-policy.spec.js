// SPDX-License-Identifier: MIT
import {test,expect} from '@playwright/test';

async function seed(page,channels){
 await page.goto('./');
 await page.evaluate(async channels=>{
  const {empty,newChannel,encode}=await import('./static/js/codeplug/model.js');
  const {setKind}=await import('./static/js/codeplug/channelmodes.js');
  const {saveDraft}=await import('./static/js/editor/files.js');
  const m=empty();
  for(const item of channels){const {kind=0,tagTx,...fields}=item,c=newChannel(fields);m.channels.push(c);if(kind){setKind(m,c,kind);c.params.talkgroup=1;c.dmrId=101;c.tagTx=tagTx??!item.rxOnly;}}
  await saveDraft({bytes:encode(m).bytes,name:'tx-policy',dirty:false,at:new Date().toISOString()});
 },channels);
 await page.reload();await expect(page.locator('tbody tr')).toHaveCount(channels.length);
}
async function saved(page){return page.evaluate(async()=>{const {loadDraft}=await import('./static/js/editor/files.js'),{decode}=await import('./static/js/codeplug/model.js'),{CodeplugImage}=await import('./static/js/codeplug/image.js');const d=await loadDraft();return d?decode(CodeplugImage.from(d.bytes)).channels.map(c=>[c.name,c.txHz,c.rxOnly,c.kind,c.tagTx??null]):null});}
async function cell(page,row,label){const headers=await page.locator('thead th').allTextContents();return page.locator('tbody tr').nth(row).locator('td').nth(headers.indexOf(label));}
async function editText(page,row,label,text){const c=await cell(page,row,label);await c.dblclick();await c.locator('input').fill(text);await c.locator('input').press('Enter');}
const paste=async(locator,text)=>locator.evaluate((el,text)=>{el.focus();const data=new DataTransfer();data.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},text);
const warning=page=>page.locator('dialog').filter({has:page.getByRole('button',{name:'Enable TX',exact:true})});
async function assertWarning(page){const d=warning(page);await expect(d).toHaveCount(1);await expect(d).toContainText('Allow PTT to transmit on');await expect(d).toContainText('Outside amateur bands');await expect(d.getByRole('button',{name:'Keep RX-only',exact:true})).toBeFocused();return d;}

test('loaded outside-band programming stays enabled after an unrelated form edit',async({page})=>{
 await seed(page,[{name:'Existing',rxHz:155000000,txHz:155000000,rxOnly:false}]);
 await page.getByRole('button',{name:'Edit',exact:true}).click();const d=page.locator('dialog');await expect(d.getByLabel('RX Only',{exact:true})).not.toBeChecked();await d.getByLabel('Name',{exact:true}).fill('Renamed');await d.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 await expect.poll(()=>saved(page)).toEqual([['Renamed',155000000,false,0,null]]);
});

test('new outside-band form defaults RX-only and an explicit override confirms once without partial saves',async({page})=>{
 await page.goto('./');await page.getByLabel('Firmware profile').selectOption('classic-r13');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();let d=page.locator('dialog');await d.getByLabel('Name',{exact:true}).fill('Outside');await d.getByLabel('RX MHz',{exact:true}).fill('155');await d.getByLabel('TX MHz',{exact:true}).fill('155');await d.getByLabel('TX MHz',{exact:true}).press('Tab');await expect(d.getByLabel('RX Only',{exact:true})).toBeChecked();await d.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect.poll(()=>saved(page)).toEqual([['Outside',155000000,true,0,null]]);
 await page.getByRole('button',{name:'Edit',exact:true}).click();d=page.locator('dialog');await d.getByLabel('Name',{exact:true}).fill('Discard me');await d.getByLabel('RX Only',{exact:true}).uncheck();await d.getByRole('button',{name:'Save',exact:true}).click();const ask=await assertWarning(page);await ask.getByRole('button',{name:'Keep RX-only',exact:true}).click();await expect(page.locator('tbody')).toContainText('Outside');await expect(page.locator('tbody')).not.toContainText('Discard me');await expect.poll(()=>saved(page)).toEqual([['Outside',155000000,true,0,null]]);
 await page.getByRole('button',{name:'Edit',exact:true}).click();d=page.locator('dialog');await d.getByLabel('RX Only',{exact:true}).uncheck();await d.getByRole('button',{name:'Save',exact:true}).click();await (await assertWarning(page)).getByRole('button',{name:'Enable TX',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect.poll(()=>saved(page)).toEqual([['Outside',155000000,false,0,null]]);
});

test('copying an outside-band P25 channel disables only the copy mode transmit flag',async({page})=>{
 await seed(page,[{name:'P25 original',kind:2,tagTx:true,rxHz:155000000,txHz:155000000}]);await page.getByRole('button',{name:'Duplicate',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(2);await expect(page.locator('dialog')).toHaveCount(0);await expect.poll(()=>saved(page)).toEqual([['P25 original',155000000,true,2,true],['P25 original +',155000000,true,2,false]]);
 await page.locator('tbody tr').nth(1).getByRole('button',{name:'Edit',exact:true}).click();const d=page.locator('dialog');await expect(d.getByLabel('RX Only',{exact:true})).toBeChecked();await d.getByLabel('RX Only',{exact:true}).uncheck();await d.getByRole('button',{name:'Save',exact:true}).click();await (await assertWarning(page)).getByRole('button',{name:'Enable TX',exact:true}).click();await expect.poll(()=>saved(page)).toEqual([['P25 original',155000000,true,2,true],['P25 original +',155000000,true,2,true]]);
});

test('grid outside-to-outside TX edits reset RX-only after every explicit override',async({page})=>{
 await seed(page,[{name:'Grid',rxHz:155000000,txHz:155000000,rxOnly:false}]);await editText(page,0,'TX MHz','156.025');await expect(page.locator('dialog')).toHaveCount(0);await expect.poll(()=>saved(page)).toEqual([['Grid',156025000,true,0,null]]);
 await (await cell(page,0,'RX Only')).dblclick();await (await assertWarning(page)).getByRole('button',{name:'Keep RX-only',exact:true}).click();await expect(await cell(page,0,'RX Only')).toHaveText('✓');
 await (await cell(page,0,'RX Only')).dblclick();await (await assertWarning(page)).getByRole('button',{name:'Enable TX',exact:true}).click();await expect.poll(()=>saved(page)).toEqual([['Grid',156025000,false,0,null]]);await editText(page,0,'TX MHz','157.025');await expect.poll(()=>saved(page)).toEqual([['Grid',157025000,true,0,null]]);
});

test('a rectangular paste confirms one batch and cancellation or a bad cell leaves every row unchanged',async({page})=>{
 await seed(page,[{name:'One',rxHz:145500000,txHz:145500000,rxOnly:true},{name:'Two',rxHz:145500000,txHz:145500000,rxOnly:true}]);
 const baseline=await page.locator('tbody').innerText(),headers=await page.locator('thead th').allTextContents(),start=headers.indexOf('Name'),end=headers.indexOf('RX Only');
 const rows=await page.locator('tbody tr').evaluateAll((rs,{start,end})=>rs.map(r=>[...r.querySelectorAll('td')].slice(start,end+1).map(c=>c.textContent)),{start,end});
 for(let i=0;i<rows.length;i++){rows[i][0]='Changed '+i;rows[i][headers.indexOf('TX MHz')-start]=String(155+i);rows[i][end-start]='No';}
 const target=await cell(page,0,'Name');await paste(target,rows.map(r=>r.join('\t')).join('\n'));await (await assertWarning(page)).getByRole('button',{name:'Keep RX-only',exact:true}).click();expect(await page.locator('tbody').innerText()).toBe(baseline);
 const invalid=rows.map(r=>r.slice());invalid[1][headers.indexOf('TX MHz')-start]='not a frequency';await paste(await cell(page,0,'Name'),invalid.map(r=>r.join('\t')).join('\n'));await expect(page.locator('dialog')).toHaveCount(0);expect(await page.locator('tbody').innerText()).toBe(baseline);await expect(page.locator('td.invalid')).toBeVisible();
 await paste(await cell(page,0,'Name'),rows.map(r=>r.join('\t')).join('\n'));await (await assertWarning(page)).getByRole('button',{name:'Enable TX',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);await expect.poll(()=>saved(page)).toEqual([['Changed 0',155000000,false,0,null],['Changed 1',156000000,false,0,null]]);
});

test('bulk RX-only off is one atomic confirmed operation',async({page})=>{
 await seed(page,[{name:'One',rxHz:155000000,txHz:155000000,rxOnly:true},{name:'Two',rxHz:156000000,txHz:156000000,rxOnly:true}]);await page.getByRole('checkbox',{name:'Select all rows',exact:true}).check();
 const apply=async()=>{await page.getByRole('button',{name:/Bulk Edit/}).click();const d=page.locator('dialog');await d.getByRole('combobox',{name:'Field',exact:true}).selectOption({label:'RX Only'});await d.getByRole('combobox',{name:'Value',exact:true}).selectOption({label:'No'});await d.getByRole('button',{name:'Apply',exact:true}).click();};
 await apply();await (await assertWarning(page)).getByRole('button',{name:'Keep RX-only',exact:true}).click();await expect(await cell(page,0,'RX Only')).toHaveText('✓');await expect(await cell(page,1,'RX Only')).toHaveText('✓');await apply();await (await assertWarning(page)).getByRole('button',{name:'Enable TX',exact:true}).click();await expect.poll(()=>saved(page)).toEqual([['One',155000000,false,0,null],['Two',156000000,false,0,null]]);
});

test('typing an in-band TX frequency character by character does not retain a partial-value RX-only default',async({page})=>{await page.goto('./');await page.getByLabel('Firmware profile').selectOption('classic-r13');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();const d=page.locator('dialog'),tx=d.getByLabel('TX MHz',{exact:true});await tx.fill('');await tx.pressSequentially('146.940');await expect(d.getByLabel('RX Only',{exact:true})).not.toBeChecked();await tx.press('Tab');await expect(d.getByLabel('RX Only',{exact:true})).not.toBeChecked();await d.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(()=>saved(page)).toEqual([['Channel 1',146940000,false,0,null]]);});
