"use strict";
(() => {
  const NS="http://www.w3.org/2000/svg";
  const dimensions=["v2x_polyarchy","v2x_libdem","v2x_partipdem","v2x_delibdem","v2x_egaldem"];
  const colors=["#89daba","#c8a7f0"];
  const T=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
  const S=(tag,attrs,text)=>{
    const e=document.createElementNS(NS,tag);
    for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));
    if(text!==undefined)e.textContent=String(text);
    return e;
  };
  const values=(select,list)=>{
    select.replaceChildren(...list.map(([label,value])=>{
      const o=document.createElement("option");o.textContent=label;o.value=value;return o;
    }));
  };
  const seriesFor=(country,code)=>country?.indicators?.[code]||[];
  const atYear=(country,code,year)=>seriesFor(country,code).find(p=>p.year===year);
  const format=value=>typeof value==="number"?value.toFixed(3):"—";
  const delta=(country,code,fromYear,toYear)=>{
    const before=atYear(country,code,fromYear),present=atYear(country,code,toYear);
    if(!present||!before)return "Change unavailable for selected years";
    const raw=present.value-before.value;
    const rounded=Math.round(raw*1000)/1000;
    const displayed=rounded===0?0:rounded;
    return (displayed>0?"+":"")+displayed.toFixed(3)+" · "+fromYear+"–"+toYear;
  };
  function availableYears(a,b){
    const set=country=>new Set(dimensions.flatMap(code=>seriesFor(country,code)
      .filter(p=>Number.isInteger(p.year)&&Number.isFinite(p.value))
      .map(p=>p.year)));
    const x=set(a),y=set(b);
    return [...x].filter(year=>y.has(year)).sort((p,q)=>p-q);
  }
  function chart(target,data,isoA,isoB,code,startYear,endYear){
    target.replaceChildren();
    const pair=[isoA,isoB].map(iso=>data.countries[iso]);
    const observations=pair.map(c=>seriesFor(c,code).filter(p=>
      Number.isInteger(p.year)&&p.year>=startYear&&p.year<=endYear&&Number.isFinite(p.value)
      &&p.value>=0&&p.value<=1).sort((a,b)=>a.year-b.year));
    const years=observations.flatMap(s=>s.map(p=>p.year));
    if(!years.length){target.append(T("p","No observations for this index in "+startYear+"–"+endYear+"."));return;}
    const first=startYear,last=endYear,span=Math.max(1,last-first);
    const w=740,h=350,left=52,right=18,top=24,bottom=46;
    const x=y=>left+((y-first)/span)*(w-left-right);
    const y=v=>top+(1-v)*(h-top-bottom);
    const title=T("h4",data.indicators[code]+" · "+startYear+"–"+endYear+" (0–1)");
    const legend=document.createElement("div");legend.className="vdem-legend";
    pair.forEach((country,i)=>{
      const recent=observations[i][observations[i].length-1];
      const item=T("span",country.name+": "+(recent?format(recent.value)+" ("+recent.year+")":"unavailable"));
      item.style.color=colors[i];legend.append(item);
    });
    const svg=S("svg",{viewBox:"0 0 "+w+" "+h,role:"img",
      "aria-label":data.indicators[code]+" historical scores for "+pair.map(c=>c.name).join(" and "),
      style:"display:block;width:100%;height:auto"});
    for(const tick of [0,.25,.5,.75,1]){
      svg.append(S("line",{x1:left,x2:w-right,y1:y(tick),y2:y(tick),stroke:"#395d4d"}));
      svg.append(S("text",{x:left-10,y:y(tick)+4,"text-anchor":"end",
        fill:"#bad4c5","font-size":12},tick.toFixed(2)));
    }
    const ticks=[first,Math.round((first+last)/2),last];
    for(const t of [...new Set(ticks)])
      svg.append(S("text",{x:x(t),y:h-13,"text-anchor":"middle",
        fill:"#bad4c5","font-size":12},t));
    for(let index=0;index<2;index++){
      const points=observations[index];
      let path="",prior=null;
      for(const p of points){
        path+=(prior===null||p.year-prior>1?"M":"L")+
          x(p.year).toFixed(1)+","+y(p.value).toFixed(1)+" ";
        prior=p.year;
      }
      svg.append(S("path",{d:path,stroke:colors[index],fill:"none",
        "stroke-width":3,"stroke-linecap":"round","stroke-linejoin":"round"}));
      for(const p of points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/30))===0)){
        const dot=S("circle",{cx:x(p.year),cy:y(p.value),r:2.4,fill:colors[index]});
        dot.append(S("title",{},pair[index].name+" "+p.year+": "+format(p.value)));
        svg.append(dot);
      }
    }
    const caveat=T("p","Only observed years within "+startYear+"–"+endYear+" are drawn. Missing years are not interpolated. V-Dem uses a 0–1 scale, unlike World Bank WGI's 0–100. These are model-based democracy estimates, not a direct assessment of societal resilience.");
    caveat.className="vdem-caveat";
    target.append(title,legend,svg,caveat);
  }
  function app(data,root){
    const names=Object.entries(data.countries)
      .filter(([,country])=>dimensions.some(code=>seriesFor(country,code).length))
      .sort((a,b)=>a[1].name.localeCompare(b[1].name))
      .map(([iso,country])=>[country.name,iso]);
    let selected="v2x_polyarchy",startYear=null,endYear=null,years=[];
    const form=document.createElement("div");form.className="formrow";
    const choose=(labelText,defaultCode)=>{
      const label=document.createElement("label");label.append(T("span",labelText));
      const select=document.createElement("select");values(select,names);
      select.value=data.countries[defaultCode]?defaultCode:names[0][1];
      label.append(select);form.append(label);return select;
    };
    const a=choose("First country","SWE"),b=choose("Second country","POL");
    const intro=T("p","Five V-Dem democracy indices. The figures below are separate 0–1 estimates, not a combined score. Select a dimension to compare its historical trajectory.");
    intro.className="vdem-intro";
    const metrics=document.createElement("div");metrics.className="vdem-grid";
    const figure=document.createElement("div");figure.className="plot vdem-plot";
    const timeline=document.createElement("div");timeline.className="explore-timeline";
    timeline.className="explore-timeline vdem-interval";
    const timelineHeading=document.createElement("div");timelineHeading.className="explore-timeline-head";
    const headline=T("strong","Selected period");
    const periodLabel=T("output","—");periodLabel.className="explore-current-year";
    timelineHeading.append(headline,periodLabel);
    const interval=document.createElement("div");
    interval.className="vdem-dual-slider";
    const rail=document.createElement("div");
    rail.className="vdem-dual-track";
    const activeRail=document.createElement("div");
    activeRail.className="vdem-dual-fill";
    rail.append(activeRail);
    const slider=(name)=>{
      const input=document.createElement("input");
      input.type="range";input.className="vdem-dual-input";
      input.setAttribute("aria-label",name);
      input.step="1";input.min="0";
      interval.append(input);
      return input;
    };
    const from=slider("V-Dem start year");
    const to=slider("V-Dem end year");
    interval.prepend(rail);
    const legends=document.createElement("div");
    legends.className="vdem-dual-legends";
    const fromOutput=T("output","—");
    const toOutput=T("output","—");
    legends.append(fromOutput,toOutput);
    const extent=document.createElement("div");extent.className="explore-year-extent";
    timeline.append(timelineHeading,interval,legends,extent);
    const updateRail=()=>{
      const n=Math.max(1,years.length-1);
      const left=(100*Math.max(0,years.indexOf(startYear))/n);
      const right=(100*Math.max(0,years.indexOf(endYear))/n);
      activeRail.style.left=left+"%";
      activeRail.style.width=Math.max(0,right-left)+"%";
    };
    const source=document.createElement("p");source.className="vdem-caveat";
    const citation=document.createElement("a");
    citation.href=data.source.doi;citation.textContent=data.source.citation;
    citation.rel="noopener noreferrer";citation.target="_blank";
    const license=document.createElement("a");
    license.href=data.source.license_url;license.textContent="CC BY-SA 4.0";
    license.rel="noopener noreferrer";license.target="_blank";
    source.append("Source: ",citation," · Adapted extract under ",license,
      ". Version "+data.source.version+" · retrieved "+data.source.retrieved_utc.slice(0,10)+
      ". Comparisons must remain within one data release; earlier years may be revised between releases.");
    root.replaceChildren(intro,form,metrics,figure,timeline,source);
    function render(){
      const first=data.countries[a.value],second=data.countries[b.value];
      metrics.replaceChildren();
      if(years.length<2){
        const message="At least two shared observation years are required for an interval comparison.";
        metrics.append(T("p",message));
        figure.replaceChildren(T("p",message));
        periodLabel.textContent="—";
        fromOutput.textContent="—";
        toOutput.textContent="—";
        return;
      }
      periodLabel.textContent=startYear+"–"+endYear;
      fromOutput.textContent="Start: "+startYear;
      toOutput.textContent="End: "+endYear;
      from.setAttribute("aria-valuetext",String(startYear));
      to.setAttribute("aria-valuetext",String(endYear));
      updateRail();
      for(const code of dimensions){
        const card=document.createElement("button");card.type="button";card.className="vdem-metric";
        card.setAttribute("aria-pressed",String(code===selected));
        const head=T("strong",data.indicators[code]);head.className="vdem-metric-name";
        const pair=document.createElement("div");pair.className="vdem-pair";
        for(const [country,color] of [[first,colors[0]],[second,colors[1]]]){
          const column=document.createElement("div");column.className="vdem-column";
          const name=T("span",country.name);name.className="vdem-name";
          const current=atYear(country,code,endYear);
          const value=T("span",format(current?.value));value.className="vdem-score";value.style.color=color;
          const change=T("span",delta(country,code,startYear,endYear));change.className="vdem-delta";
          column.append(name,value,change);pair.append(column);
        }
        card.append(head,pair);
        card.addEventListener("click",()=>{selected=code;render();});
        metrics.append(card);
      }
      chart(figure,data,a.value,b.value,selected,startYear,endYear);
    }
    function syncSliders(){
      const max=String(Math.max(0,years.length-1));
      const enabled=years.length>=2;
      for(const input of [from,to]){
        input.max=max;
        input.disabled=!enabled;
      }
      from.value=String(Math.max(0,years.indexOf(startYear)));
      to.value=String(Math.max(0,years.indexOf(endYear)));
      updateRail();
      extent.replaceChildren(T("span",String(years[0]??"—")),
        T("span",enabled?"Adjust both ends of the observed interval":"At least two shared observation years are required"),
        T("span",String(years[years.length-1]??"—")));
    }
    function changeCountries(){
      years=availableYears(data.countries[a.value],data.countries[b.value]);
      if(years.length>=2){
        if(!years.includes(startYear))startYear=years[0];
        if(!years.includes(endYear))endYear=years[years.length-1];
        if(startYear>=endYear){
          startYear=years[0];
          endYear=years[years.length-1];
        }
      }else{
        startYear=years[0]??null;
        endYear=years[0]??null;
      }
      syncSliders();
      render();
    }
    for(const select of [a,b])select.addEventListener("change",changeCountries);
    from.addEventListener("input",()=>{
      const index=Math.min(Number(from.value),years.indexOf(endYear)-1);
      if(index<0)return;
      startYear=years[index];
      from.value=String(index);
      render();
    });
    to.addEventListener("input",()=>{
      const index=Math.max(Number(to.value),years.indexOf(startYear)+1);
      if(index>=years.length)return;
      endYear=years[index];
      to.value=String(index);
      render();
    });
    changeCountries();
  }
  async function start(){
    const root=document.querySelector("#vdem-app");
    if(!root)return;
    try{
      const resp=await fetch("data/vdem.json",{cache:"no-store"});
      if(!resp.ok)throw Error("V-Dem extract is not published yet");
      const data=await resp.json();
      if(data?.source?.version!==16||!data?.countries?.SWE||
        !data?.countries?.POL||dimensions.some(code=>!data.indicators?.[code]))
        throw Error("Unrecognized V-Dem dataset schema");
      app(data,root);
    }catch(err){
      const message=T("p","V-Dem data are not yet available. The verified Core v16 dataset must be imported and published before this view can show observations.");
      message.className="vdem-intro";
      root.replaceChildren(message);
    }
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);
  else start();
})();
