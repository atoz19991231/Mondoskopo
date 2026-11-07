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
  const delta=(country,code,year)=>{
    const present=atYear(country,code,year),before=atYear(country,code,year-10);
    if(!present||!before)return "10-year change unavailable";
    const raw=present.value-before.value;
    const displayed=Math.round(raw*1000)/1000;
    return (displayed>0?"+":"")+displayed.toFixed(3)+" since "+(year-10);
  };
  function availableYears(a,b){
    const set=country=>new Set(dimensions.flatMap(code=>seriesFor(country,code)
      .filter(p=>Number.isInteger(p.year)&&Number.isFinite(p.value))
      .map(p=>p.year)));
    const x=set(a),y=set(b);
    return [...x].filter(year=>y.has(year)).sort((p,q)=>p-q);
  }
  function chart(target,data,isoA,isoB,code,endYear){
    target.replaceChildren();
    const pair=[isoA,isoB].map(iso=>data.countries[iso]);
    const observations=pair.map(c=>seriesFor(c,code).filter(p=>
      Number.isInteger(p.year)&&p.year<=endYear&&Number.isFinite(p.value)
      &&p.value>=0&&p.value<=1).sort((a,b)=>a.year-b.year));
    const years=observations.flatMap(s=>s.map(p=>p.year));
    if(!years.length){target.append(T("p","No observations for this index and selected year."));return;}
    const first=Math.min(...years),last=Math.max(...years),span=Math.max(1,last-first);
    const w=740,h=350,left=52,right=18,top=24,bottom=46;
    const x=y=>left+((y-first)/span)*(w-left-right);
    const y=v=>top+(1-v)*(h-top-bottom);
    const title=T("h4",data.indicators[code]+" · historical comparison (0–1)");
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
    const caveat=T("p","Only observed years are drawn. The V-Dem 0–1 scale is different from the World Bank WGI 0–100 scale. These are model-based democracy estimates, not a direct assessment of societal resilience.");
    caveat.className="vdem-caveat";
    target.append(title,legend,svg,caveat);
  }
  function app(data,root){
    const names=Object.entries(data.countries)
      .filter(([,country])=>dimensions.some(code=>seriesFor(country,code).length))
      .sort((a,b)=>a[1].name.localeCompare(b[1].name))
      .map(([iso,country])=>[country.name,iso]);
    let selected="v2x_polyarchy",endYear=null,years=[];
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
    const timelineHeading=document.createElement("div");timelineHeading.className="explore-timeline-head";
    const headline=T("strong","Observation year");const yearLabel=T("output","—");yearLabel.className="explore-current-year";
    timelineHeading.append(headline,yearLabel);
    const scrubber=document.createElement("input");
    scrubber.type="range";scrubber.className="explore-year-slider";
    scrubber.setAttribute("aria-label","V-Dem observation year");
    scrubber.step="1";scrubber.min="0";
    const extent=document.createElement("div");extent.className="explore-year-extent";
    timeline.append(timelineHeading,scrubber,extent);
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
      if(!years.length){
        metrics.append(T("p","No shared observation years for these selections."));
        figure.replaceChildren();return;
      }
      yearLabel.textContent=String(endYear);
      scrubber.setAttribute("aria-valuetext",String(endYear));
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
          const change=T("span",delta(country,code,endYear));change.className="vdem-delta";
          column.append(name,value,change);pair.append(column);
        }
        card.append(head,pair);
        card.addEventListener("click",()=>{selected=code;render();});
        metrics.append(card);
      }
      chart(figure,data,a.value,b.value,selected,endYear);
    }
    function changeCountries(){
      years=availableYears(data.countries[a.value],data.countries[b.value]);
      if(!years.includes(endYear))endYear=years[years.length-1]??null;
      scrubber.max=String(Math.max(0,years.length-1));
      scrubber.value=String(Math.max(0,years.indexOf(endYear)));
      extent.replaceChildren(T("span",String(years[0]??"—")),
        T("span","Drag to compare observed years"),T("span",String(years[years.length-1]??"—")));
      render();
    }
    for(const select of [a,b])select.addEventListener("change",changeCountries);
    scrubber.addEventListener("input",()=>{
      const year=years[Number(scrubber.value)];
      if(year===undefined)return;
      endYear=year;render();
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
