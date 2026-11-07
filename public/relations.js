"use strict";
(() => {
  const NS="http://www.w3.org/2000/svg";
  const V=["v2x_polyarchy","v2x_libdem","v2x_partipdem","v2x_delibdem","v2x_egaldem"];
  const W=["GE","RL","CC","VA","RQ","PV"];
  const T=(tag,value)=>{
    const node=document.createElement(tag);
    if(value!==undefined)node.textContent=String(value);
    return node;
  };
  const S=(tag,attrs={},value)=>{
    const node=document.createElementNS(NS,tag);
    for(const [name,val] of Object.entries(attrs))node.setAttribute(name,String(val));
    if(value!==undefined)node.textContent=String(value);
    return node;
  };
  function setOptions(select,items){
    select.replaceChildren(...items.map(([title,value])=>{
      const option=T("option",title);
      option.value=value;
      return option;
    }));
  }
  function validWGI(p){
    return p&&Number.isInteger(p.year)&&Number.isFinite(p.value)&&p.value>=0&&p.value<=100;
  }
  function validVdem(p){
    return p&&Number.isInteger(p.year)&&Number.isFinite(p.value)&&p.value>=0&&p.value<=1;
  }
  function observedPair(wgi,vdem,iso,year,vCode,wCode){
    const w=(wgi.countries[iso]?.indicators?.[wCode]||[])
      .find(p=>p.year===year&&validWGI(p));
    const v=(vdem.countries[iso]?.indicators?.[vCode]||[])
      .find(p=>p.year===year&&validVdem(p));
    if(!w||!v)return null;
    return {
      iso,year,x:v.value,y:w.value,
      name:vdem.countries[iso].name||wgi.countries[iso].name
    };
  }
  function overlapCountries(wgi,vdem){
    return Object.keys(vdem.countries)
      .filter(iso=>Object.hasOwn(wgi.countries,iso))
      .filter(iso=>V.some(code=>vdem.countries[iso].indicators?.[code]?.length)
        &&W.some(code=>wgi.countries[iso].indicators?.[code]?.length))
      .sort((a,b)=>vdem.countries[a].name.localeCompare(vdem.countries[b].name));
  }
  function availableYears(wgi,vdem,isocodes,vCode,wCode){
    const years=new Set();
    for(const iso of isocodes){
      const sourceYears=new Set((vdem.countries[iso].indicators[vCode]||[])
        .filter(validVdem).map(p=>p.year));
      for(const p of (wgi.countries[iso].indicators[wCode]||[])){
        if(validWGI(p)&&sourceYears.has(p.year))years.add(p.year);
      }
    }
    return [...years].sort((a,b)=>a-b);
  }
  function pairedPoints(wgi,vdem,isocodes,vCode,wCode,year){
    return isocodes.map(iso=>observedPair(wgi,vdem,iso,year,vCode,wCode))
      .filter(Boolean);
  }
  function countryHistory(wgi,vdem,iso,vCode,wCode,year){
    if(!vdem.countries[iso]||!wgi.countries[iso])return [];
    const vYears=new Set((vdem.countries[iso].indicators[vCode]||[])
      .filter(p=>validVdem(p)&&p.year<=year).map(p=>p.year));
    return (wgi.countries[iso].indicators[wCode]||[])
      .filter(p=>validWGI(p)&&p.year<=year&&vYears.has(p.year))
      .map(p=>observedPair(wgi,vdem,iso,p.year,vCode,wCode))
      .filter(Boolean).sort((a,b)=>a.year-b.year);
  }
  function drawScatter(target,points,selected,history,labels,year){
    target.replaceChildren();
    const Wd=760,H=425,left=63,right=22,top=22,bottom=66;
    const x=value=>left+value*(Wd-left-right);
    const y=value=>top+(100-value)/100*(H-top-bottom);
    const plot=S("svg",{
      viewBox:"0 0 "+Wd+" "+H,
      role:"group",
      "aria-label":labels[0]+" versus "+labels[1]+" in "+year,
      style:"width:100%;height:auto;display:block"
    });
    for(const tick of [0,.25,.5,.75,1]){
      const xx=x(tick);
      plot.append(S("line",{x1:xx,x2:xx,y1:top,y2:H-bottom,stroke:"#395d4a"}));
      plot.append(S("text",{x:xx,y:H-bottom+23,"text-anchor":"middle","font-size":12,fill:"#b6d3c2"},tick.toFixed(2)));
    }
    for(const tick of [0,25,50,75,100]){
      const yy=y(tick);
      plot.append(S("line",{x1:left,x2:Wd-right,y1:yy,y2:yy,stroke:"#395d4a"}));
      plot.append(S("text",{x:left-13,y:yy+4,"text-anchor":"end","font-size":12,fill:"#b6d3c2"},tick));
    }
    plot.append(S("text",{x:Wd/2,y:H-8,"text-anchor":"middle","font-size":13,fill:"#d1e5d9"},labels[0]+" · V-Dem (0–1)"));
    plot.append(S("text",{x:20,y:H/2,transform:"rotate(-90 20 "+H/2+")","text-anchor":"middle","font-size":13,fill:"#d1e5d9"},labels[1]+" · WGI (0–100)"));
    if(history.length>1){
      plot.append(S("polyline",{
        points:history.map(p=>x(p.x).toFixed(2)+","+y(p.y).toFixed(2)).join(" "),
        stroke:"#ffd28a",fill:"none","stroke-width":2.8,
        "stroke-dasharray":"5 5","stroke-linecap":"round",
        "pointer-events":"none"
      }));
    }
    for(const p of history){
      const node=S("circle",{cx:x(p.x),cy:y(p.y),r:3.2,fill:"#ffd28a",
        "pointer-events":"none"});
      node.append(S("title",{},p.name+" · "+p.year));
      plot.append(node);
    }
    for(const p of points){
      if(p.iso===selected)continue;
      const node=S("circle",{cx:x(p.x),cy:y(p.y),r:4.8,
        fill:"#79c9aa",stroke:"#1a3427","stroke-width":.8,
        role:"button",tabindex:0,cursor:"pointer",
        "aria-label":"Select "+p.name+": V-Dem "+p.x.toFixed(3)+"; WGI "+p.y.toFixed(1)
      });
      node.append(S("title",{},p.name+" · "+year));
      node.addEventListener("click",()=>target.onSelect?.(p.iso));
      node.addEventListener("keydown",event=>{
        if(event.key==="Enter"||event.key===" "){
          event.preventDefault();
          target.onSelect?.(p.iso);
        }
      });
      plot.append(node);
    }
    const selectedPoint=points.find(p=>p.iso===selected);
    if(selectedPoint){
      plot.append(S("circle",{cx:x(selectedPoint.x),cy:y(selectedPoint.y),
        r:12,fill:"none",stroke:"#ffd28a","stroke-width":2,
        "pointer-events":"none"}));
      const node=S("circle",{cx:x(selectedPoint.x),cy:y(selectedPoint.y),r:7,
        fill:"#ffd28a",stroke:"#fff3d3","stroke-width":1.5,
        role:"button",tabindex:0,"aria-label":"Selected "+selectedPoint.name
      });
      node.append(S("title",{},selectedPoint.name+" · "+year));
      node.addEventListener("click",()=>target.onSelect?.(selected));
      plot.append(node);
    }
    target.append(plot);
  }
  function app(root,wgi,vdem){
    const countries=overlapCountries(wgi,vdem);
    if(countries.length<10){
      root.replaceChildren(T("p","Insufficient matching country codes between the two published sources."));
      return;
    }
    const intro=T("p","Each point matches one country and the same observation year in both sources. V-Dem measures democracy on 0–1; WGI measures governance on 0–100. This is not a combined index.");
    intro.className="relations-intro";
    const controls=document.createElement("div");controls.className="formrow";
    function selector(text,items,value){
      const label=document.createElement("label");
      label.append(T("span",text));
      const select=document.createElement("select");
      setOptions(select,items);select.value=value;
      label.append(select);controls.append(label);
      return select;
    }
    const vSelect=selector("Democracy measure (V-Dem)",
      V.map(code=>[vdem.indicators[code],code]),"v2x_polyarchy");
    const wSelect=selector("Institutional measure (WGI)",
      W.map(code=>[wgi.indicators[code],code]),"GE");
    const countrySelect=selector("Highlight country",
      countries.map(iso=>[vdem.countries[iso].name,iso]),
      countries.includes("SWE")?"SWE":countries[0]);
    const detail=document.createElement("div");detail.className="relations-detail";
    detail.setAttribute("aria-live","polite");
    const plotContainer=document.createElement("div");plotContainer.className="plot relations-plot";
    const timeline=document.createElement("div");timeline.className="explore-timeline";
    const header=document.createElement("div");header.className="explore-timeline-head";
    const caption=T("strong","Observation year"),current=T("output","—");
    current.className="explore-current-year";
    header.append(caption,current);
    const slider=document.createElement("input");
    slider.type="range";slider.className="explore-year-slider";
    slider.step="1";slider.min="0";
    slider.setAttribute("aria-label","Matched observation year");
    const extent=document.createElement("div");extent.className="explore-year-extent";
    timeline.append(header,slider,extent);
    const sources=document.createElement("p");sources.className="relations-sources";
    const link=(name,url)=>{
      const a=T("a",name);a.href=url;a.target="_blank";a.rel="noopener noreferrer";
      return a;
    };
    sources.append("Sources: ",
      link("V-Dem Core v16",vdem.source.doi||"https://v-dem.net/data/"),
      " · CC BY-SA 4.0 · retrieved "+vdem.source.retrieved_utc.slice(0,10),
      " and ",
      link("World Bank WGI",wgi.source.url||"https://www.worldbank.org/en/publication/worldwide-governance-indicators"),
      " · CC BY 4.0 · retrieved "+wgi.source.retrieved_utc.slice(0,10),
      ". Matched by country code and source year. Missing observations are excluded. Neither association nor a drawn trajectory establishes causation; these are estimates with different methodologies.");
    root.replaceChildren(intro,controls,detail,plotContainer,timeline,sources);
    let years=[],year=null;
    function render(){
      const yr=year;
      if(yr===null)return;
      const v=vSelect.value,w=wSelect.value,iso=countrySelect.value;
      const pairs=pairedPoints(wgi,vdem,countries,v,w,yr);
      const selectedPoint=pairs.find(p=>p.iso===iso);
      const history=countryHistory(wgi,vdem,iso,v,w,yr);
      detail.replaceChildren();
      const info=T("h3",(vdem.countries[iso]?.name||iso)+" · "+yr);
      info.className="relations-country";
      detail.append(info);
      const values=T("p",selectedPoint
        ?vdem.indicators[v]+": "+selectedPoint.x.toFixed(3)+" / 1.000 · "+
         wgi.indicators[w]+": "+selectedPoint.y.toFixed(1)+" / 100"
        :"No matched observation for this country and these measures in "+yr+".");
      values.className="relations-values";detail.append(values);
      const open=document.createElement("button");
      open.type="button";open.className="relations-country-button";
      open.textContent="Open WGI country profile";
      open.addEventListener("click",()=>{
        const countryTab=document.querySelector('[data-tab="countries"]');
        const countryDropdown=document.querySelector("#countries select");
        if(!countryTab||!countryDropdown)return;
        countryTab.click();
        countryDropdown.value=iso;
        countryDropdown.dispatchEvent(new Event("change",{bubbles:true}));
      });
      detail.append(open);
      plotContainer.replaceChildren();
      const count=T("p",pairs.length+" matched countries or territories · "+yr);
      count.className="relations-count";plotContainer.append(count);
      const graph=document.createElement("div");
      graph.onSelect=code=>{countrySelect.value=code;render();};
      drawScatter(graph,pairs,iso,history,[vdem.indicators[v],wgi.indicators[w]],yr);
      plotContainer.append(graph);
      const caveat=T("p",history.length>1
        ?"The amber dashed path connects the selected country's observed pairs up to "+yr+". Intermediate years without both measurements are not estimated."
        :"The selected country has fewer than two paired historical observations up to "+yr+".");
      caveat.className="relations-caveat";plotContainer.append(caveat);
      current.textContent=String(yr);
      slider.setAttribute("aria-valuetext",String(yr));
    }
    function refreshYears(){
      years=availableYears(wgi,vdem,countries,vSelect.value,wSelect.value);
      if(!years.includes(year))year=years[years.length-1]??null;
      slider.max=String(Math.max(0,years.length-1));
      slider.value=String(Math.max(0,years.indexOf(year)));
      slider.disabled=years.length<2;
      extent.replaceChildren(T("span",String(years[0]??"—")),
        T("span","Drag through years present in both datasets"),
        T("span",String(years[years.length-1]??"—")));
      if(year===null){
        detail.replaceChildren(T("p","No years shared by both datasets for these measures."));
        plotContainer.replaceChildren();
        current.textContent="—";
        return;
      }
      render();
    }
    for(const select of [vSelect,wSelect])select.addEventListener("change",refreshYears);
    countrySelect.addEventListener("change",render);
    slider.addEventListener("input",()=>{
      const target=years[Number(slider.value)];
      if(target===undefined)return;
      year=target;render();
    });
    refreshYears();
  }
  async function start(){
    const root=document.querySelector("#relations-app");
    if(!root)return;
    try{
      const [wr,vr]=await Promise.all([
        fetch("data/wgi.json",{cache:"no-store"}),
        fetch("data/vdem.json",{cache:"no-store"})
      ]);
      if(!wr.ok||!vr.ok)throw Error("Source datasets unavailable");
      const [wgi,vdem]=await Promise.all([wr.json(),vr.json()]);
      if(!wgi?.countries||!vdem?.countries||vdem.source?.version!==16||
        V.some(code=>!vdem.indicators?.[code])||
        W.some(code=>!wgi.indicators?.[code]))
        throw Error("Unexpected dataset structure");
      app(root,wgi,vdem);
    }catch(_){
      const p=T("p","Connections requires both verified datasets. This analysis is unavailable until WGI and V-Dem data can be loaded.");
      p.className="relations-intro";root.replaceChildren(p);
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);
  else start();
})();