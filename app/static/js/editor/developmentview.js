// SPDX-License-Identifier: MIT
import {h,button} from '../flasher/dom.js';
import {Grid} from './grid.js';
import {parseFreq,mhz} from '../codeplug/fields.js';
export function idenDialog(record,t,onSave){
 const rows=record.rows.map((r,index)=>({...r,index})),error=h('p',{class:'notice bad',hidden:true});
 const cols=[{key:'index',label:'ID',get:r=>r.index,readOnly:true},
 {key:'baseHz',label:'Base (MHz)',get:r=>r.baseHz,format:v=>v?(v/1e6).toFixed(6).replace(/0+$/,'').replace(/\.$/,''):'',set:(r,v)=>{if(!String(v).trim()||Number(v)===0){r.baseHz=0;return;}const n=Math.round(Number(v)*1e6);if(!Number.isInteger(n)||n<=0||n>=1e9||n%5)return 'Base uses 5 Hz steps';r.baseHz=n;}},
 {key:'stepHz',label:'Spacing (Hz)',get:r=>r.stepHz,set:(r,v)=>{const n=Number(v);if(!Number.isInteger(n)||n<0||n>127875||n%125)return 'Spacing uses 125 Hz steps';r.stepHz=n;}},
 {key:'txOffsetHz',label:'TX offset (Hz)',get:r=>r.txOffsetHz,format:v=>v===-2147483648?'Unknown':String(v),set:(r,v)=>{if(String(v).trim().toLowerCase()==='unknown'){r.txOffsetHz=-2147483648;return;}const n=Number(v);if(!Number.isInteger(n)||Math.abs(n)>999999999)return 'Enter an offset in Hz or Unknown';r.txOffsetHz=n;}}];
 const grid=new Grid({rows,columns:cols,t,onChange:(row,col,v)=>col.set(row,v),onPaste:(cells,at)=>{const draft=rows.map(r=>({...r}));for(let i=0;i<cells.length;i++)for(let j=0;j<cells[i].length;j++){const r=draft[at.row+i],c=cols[at.col+j];if(!r||!c)return {error:'Paste is outside the bandplan'};if(c.readOnly)continue;const e=c.set(r,cells[i][j]);if(e)return {error:e,row:at.row+i,col:at.col+j};}draft.forEach((r,i)=>Object.assign(rows[i],r));}});
 const dlg=h('dialog',{class:'confirm editor-dialog'},h('h2',{},record.name),grid.el,error,h('div',{class:'confirm-actions'},button(t('editor.cancel'),()=>dlg.close()),button(t('editor.save_record'),()=>{const bad=rows.find(r=>(r.baseHz||r.stepHz||r.txOffsetHz)&&(!r.baseHz||!r.stepHz));if(bad){error.hidden=false;error.textContent='Each populated ID needs base and spacing';return;}onSave(rows.map(({index,...r})=>r));dlg.close();},{primary:true})));
 dlg.addEventListener('close',()=>dlg.remove());document.body.append(dlg);dlg.showModal();
}
