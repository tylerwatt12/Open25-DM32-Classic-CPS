// SPDX-License-Identifier: MIT
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {decode} from '../app/static/js/codeplug/model.js';
import {CodeplugImage} from '../app/static/js/codeplug/image.js';
test('create P25, validate, edit table, persist draft and reopen saved binary',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('./');await expect(page.getByRole('heading',{name:'Open25-DM32 Classic CPS',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();
 const dlg=page.locator('dialog');await dlg.getByLabel('Name',{exact:true}).fill('P25 test');
 await dlg.getByLabel('Bandwidth kHz').selectOption({label:'25 kHz'});
 await dlg.getByLabel('Mode',{exact:true}).selectOption({label:'P25'});
 await expect(dlg.getByLabel('RX NAC (hex)')).toBeVisible();await expect(dlg.getByLabel('Bandwidth kHz')).toBeHidden();
 await dlg.getByLabel('RX MHz',{exact:true}).fill('446.05');await dlg.getByLabel('TX MHz',{exact:true}).fill('446.05');
 await dlg.getByLabel('TX NAC (hex)').fill('F7E');await dlg.getByRole('button',{name:'Save',exact:true}).click();await expect(dlg).toBeVisible();await expect(dlg.locator('.notice.bad')).toBeVisible();
 await dlg.getByLabel('TX NAC (hex)').fill('000');await dlg.getByLabel('P25 Talkgroup').fill('123');await dlg.getByLabel('P25 Radio ID').fill('7654321');
 await page.screenshot({path:'build/classic-cps-form.png',fullPage:true});
 await dlg.getByRole('button',{name:'Save',exact:true}).click();await expect(dlg).toHaveCount(0);
 await expect(page.locator('tbody tr').first()).toContainText('P25 test');await expect(page.locator('tbody tr').first()).toContainText('000');
 // The column header determines the actual grid index, avoiding duplicated model access in this UI check.
 const heads=await page.locator('thead th').allTextContents();const nacIndex=heads.findIndex(x=>x==='RX NAC (hex)');
 const cell=page.locator('tbody tr').first().locator('td').nth(nacIndex);await cell.dblclick();await cell.locator('input').fill('123');await cell.locator('input').press('Enter');await expect(cell).toContainText('123');
 await expect.poll(()=>page.evaluate(async()=>(await (await import('./static/js/editor/files.js')).loadDraft())?.dirty)).toBe(true);await page.reload();await expect(page.locator('tbody tr').first()).toContainText('P25 test');await expect(page.locator('tbody tr').first()).toContainText('123');
 await page.locator('summary').filter({hasText:/^Save$/}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Codeplug File (.bin)',exact:true}).click();const download=await pending;const file=await download.path();const model=decode(CodeplugImage.from(new Uint8Array(readFileSync(file))));
 expect(model.channels).toHaveLength(1);expect(model.channels[0]).toMatchObject({mode:'p25',p25RxNac:0x123,p25TxNac:0,p25Tg:123,p25Id:7654321,bw:12.5,rxHz:446050000,txHz:446050000});
 await page.getByRole('button',{name:'New',exact:true}).click();await expect(page.locator('tbody')).toContainText('No channels yet');
 await page.locator('.ed-toolbar input[type=file]').setInputFiles({name:'test.bin',mimeType:'application/octet-stream',buffer:readFileSync(file)});await expect(page.locator('tbody tr').first()).toContainText('P25 test');
 await page.screenshot({path:'build/classic-cps-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.getByLabel('TX NAC (hex)')).toHaveValue('000');await page.getByLabel('TX NAC (hex)').fill('Same as RX');await page.locator('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('tbody tr')).toContainText('Same as RX');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'build/classic-cps-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('link',{name:'Next CPS',exact:true}).first()).toHaveAttribute('href','../cps/');expect(errors).toEqual([]);
});
test('browser simulated radio read, P25 edit, write and reread',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./#sim');await page.getByRole('button',{name:'Read from Radio',exact:true}).click();
 await expect(page.locator('.ed-status')).toContainText('Baofeng DM-32UV');await page.getByRole('button',{name:'Add',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Mode',{exact:true}).selectOption({label:'P25'});await page.getByLabel('TX NAC (hex)').fill('ABC');await page.locator('dialog').getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('button',{name:'Write to Radio',exact:true}).click();
 // Upstream's write review is retained; the simulated transport uses the same CPS commands.
 const dialog=page.locator('dialog');await expect(dialog).toBeVisible();console.log(await dialog.innerText());
 await dialog.getByRole('button',{name:/Write/}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.ed-status')).toContainText('No unsaved changes',{timeout:15000});
 await page.getByRole('button',{name:'Read from Radio',exact:true}).click();await expect(page.locator('tbody tr').first()).toContainText('ABC');expect(errors).toEqual([]);
});
