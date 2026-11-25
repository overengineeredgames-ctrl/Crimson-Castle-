/* Temporary diagnostics for Link and Door tools. */
(function(){
"use strict";
const D=window.CCDebug={
 entries:[],checks:{},panel:null,
 report(section,status,message,details){
  const e={time:new Date().toLocaleTimeString(),section,status,message:String(message||""),details:details||null};
  this.entries.push(e);if(this.entries.length>250)this.entries.shift();this.checks[section]=e;
  console[status==="FAIL"?"error":status==="PASS"?"info":"warn"]("[CC DEBUG]["+status+"]["+section+"]",e.message,details||"");
  this.render();return e;
 },
 snapshot(){const B=window.Building,W=window.Weapons,G=window.Game;return{
  gameState:G&&G.state,doorMaterial:B&&B.doorMaterial,normalMaterial:B&&B.material,
  doorDrag:!!(B&&B.doorModifierDrag),doorCandidate:!!(B&&B.doorModifierDrag&&B.doorModifierDrag.candidate),
  confirmReady:!!(B&&B.doorModifierDrag&&B.doorModifierDrag.confirmReady),
  linkMode:!!(W&&W.linkMode),selectedTool:W&&W.selectedTool,
  selectedCannon:!!(W&&W.selectedCannon),selectedCannons:W&&W.selectedCannons&&W.selectedCannons.length,
  linkSource:!!(W&&W.linkSource),cannons:W&&W.cannons&&W.cannons.length,
  doors:B&&B.struts&&B.struts.filter(s=>s.isDoor&&!s.removed).length
 };},
 render(){if(!this.panel)return;const rows=Object.values(this.checks).slice(-20);
 const s=this.panel.querySelector("#cc-debug-summary"),l=this.panel.querySelector("#cc-debug-log");
 if(s)s.textContent=rows.map(x=>x.status+"  "+x.section+": "+x.message).join("\n")||"Waiting for interactions…";
 if(l)l.textContent=this.entries.slice(-55).map(x=>x.time+" ["+x.status+"] "+x.section+" — "+x.message+(x.details?" | "+JSON.stringify(x.details):"")).join("\n");},
 copy(){const value=JSON.stringify({app:"Crimson Castle debug",generated:new Date().toISOString(),snapshot:this.snapshot(),checks:Object.values(this.checks),recentEvents:this.entries.slice(-120)},null,2);
 const a=document.createElement("textarea");a.value=value;a.style="position:fixed;opacity:0";document.body.appendChild(a);a.select();
 try{document.execCommand("copy");this.report("COPY_REPORT","PASS","Debug report copied. Paste it into ChatGPT.");}catch(e){this.report("COPY_REPORT","FAIL","Copy failed: "+e.message);}a.remove();},
 wrap(obj,name,key){if(!obj||typeof obj[name]!=="function"||obj[name].__ccDebug)return;
 const original=obj[name],self=this;const fn=function(...args){self.report(key+"_ENTER","WAITING",name+" called",args.slice(0,2));
 try{const result=original.apply(this,args);self.report(key+"_EXIT",result===false?"FAIL":"PASS",name+" returned "+String(result),self.snapshot());return result;}
 catch(e){self.report(key+"_ERROR","FAIL",name+" threw: "+(e.stack||e.message),self.snapshot());throw e;}};
 fn.__ccDebug=true;obj[name]=fn;},
 init(){
 const p=document.createElement("aside");p.id="cc-debug-panel";
 p.innerHTML='<button id="cc-debug-toggle">DEBUG</button><div id="cc-debug-body" hidden><header><b>CRIMSON CASTLE DEBUG</b><button id="cc-debug-copy">Copy Debug Report</button><button id="cc-debug-clear">Clear</button><button id="cc-debug-close">×</button></header><small>PASS = ran · FAIL = returned false/threw · WAITING = entered. Reproduce each bug, then copy the report.</small><pre id="cc-debug-summary"></pre><details open><summary>Recent checkpoints</summary><pre id="cc-debug-log"></pre></details></div>';
 document.body.appendChild(p);this.panel=p;const body=p.querySelector("#cc-debug-body");
 p.querySelector("#cc-debug-toggle").onclick=()=>body.hidden=!body.hidden;
 p.querySelector("#cc-debug-close").onclick=()=>body.hidden=true;
 p.querySelector("#cc-debug-copy").onclick=()=>this.copy();
 p.querySelector("#cc-debug-clear").onclick=()=>{this.entries=[];this.checks={};this.report("LOG","PASS","Log cleared.");};
 this.report("PANEL_INIT","PASS","Diagnostic panel loaded.");
 this.report("APP_OBJECTS",window.Building&&window.Weapons&&window.Game?"PASS":"FAIL","Building, Weapons and Game globals "+(window.Building&&window.Weapons&&window.Game?"available":"missing"));
 this.wrap(window.Building,"setDoorMaterial","DOOR_BUTTON");this.wrap(window.Building,"startDoorModifier","DOOR_START");
 this.wrap(window.Building,"moveDoorModifier","DOOR_MOVE");this.wrap(window.Building,"releaseDoorModifier","DOOR_RELEASE");
 this.wrap(window.Building,"confirmDoorModifier","DOOR_CONFIRM");this.wrap(window.Weapons,"setLinkMode","LINK_TOGGLE");
 this.wrap(window.Weapons,"handleLinkPointerDown","LINK_TAP");this.wrap(window.Weapons,"linkDoorToWeapon","LINK_CREATE");
 document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("#btn-link,#btn-wood-door,#btn-steel-door,#btn-confirm-door");
 if(b)this.report("BUTTON_"+b.id,"PASS","Button click received",{active:b.classList.contains("active"),hidden:b.hidden});},true);
 const c=document.getElementById("gameCanvas");if(c){
 c.addEventListener("pointerdown",()=>this.report("CANVAS_DOWN","PASS","Canvas received pointerdown",this.snapshot()),true);
 c.addEventListener("pointerup",()=>this.report("CANVAS_UP","PASS","Canvas received pointerup",this.snapshot()),true);
 c.addEventListener("pointercancel",()=>this.report("CANVAS_CANCEL","FAIL","Pointer was cancelled",this.snapshot()),true);}
 window.addEventListener("error",e=>this.report("WINDOW_ERROR","FAIL",e.message+" at "+e.filename+":"+e.lineno));
 window.addEventListener("unhandledrejection",e=>this.report("PROMISE_ERROR","FAIL",String(e.reason&&e.reason.stack||e.reason)));
 this.report("INSTRUMENTATION","PASS","Door and Link function wrappers installed.");
 }};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>D.init(),{once:true});else D.init();
})();