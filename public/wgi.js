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
  function chart(target, data, names, ind, period=null) {
    target.replaceChildren();
    const series = names.map(n=>({
      iso:n[0], name:n[1], color:n[2],
      points:(data.countries[n[0]]?.indicators[ind]||[])
        .filter(p=>Number.isInteger(p.year)&&Number.isFinite(p.value)&&p.value>=0&&p.value<=100&&(!period||(p.year>=period.from&&p.year<=period.to)))
        .sort((a,b)=>a.year-b.year)
    })).filter(n=>n.points.length);
    if(!series.length){target.textContent="No verified observations for this selection.";return;}
    const years=series.flatMap(s=>s.points.map(p=>p.year));
    const min=Math.min(...years), max=Math.max(...years), span=Math.max(1,max-min);
    const W=700,H=310, l=52, r=18, t=19, b=46;
    const x=v=>l+(v-min)/span*(W-l-r);
    const y=v=>t+(100-v)/100*(H-t-b);
    const head=T("p",data.indicators[ind]+" · WGI governance score (0–100)"+(period?" · "+period.from+"–"+period.to:""));
    head.style.fontWeight="700";
    const plot=S("svg",{
      viewBox:"0 0 "+W+" "+H,
      role:"img",
      "aria-label":data.indicators[ind]+" over time for "+series.map(s=>s.name).join(" and "),
      style:"width:100%;height:auto"
    });
    for(const tick of [0,25,50,75,100]){
      plot.append(S("line",{x1:l,x2:W-r,y1:y(tick),y2:y(tick),stroke:"#3a584a"}));
      plot.append(S("text",{x:l-10,y:y(tick)+4,"text-anchor":"end","font-size":12,fill:"#aac8b8"},tick));
    }
    for(const yr of [...new Set([min,Math.round((min+max)/2),max])]){
      plot.append(S("text",{x:x(yr),y:H-14,"text-anchor":"middle","font-size":12,fill:"#aac8b8"},yr));
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
    note.style.cssText="color:#a7c6b5;font-size:12px;line-height:1.6";
    const source=T("p","Retrieved "+data.source.retrieved_utc.slice(0,10)+" · CC BY 4.0 · WGI scores, not percentiles.");
    source.style.cssText="color:#a7c6b5;font-size:12px";
    target.append(head,legend,plot,note,source);
  }

  function observedYears(country) {
    const valid=p=>Number.isInteger(p.year)&&Number.isFinite(p.value)&&p.value>=0&&p.value<=100;
    const sets=codes.map(code=>new Set((country.indicators[code]||[]).filter(valid).map(p=>p.year)));
    const common=[...sets[0]].filter(y=>sets.every(s=>s.has(y))).sort((a,b)=>a-b);
    if(common.length>=2)return common;
    // For incomplete national coverage, show actual observations and omit
    // dimensions without both endpoints from the comparative ranking.
    return [...new Set(sets.flatMap(s=>[...s]))].sort((a,b)=>a-b);
  }

  function selectDefaultPeriod(years, state, iso) {
    if(state.iso===iso&&years.includes(state.from)&&years.includes(state.to)&&state.from<state.to)return;
    state.iso=iso;
    state.to=years[years.length-1]??null;
    if(years.length<2){state.from=null;return;}
    const earlier=years.filter(y=>y<state.to);
    const target=state.to-10;
    state.from=earlier.reduce((best,y)=>Math.abs(y-target)<Math.abs(best-target)?y:best,earlier[0]);
  }

  function periodDifferences(country,from,to) {
    return codes.map((code,index)=>{
      const series=country.indicators[code]||[];
      const first=series.find(p=>p.year===from&&Number.isFinite(p.value));
      const last=series.find(p=>p.year===to&&Number.isFinite(p.value));
      const raw=first&&last?last.value-first.value:null;
      // Ranking uses the same one-decimal precision shown to visitors.
      const change=raw===null?null:Math.round(raw*10)/10;
      return {code,index,first,last,change:change===0?0:change};
    });
  }

  function countryOverview(target,data,iso,selectedCode,onSelect,state,onPeriodChange) {
    if(!target)return;
    const country=data.countries[iso];
    target.replaceChildren();
    if(!country)return;
    const years=observedYears(country);
    selectDefaultPeriod(years,state,iso);
    const heading=T("h3",country.name+" · Institutional profile");
    const intro=T("p","Explore the six World Bank WGI dimensions across the same selected years. Scores run from 0 to 100; comparisons use observed values only.");
    intro.className="overview-intro";
    target.append(heading,intro);

    if(state.from===null||state.to===null){
      const missing=T("p","There are not enough verified observations to compare periods for this country.");
      missing.className="overview-intro";
      target.append(missing);
      return;
    }

    const controls=document.createElement("div");
    controls.className="period-controls";
    function yearControl(title,selected,allowed,onChange){
      const label=document.createElement("label");
      label.append(T("span",title));
      const select=document.createElement("select");
      options(select,allowed.map(year=>[String(year),String(year)]));
      select.value=String(selected);
      select.addEventListener("change",()=>{onChange(Number(select.value));onPeriodChange();});
      label.append(select);
      controls.append(label);
    }
    yearControl("From year",state.from,years.filter(y=>y<state.to),year=>{state.from=year;});
    yearControl("To year",state.to,years.filter(y=>y>state.from),year=>{state.to=year;});
    const detail=T("span",String(state.to-state.from)+" calendar years · identical endpoints for all dimensions");
    detail.className="period-detail";
    controls.append(detail);
    target.append(controls);

    const rows=periodDifferences(country,state.from,state.to);
    const grid=document.createElement("div");
    grid.className="metric-grid";
    for(const row of rows) {
      const metric=document.createElement("button");
      metric.type="button";
      metric.className="metric";
      metric.setAttribute("aria-pressed",String(row.code===selectedCode));
      const label=T("span",data.indicators[row.code]||row.code);
      label.className="metric-name";
      const value=T("span",row.last?row.last.value.toFixed(1):"—");
      value.className="metric-value";
      const yearLabel=T("span",row.last?"WGI score · "+state.to+" · 0–100":"No observation for "+state.to);
      yearLabel.className="metric-meta";
      const delta=T("span",row.change===null
        ?"Change unavailable for selected years"
        :(row.change>0?"+":"")+row.change.toFixed(1)+" points · "+state.from+"–"+state.to);
      delta.className="metric-delta "+(row.change===null||row.change===0?"flat":row.change>0?"up":"down");
      metric.append(label,value,yearLabel,delta);
      metric.addEventListener("click",()=>onSelect(row.code));
      grid.append(metric);
    }
    target.append(grid);

    const ranking=document.createElement("section");
    ranking.className="period-ranking";
    const rankingTitle=T("h4","Largest institutional changes · "+state.from+"–"+state.to);
    ranking.append(rankingTitle);
    const comparable=rows.filter(r=>r.change!==null)
      .sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)||a.index-b.index);
    const context=T("p","Ranked by absolute change in WGI score points, not by relative importance, statistical significance or impact. Increases and decreases are shown separately.");
    context.className="overview-intro";
    ranking.append(context);
    const max=Math.max(.1,...comparable.map(r=>Math.abs(r.change)));
    const barList=document.createElement("div");
    barList.className="change-list";
    for(const row of comparable){
      const barRow=document.createElement("div");
      barRow.className="change-row";
      const label=T("span",data.indicators[row.code]||row.code);
      label.className="change-name";
      const rail=document.createElement("div");
      rail.className="change-rail";
      const fill=document.createElement("div");
      fill.className="change-fill "+(row.change<0?"decrease":"increase");
      fill.style.width=(100*Math.abs(row.change)/max).toFixed(1)+"%";
      rail.append(fill);
      const number=T("span",(row.change>0?"+":"")+row.change.toFixed(1));
      number.className="change-number";
      barRow.append(label,rail,number);
      barList.append(barRow);
    }
    if(comparable.length===0){
      const noData=T("p","No dimensions have observations for both selected years.");
      noData.className="overview-intro";
      ranking.append(noData);
    } else {
      ranking.append(barList);
    }
    if(comparable.length<codes.length){
      const excluded=T("p",(codes.length-comparable.length)+" dimension(s) excluded: data missing for one or both selected years.");
      excluded.className="overview-intro";
      ranking.append(excluded);
    }
    const caveat=T("p","Source: World Bank WGI (2026 update). Differences are between exactly the years shown, with no interpolated values. Scores represent governance estimates, not a combined index of democracy or resilience.");
    caveat.className="overview-intro";
    ranking.append(caveat);
    target.append(ranking);
  }

  function setupExplore(data){
    const section=document.querySelector("#explore .card");
    if(!section)return;
    const line=section.querySelector(".plot");
    const panel=document.createElement("div");
    panel.className="formrow";
    const axis=(title,selected)=>{
      const label=document.createElement("label");
      label.append(T("span",title));
      const select=document.createElement("select");
      options(select,codes.map(code=>[data.indicators[code],code]));
      select.value=selected;label.append(select);panel.append(label);
      return select;
    };
    const xIndicator=axis("Horizontal axis","GE");
    const yIndicator=axis("Vertical axis","RL");
    const yearLabel=document.createElement("label");
    yearLabel.append(T("span","Observation year"));
    const yearSelect=document.createElement("select");
    const years=new Set();
    for(const country of Object.values(data.countries))
      for(const series of Object.values(country.indicators||{}))
        for(const p of series) years.add(p.year);
    options(yearSelect,[...years].sort((a,b)=>b-a).map(y=>[String(y),String(y)]));
    yearLabel.append(yearSelect);panel.append(yearLabel);
    section.insertBefore(panel,line);
    const info=section.querySelector("p:not(.eyebrow)");
    if(info)info.textContent="Compare two WGI dimensions for the same observation year. Each point is one country or territory; association does not establish causation.";
    function render(){
      const xCode=xIndicator.value,yCode=yIndicator.value,year=+yearSelect.value;
      const points=[];
      for(const [iso,country] of Object.entries(data.countries)){
        const a=(country.indicators[xCode]||[]).find(p=>p.year===year);
        const b=(country.indicators[yCode]||[]).find(p=>p.year===year);
        if(a&&b)points.push({iso,name:country.name,x:a.value,y:b.value});
      }
      line.replaceChildren();
      if(points.length<10){
        line.append(T("p","Insufficient matching observations for "+year+". Choose another year."));
        return;
      }
      const W=710,H=390, left=58,right=24,top=18,bottom=58;
      const xx=v=>left+(v/100)*(W-left-right);
      const yy=v=>top+((100-v)/100)*(H-top-bottom);
      const plot=S("svg",{
        viewBox:"0 0 "+W+" "+H,role:"img",
        "aria-label":data.indicators[xCode]+" versus "+data.indicators[yCode]+" in "+year,
        style:"display:block;width:100%;height:auto"
      });
      for(const tick of [0,25,50,75,100]){
        plot.append(S("line",{x1:xx(tick),x2:xx(tick),y1:top,y2:H-bottom,stroke:"#3a584a"}));
        plot.append(S("line",{x1:left,x2:W-right,y1:yy(tick),y2:yy(tick),stroke:"#3a584a"}));
        plot.append(S("text",{x:xx(tick),y:H-bottom+19,"text-anchor":"middle","font-size":12,fill:"#aac8b8"},tick));
        plot.append(S("text",{x:left-13,y:yy(tick)+5,"text-anchor":"end","font-size":12,fill:"#aac8b8"},tick));
      }
      for(const p of points){
        const circ=S("circle",{
          cx:xx(p.x),cy:yy(p.y),r:4.8,fill:p.iso==="SWE"?"#edc17d":"#75c9aa",
          "fill-opacity":0.75,stroke:"#fff","stroke-width":0.7,
          tabindex:"0",role:"img",
          "aria-label":p.name+": "+p.x.toFixed(1)+", "+p.y.toFixed(1)
        });
        circ.append(S("title",{},p.name+" ("+year+"): "+data.indicators[xCode]+" "+p.x.toFixed(1)+"; "+data.indicators[yCode]+" "+p.y.toFixed(1)));
        plot.append(circ);
      }
      const labelX=S("text",{
        x:W/2,y:H-6,"text-anchor":"middle","font-size":13,fill:"#aac8b8"
      },data.indicators[xCode]+" (0–100)");
      const labelY=S("text",{
        x:16,y:H/2,transform:"rotate(-90 16 "+H/2+")",
        "text-anchor":"middle","font-size":13,fill:"#aac8b8"
      },data.indicators[yCode]+" (0–100)");
      plot.append(labelX,labelY);
      const title=T("p",points.length+" countries and territories · "+year);
      title.style.fontWeight="700";
      const caveat=T("p","Source: World Bank WGI, 2026 update. Dots are governance estimates, not precise measurements. Relationships in this chart do not imply causation. Source year: "+year+"; retrieved: "+data.source.retrieved_utc.slice(0,10)+".");
      caveat.style.cssText="font-size:12px;color:#a7c6b5;line-height:1.7";
      line.append(title,plot,caveat);
    }
    for(const el of [xIndicator,yIndicator,yearSelect])el.addEventListener("change",render);
    render();
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
    const list=Object.entries(data.countries)
      .filter(([,record])=>Object.values(record.indicators||{}).some(series=>series.length))
      .sort((a,b)=>a[1].name.localeCompare(b[1].name))
      .map(([iso,record])=>[record.name,iso]);
    for(const el of [cs[0],ds[0],ds[1]])options(el,list);
    cs[0].value="SWE";
    ds[0].value="SWE";
    ds[1].value="POL";
    const inds=codes.map(c=>[data.indicators[c],c]);
    options(cs[1],inds);
    const label=document.createElement("label");
    label.append(T("span","Indicator"));
    const comparisonIndicator=document.createElement("select");
    options(comparisonIndicator,inds);label.append(comparisonIndicator);
    document.querySelector("#compare .formrow").append(label);
    const periodState={iso:null,from:null,to:null};
    const country=()=>{
      const iso=cs[0].value;
      const record=data.countries[iso];
      if(!record)return;
      countryOverview(document.querySelector("#country-overview"),data,iso,cs[1].value,code=>{
        cs[1].value=code;
        country();
      },periodState,country);
      chart(document.querySelector("#countries .plot"),data,
        [[iso,record.name,"#79d8b4"]],cs[1].value,
        periodState.from!==null&&periodState.to!==null
          ?{from:periodState.from,to:periodState.to}:null);
    };
    const compare=()=>chart(document.querySelector("#compare .plot"),data,
      [...new Set([ds[0].value,ds[1].value])].map((iso,i)=>[iso,data.countries[iso].name,i?"#c6a8ec":"#79d8b4"]),
      comparisonIndicator.value);
    for(const el of cs)el.addEventListener("change",country);
    for(const el of [...ds,comparisonIndicator])el.addEventListener("change",compare);
    country();compare();
    setupExplore(data);
    const note=document.querySelector(".note");
    if(note)note.textContent="World Bank WGI 2026: "+list.length+" countries and territories with observations. Six dimensions, scores 0–100. V-Dem and other datasets are not yet integrated.";
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);
  else setup();
})();