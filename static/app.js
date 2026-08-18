async function api(url, options={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...options});return await r.json()}
function toast(s,ok=true){const e=document.getElementById("toast");e.textContent=s;e.style.display="block";e.style.borderColor=ok?"#3fb950":"#da3633";setTimeout(()=>e.style.display="none",3500)}
async function loadStatus(){const d=await api("/api/status");document.getElementById("status").textContent=d.stdout||d.stderr||"无输出"}
async function loadRules(){const d=await api("/api/rules");document.getElementById("rules").textContent=d.stdout||d.stderr||"无输出"}
async function reloadAll(){await Promise.all([loadStatus(),loadRules()])}
async function doAction(url){const d=await api(url,{method:"POST",body:"{}"});toast(d.ok?"操作成功":d.stderr,d.ok);reloadAll()}
async function enableUfw(){if(confirm("启用 UFW 前请确认 SSH 端口已允许，否则可能断开远程连接。确定继续？"))doAction("/api/enable")}
async function disableUfw(){if(confirm("确定禁用 UFW？"))doAction("/api/disable")}
async function savePolicies(){
 for(const direction of ["incoming","outgoing","routed"]){
  const d=await api("/api/default",{method:"POST",body:JSON.stringify({direction,policy:document.getElementById(direction).value})});
  if(!d.ok){toast(d.stderr||"失败",false);return}
 }
 toast("默认策略已应用");reloadAll()
}
async function addRule(){
 const payload={action:action.value,direction:direction.value,port:port.value,protocol:protocol.value,
 from:document.getElementById("from").value,to:document.getElementById("to").value,comment:comment.value};
 const d=await api("/api/rule",{method:"POST",body:JSON.stringify(payload)});
 toast(d.ok?"规则添加成功":d.stderr,d.ok);if(d.ok)reloadAll()
}
async function deleteRule(){
 const n=document.getElementById("ruleNumber").value;if(!n)return toast("请输入规则编号",false);
 if(!confirm("确定删除规则 #"+n+"？"))return;
 const d=await api("/api/delete",{method:"POST",body:JSON.stringify({number:n})});
 toast(d.ok?"规则已删除":d.stderr,d.ok);if(d.ok)reloadAll()
}
reloadAll()
