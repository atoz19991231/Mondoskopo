"use strict";
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const S = (tag, attrs, value) => {
    const e = document.createElementNS(NS, tag);
    for (const [k,v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
    if (value !== undefined) e.textContent = String(value);
    return e;
  };
  const T = (tag, value) => { const e=document.createElement(tag); e.textContent=value; return e; };
  const options = (el, list) => {
    el.replaceChildren(...list.map(item=>{
      const o=document.createElement("option"); o.textContent=item[0];o.value=item[1];return o;
    }));
  };
  const codes = ["RL","GE","CC","VA","RQ","PV"];
  function chart(target, data, names, ind) {
    target.replaceChildren();
    const series = names.map(n=>({
      iso:n[0], name:n[1], color:n[2],
      points:(data.countries[n[0]]?.indicators[ind]||[])
        .filter(p=>Number.isInteger(p.year)&&Number.isFinite(p.value)&&p.value>=0&&p.value<=100)
        .sort((a,b)=>a.year-b.year)
    })).filter(n=>n.points.length);
    if(!series.length){target.textContent="No verified observations for this selection.";return;}
    const years=series.flatMap(s=>s.points.map(p=>p.year));
    const min=Math.min(...years), max=Math.max(...years), span=Math.max(1,max-min);
    const W=700,H=310, l=52, r=18, t=19, b=46;
    const x=v=>l+(v-min)/span*(W-l-r);
    const y=v=>t+(100-v)/100*(H-t-b);
    const head=T("p",data.indicators[ind]+" · WGI governance score (0–100)");
    head.style.fontWeight="700";
    const plot=S("svg",{
      viewBox:"0 0 "+W+" "+H,
      role:"img",
      "aria-label":data.indicators[ind]+" over time for "+series.map(s=>s.name).join(" and "),
      style:"width:100%;height:auto"
    });
    for(const tick of [0,25,50,75,100]){
      plot.append(S("line",{x1:l,x2:W-r,y1:y(tick),y2:y(tick),stroke:"#c9dcd3"}));
      plot.append(S("text",{x:l-10,y:y(tick)+4,"text-anchor":"end","font-size":12,fill:"#657e72"},tick));
    }
    for(const yr of [...new Set([min,Math.round((min+max)/2),max])]){
      plot.append(S("text",{x:x(yr),y:H-14,"text-anchor":"middle","font-size":12,fill:"#657e72"},yr));
    }
    const legend=document.createElement("div");
    legend.style.cssText="display:flex;flex-wrap:wrap;gap:18px;margin:10px 0";
    for(const s of series){
      let d="",prev=null;
      for(const p of s.points){
        d+=(prev===null||p.year-prev>1?"M":"L")+x(p.year).toFixed(1)+","+y(p.value).toFixed(1)+" ";
        prev=p.year;
      }
      plot.append(S("path",{d,fill:"none",stroke:s.color,"stroke-width":3,"stroke-linejoin":"round"}));
      for(const p of s.points)plot.append(S("circle",{cx:x(p.year),cy:y(p.value),r:2.6,fill:s.color}));
      const recent=s.points[s.points.length-1];
      const label=T("span",s.name+": "+recent.value.toFixed(1)+" ("+recent.year+")");
      label.style.color=s.color;label.style.fontWeight="700";
      legend.append(label);
    }
    const note=T("p","Source: World Bank Worldwide Governance Indicators, 2026 update. These perception-based governance estimates are not measures of democracy or societal resilience. Missing years are left as gaps.");
    note.style.cssText="color:#59766c;font-size:12px;line-height:1.6";
    const source=T("p","Retrieved "+data.source.retrieved_utc.slice(0,10)+" · CC BY 4.0 · WGI scores, not percentiles.");
    source.style.cssText="color:#637f74;font-size:12px";
    target.append(head,legend,plot,note,source);
  }
  async function setup(){
    let data;
    try{
      const response=await fetch("data/wgi.json",{cache:"no-store"});
      if(!response.ok)throw Error("Dataset not published");
      data=await response.json();
      if(!data?.countries?.SWE?.indicators?.RL?.length||!data?.countries?.POL?.indicators?.RL?.length)throw Error("Missing observations");
    }catch(_){return;}
    const cs=Array.from(document.querySelectorAll("#countries select"));
    const ds=Array.from(document.querySelectorAll("#compare select"));
    if(cs.length!==2||ds.length!==2)return;
    const list=[["Sweden","SWE"],["Poland","POL"]];
    for(const el of [cs[0],ds[0],ds[1]])options(el,list);
    ds[1].value="POL";
    const inds=codes.map(c=>[data.indicators[c],c]);
    options(cs[1],inds);
    const label=document.createElement("label");
    label.append(T("span","Indicator"));
    const comparisonIndicator=document.createElement("select");
    options(comparisonIndicator,inds);label.append(comparisonIndicator);
    document.querySelector("#compare .formrow").append(label);
    const country=()=>chart(document.querySelector("#countries .plot"),data,
      [[cs[0].value,data.countries[cs[0].value].name,"#1a6657"]],cs[1].value);
    const compare=()=>chart(document.querySelector("#compare .plot"),data,
      [...new Set([ds[0].value,ds[1].value])].map((iso,i)=>[iso,data.countries[iso].name,i?"#7b64aa":"#1a6657"]),
      comparisonIndicator.value);
    for(const el of cs)el.addEventListener("change",country);
    for(const el of [...ds,comparisonIndicator])el.addEventListener("change",compare);
    country();compare();
    const note=document.querySelector(".note");
    if(note)note.textContent="Verified World Bank WGI observations are available for Sweden and Poland. V-Dem and human capabilities data are not yet integrated.";
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);
  else setup();
})();