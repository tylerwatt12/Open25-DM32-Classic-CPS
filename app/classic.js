// SPDX-License-Identifier: MIT
const key="open25-dm32-classic-cps-theme";
try{document.documentElement.dataset.theme=localStorage.getItem(key)==="dark"?"dark":"light";}catch{}
document.getElementById("theme-toggle").addEventListener("click",()=>{
 const theme=document.documentElement.dataset.theme==="dark"?"light":"dark";
 document.documentElement.dataset.theme=theme;try{localStorage.setItem(key,theme);}catch{}
});
