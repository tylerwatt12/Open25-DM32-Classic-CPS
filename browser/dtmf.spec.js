// SPDX-License-Identifier: MIT
import {test,expect} from '@playwright/test';
import {empty,encode,newChannel} from '../app/static/js/codeplug/model.js';
import {DTMF_CONTACTS} from '../app/static/js/codeplug/records.js';
test('residual bytes do not appear as empty DTMF contacts or block a P25 save',async({page})=>{
 const m=empty();m.channels.push(newChannel({name:'P25 test',mode:'p25'}));const image=encode(m);image.bytes.fill(0x41,DTMF_CONTACTS,DTMF_CONTACTS+32);
 await page.goto('./');await page.locator('.ed-toolbar input[type=file]').setInputFiles({name:'synthetic.bin',mimeType:'application/octet-stream',buffer:Buffer.from(image.bytes)});
 await expect(page.getByRole('tab',{name:/DTMF Contacts/})).toContainText('0');await expect(page.locator('tbody')).toContainText('P25 test');
 await page.locator('summary').filter({hasText:/^Save$/}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Codeplug File (.bin)',exact:true}).click();expect((await pending).suggestedFilename()).toMatch(/^synthetic-.*\.bin$/);
});
