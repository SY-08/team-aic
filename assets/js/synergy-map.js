/* シナジーMAP アプリ本体（データは data/synergy/*.json から読込・出典/年/単位つき） */
(function(){
"use strict";
var D={}; // loaded data
var RATE=150;
var state={tab:"world",metric:"gdp",country:null,pref:null,ctyTab:"basic",prefSort:"gdp",geoFilter:{alliance:true,economy:true,supply:true,tension:true}};
var FILES=["sources","countries","country-debt","country-industries","japan-industries","prefectures","national-fiscal","social-security","timelines","geopolitical-relations"];
var TABS=[["world","1. 世界比較"],["country","2. 国別詳細"],["japan","3. 日本の経済"],["fiscal","4. 財政・社会保障"],["trends","5. 推移・示唆"],["geo","6. 地政学・関係線"]];

function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function nf(x,d){ if(x==null||isNaN(x))return "-"; return Number(x).toLocaleString(undefined,{maximumFractionDigits:d==null?1:d}); }
function yenTrn(usdTrn){ return Math.round(usdTrn*RATE); } // 兆ドル→兆円
function pcUsd(c){ return Math.round(c.gdpUsdTrn*1e6/c.popM/100)*100; } // 一人当たり$（GDP兆$*1e12/人口）
function pcMan(c){ return Math.round(pcUsd(c)*RATE/1e4); } // 万円
function sgn(v,suf){ if(v==null)return "-"; var s=(v>0?"+":"")+v+(suf||"%"); return "<span class='"+(v>0?"pos":v<0?"neg":"")+"'>"+s+"</span>"; }
function srcLine(parts){ return "<div class='src'>"+parts.map(esc).join(" ｜ ")+"</div>"; }
function S(key){ var s=D.sources&&D.sources.sources[key]; return s? s.name : key; }
function bar(pct,color,max){ var w=Math.max(1.5,Math.min(100,pct/(max||100)*100)); return "<div class='bar'><i style='width:"+w+"%;background:"+(color||"var(--blue)")+"'></i></div>"; }
function cty(id){ return D.countries.records.find(function(c){return c.id===id;}); }
function rankOf(id,get){ var arr=D.countries.records.slice().sort(function(a,b){return get(b)-get(a);}); return arr.findIndex(function(c){return c.id===id;})+1; }

// ---------- metrics ----------
var METRICS=[
 {k:"gdp",label:"GDP",col:"名目GDP（円換算つき）",get:function(c){return c.gdpUsdTrn;},
  fmt:function(c){return "<span class='num'>"+c.gdpUsdTrn+"兆$</span> <span style='color:#8a5a12'>≈"+nf(yenTrn(c.gdpUsdTrn),0)+"兆円</span>";},sub:function(c){return "成長率(実質) "+sgn(c.ggPct);}},
 {k:"pop",label:"人口",col:"人口（世界順位）",get:function(c){return c.popM;},
  fmt:function(c){return "<span class='num'>"+nf(c.popM,0)+"百万人</span>（世界"+c.popRankWorld+"位）";},sub:function(c){return "前年比 "+sgn(c.pgPct)+" ／ 2014年比 "+sgn(c.pg10Pct);}},
 {k:"pc",label:"一人当たりGDP",col:"一人当たりGDP（生産性順）",get:function(c){return pcUsd(c);},
  fmt:function(c){return "<span class='num'>$"+nf(pcUsd(c),0)+"</span> <span style='color:#8a5a12'>≈"+nf(pcMan(c),0)+"万円</span>";},sub:function(c){return "";}},
 {k:"pg",label:"人口増減率",col:"人口増減率（前年比／2014年比）",get:function(c){return c.pgPct;},
  fmt:function(c){return sgn(c.pgPct)+" ／ 10年:"+sgn(c.pg10Pct);},sub:function(c){return "";}},
 {k:"gg",label:"GDP成長率",col:"実質GDP成長率（前年比）",get:function(c){return c.ggPct;},
  fmt:function(c){return sgn(c.ggPct);},sub:function(c){return "";}},
 {k:"debt",label:"債務残高",col:"政府債務（円換算・2023年）",get:function(c){var d=D.debt.records[c.id];return d?d.debtYenTrn:0;},
  fmt:function(c){var d=D.debt.records[c.id];return d?"<span class='num'>約"+nf(d.debtYenTrn,0)+"兆円</span>":"未確認";},sub:function(c){return "";}},
 {k:"debtR",label:"債務/GDP比",col:"債務÷GDP（2023年）",get:function(c){var d=D.debt.records[c.id];return d?d.debtGdpPct:0;},
  fmt:function(c){var d=D.debt.records[c.id];return d?"<span class='num'>"+d.debtGdpPct+"%</span>":"未確認";},sub:function(c){return "";}}
];
function metric(k){ return METRICS.find(function(m){return m.k===k;})||METRICS[0]; }

// ---------- boot ----------
Promise.all(FILES.map(function(f){ return fetch("data/synergy/"+f+".json").then(function(r){ if(!r.ok)throw new Error(f); return r.json(); }); }))
.then(function(arr){
  D.sources=arr[0]; D.countries=arr[1]; D.debt=arr[2]; D.cind=arr[3]; D.jind=arr[4]; D.pref=arr[5]; D.fisc=arr[6]; D.soc=arr[7]; D.tl=arr[8]; D.geo=arr[9];
  init();
}).catch(function(e){
  document.getElementById("main").innerHTML="<div class='err'><b>データファイルを読み込めませんでした（"+esc(e.message)+".json）。</b><br>GitHub Pages上（https://sy-08.github.io/team-aic/world-map.html）で開いてください。ローカルのfile://直開きではブラウザの制限で読み込めません。</div>";
});

function init(){
  var tabs=document.getElementById("tabs");
  tabs.innerHTML=TABS.map(function(t){return "<button class='tab' data-t='"+t[0]+"'>"+t[1]+"</button>";}).join("");
  tabs.addEventListener("click",function(e){ var b=e.target.closest(".tab"); if(b){ state.tab=b.dataset.t; render(); }});
  document.getElementById("rateIn").addEventListener("change",function(){ var v=parseFloat(this.value); if(v>0){RATE=v; render();} });
  document.getElementById("srcBtn").addEventListener("click",showSources);
  document.getElementById("inspClose").addEventListener("click",function(){ document.getElementById("insp").classList.remove("on"); });
  document.getElementById("foot").innerHTML="円換算＝米ドル額×表示レート（既定 1$=150円・概算固定レート／画面上部で変更可）。総額と内訳の差は丸め差・分類差・未内訳として明示。地図タイル © OpenStreetMap contributors。データ最終整理: "+esc(D.sources.asOf)+"。スプレッドシート正本は現在<b>未確認</b>（共有設定の確認待ち）のため、利用者提供数値＋公的出典の概算で表示中。";
  render();
}
function render(){
  document.querySelectorAll("#tabs .tab").forEach(function(b){ b.classList.toggle("on",b.dataset.t===state.tab); });
  var m=document.getElementById("main");
  if(state.tab==="world") m.innerHTML=vWorld();
  else if(state.tab==="country") m.innerHTML=vCountry();
  else if(state.tab==="japan") m.innerHTML=vJapan();
  else if(state.tab==="fiscal") m.innerHTML=vFiscal();
  else if(state.tab==="trends") m.innerHTML=vTrends();
  else if(state.tab==="geo") m.innerHTML=vGeo();
  bindView(m);
}
function showSources(){
  var s=D.sources.sources, h="<table class='t'><tr><th>出典</th><th>URL / 状態</th></tr>";
  Object.keys(s).forEach(function(k){ var x=s[k];
    h+="<tr><td>"+esc(x.name)+"</td><td>"+(x.url?"<a href='"+esc(x.url)+"' target='_blank' rel='noopener'>"+esc(x.url)+"</a>":"")+(x.status?"<br><span class='statusChip'>"+esc(x.status)+"</span>":"")+"</td></tr>"; });
  h+="</table><div class='src'>優先順位：スプレッドシートの数値 → 一次資料で照合 → 不一致は定義・年・単位を注記して併記（黙って置換しない）。</div>";
  openInsp("出典一覧",h);
}
function openInsp(title,html){ document.getElementById("inspTitle").textContent=title; document.getElementById("inspBody").innerHTML=html; document.getElementById("insp").classList.add("on"); }

// ---------- view 1: 世界比較 ----------
function vWorld(){
  var m=metric(state.metric);
  var rows=D.countries.records.slice().sort(function(a,b){return m.get(b)-m.get(a);});
  var h="<div class='grid'>";
  h+="<div class='card'><h2>指標を選んでランキング表示（15か国）</h2><div class='chipRow'>"+
     METRICS.map(function(x){return "<button class='mchip"+(x.k===state.metric?" on":"")+"' data-m='"+x.k+"'>"+x.label+"</button>";}).join("")+"</div>";
  h+="<table class='t'><tr><th>順位</th><th>国</th><th>"+m.col+"</th><th>補足</th></tr>";
  rows.forEach(function(c,i){
    h+="<tr class='click cRow"+(state.country===c.id?" sel":"")+"' data-c='"+c.id+"'><td class='num'>"+(i+1)+"</td><td style='font-weight:800;color:"+c.color+"'>"+c.flag+" "+esc(c.name)+"</td><td>"+m.fmt(c)+"</td><td style='font-size:11.5px'>"+m.sub(c)+"</td></tr>";
  });
  h+="</table>";
  h+=srcLine(["対象年: "+D.countries.meta.period,"出典: "+S("imf_weo")+"・"+S("un_wpp"),"債務: 2023年（"+D.debt.meta.definition.slice(0,22)+"…）","状態: "+D.countries.meta.status]);
  h+="</div>";
  h+="<div class='card'><h2>世界地図（国を選ぶと詳細へ）</h2><div id='wmap' class='map-wrap'></div>"+srcLine(["地図: © OpenStreetMap contributors"])+"</div>";
  h+="<div class='card'><h2>各国カード（5指標を同じ粒度で表示）</h2><div class='cty-grid'>";
  D.countries.records.forEach(function(c){
    var d=D.debt.records[c.id];
    h+="<div class='cty"+(state.country===c.id?" sel":"")+"' data-c='"+c.id+"' style='border-left-color:"+c.color+"'>"+
      "<div class='nm'>"+c.flag+" "+esc(c.name)+"</div>"+
      "<div class='five'>"+
      "<div><b>① 名目GDP</b>"+c.gdpUsdTrn+"兆$ / ≈"+nf(yenTrn(c.gdpUsdTrn),0)+"兆円</div>"+
      "<div><b>② 人口（世界"+c.popRankWorld+"位）</b>"+nf(c.popM,0)+"百万人</div>"+
      "<div><b>③ 一人当たりGDP</b>$"+nf(pcUsd(c),0)+" / ≈"+nf(pcMan(c),0)+"万円</div>"+
      "<div><b>④ 人口増減(前年)</b>"+sgn(c.pgPct)+"</div>"+
      "<div><b>⑤ GDP成長率</b>"+sgn(c.ggPct)+"</div>"+
      "<div><b>債務/GDP('23)</b>"+(d?d.debtGdpPct+"%":"未確認")+"</div>"+
      "</div></div>";
  });
  h+="</div><div class='src'>カードをクリック → 「2. 国別詳細」へ。</div></div></div>";
  return h;
}
var wmapObj=null;
function mountWorldMap(){
  var el=document.getElementById("wmap"); if(!el||!window.L)return;
  wmapObj=L.map(el,{scrollWheelZoom:false}).setView([25,15],1.6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:6,attribution:"© OpenStreetMap contributors"}).addTo(wmapObj);
  D.countries.records.forEach(function(c){
    var mk=L.circleMarker(c.ll,{radius:Math.max(6,Math.sqrt(c.gdpUsdTrn)*2.4),color:c.color,fillColor:c.color,fillOpacity:.55,weight:2}).addTo(wmapObj);
    mk.bindTooltip(c.flag+" "+c.name+"（GDP "+c.gdpUsdTrn+"兆$）");
    mk.on("click",function(){ selectCountry(c.id); });
  });
}
function selectCountry(id){ state.country=id; state.tab="country"; render(); }

// ---------- view 2: 国別詳細 ----------
function vCountry(){
  var h="<div class='grid'><div class='card'><h2>国を選ぶ</h2><div class='chipRow'>"+
    D.countries.records.map(function(c){return "<button class='mchip"+(state.country===c.id?" on":"")+"' data-c='"+c.id+"'>"+c.flag+" "+esc(c.name)+"</button>";}).join("")+"</div></div>";
  var c=state.country?cty(state.country):null;
  if(!c){ return h+"<div class='card'>上から国を選んでください（「1. 世界比較」のカード・地図・ランキングからも選べます）。</div></div>"; }
  var SUB=[["basic","基本指標"],["debt","債務"],["ind","産業"],["geo","地政学"]];
  h+="<div class='card'><h2>"+c.flag+" "+esc(c.name)+"</h2><div class='subtabs'>"+
    SUB.map(function(s){return "<button class='mchip"+(state.ctyTab===s[0]?" on":"")+"' data-ct='"+s[0]+"'>"+s[1]+"</button>";}).join("")+"</div>";
  if(state.ctyTab==="basic"){
    h+="<table class='t'><tr><th>指標</th><th>値</th><th>15か国内順位</th></tr>";
    h+="<tr><td>名目GDP（2024）</td><td>"+c.gdpUsdTrn+"兆$ ≈"+nf(yenTrn(c.gdpUsdTrn),0)+"兆円</td><td class='num'>"+rankOf(c.id,function(x){return x.gdpUsdTrn;})+"位</td></tr>";
    h+="<tr><td>人口（2024）</td><td>"+nf(c.popM,0)+"百万人（世界"+c.popRankWorld+"位）</td><td class='num'>"+rankOf(c.id,function(x){return x.popM;})+"位</td></tr>";
    h+="<tr><td>一人当たりGDP</td><td>$"+nf(pcUsd(c),0)+" ≈"+nf(pcMan(c),0)+"万円</td><td class='num'>"+rankOf(c.id,function(x){return pcUsd(x);})+"位（生産性順位）</td></tr>";
    h+="<tr><td>人口増減率</td><td>前年比 "+sgn(c.pgPct)+" ／ 2014年比 "+sgn(c.pg10Pct)+"</td><td class='num'>"+rankOf(c.id,function(x){return x.pgPct;})+"位</td></tr>";
    h+="<tr><td>実質GDP成長率（2024）</td><td>"+sgn(c.ggPct)+"</td><td class='num'>"+rankOf(c.id,function(x){return x.ggPct;})+"位</td></tr></table>";
    h+=srcLine(["出典: "+S("imf_weo")+"・"+S("un_wpp"),"2014年比人口: 利用者提供（概算）","円換算: 1$="+RATE+"円"]);
  }else if(state.ctyTab==="debt"){
    var d=D.debt.records[c.id];
    if(d){
      var maxV=Math.max(d.gdpYenTrn,d.debtYenTrn);
      h+="<div class='pair'><span class='lbl'>名目GDP（円換算）</span>"+bar(d.gdpYenTrn,"#2a6fb5",maxV)+"<span class='num'>約"+nf(d.gdpYenTrn,0)+"兆円</span></div>";
      h+="<div class='pair'><span class='lbl'>債務残高（円換算）</span>"+bar(d.debtYenTrn,"#5b4a66",maxV)+"<span class='num'>約"+nf(d.debtYenTrn,0)+"兆円</span></div>";
      h+="<p style='font-size:20px;font-weight:900;margin:10px 0 2px'>債務/GDP比率: "+d.debtGdpPct+"%（15か国中 "+rankOf(c.id,function(x){var y=D.debt.records[x.id];return y?y.debtGdpPct:0;})+"位）</p>";
      h+="<span class='statusChip'>"+esc(D.debt.meta.status)+"</span>";
      h+=srcLine(["対象年: "+D.debt.meta.period,"定義: "+D.debt.meta.definition,"出典: "+S(D.debt.meta.source)+"（照合先: "+S(D.debt.meta.crossCheck)+"）"]);
    }else h+="<p>未確認</p>";
  }else if(state.ctyTab==="ind"){
    var ci=D.cind.records[c.id];
    h+="<h3>産業構成比（国際比較用・共通3分類）</h3>";
    Object.keys(ci.sectors3).forEach(function(k){ var v=ci.sectors3[k];
      h+="<div class='pair'><span class='lbl'>"+esc(k)+"</span>"+bar(v,k==="サービス"?"#2a6fb5":k==="工業・建設"?"#3aa564":"#c9a13a",100)+"<span class='num'>"+v+"%</span></div>"; });
    h+="<div class='src'>"+esc(D.cind.meta.sectors.status)+"</div>";
    h+="<h3>主要産業（国内順位・定性）</h3><table class='t'>";
    ci.majors.forEach(function(mj){ h+="<tr><td class='num'>"+mj.rank+"位</td><td style='font-weight:800'>"+esc(mj.name)+"</td><td style='font-size:12px;color:#5a6f82'>"+esc(mj.desc)+"</td></tr>"; });
    h+="</table>"+srcLine(["3分類: "+S("wdi")+"（"+D.cind.meta.sectors.period+"・概算）","主要産業: 利用者提供の定性整理（比率ではない）"]);
  }else{
    h+="<p style='font-size:13px;line-height:1.8'>"+esc(c.geoNote)+"</p><h3>この国が関わる関係線</h3><table class='t'>";
    D.geo.relations.filter(function(r){return r.a===c.id||r.b===c.id;}).forEach(function(r){
      var t=D.geo.meta.types[r.type]; var o=cty(r.a===c.id?r.b:r.a);
      h+="<tr><td><i style='display:inline-block;width:14px;height:4px;border-radius:2px;background:"+t.color+"'></i></td><td style='font-weight:800'>"+esc(r.label)+"</td><td>"+(o?o.flag+" "+esc(o.name):"")+"</td><td style='font-size:12px;color:#5a6f82'>"+esc(r.desc)+"<br><span class='src'>as of "+r.asOf+" ｜ "+S(r.source)+"</span></td></tr>"; });
    h+="</table><div class='src'>詳細な地図表示は「6. 地政学・関係線」タブへ。安全保障情報は変動が大きいため時点表示つき。</div>";
  }
  h+="</div></div>";
  return h;
}

// ---------- view 3: 日本の経済 ----------
function vJapan(){
  var jm=D.jind.meta;
  var h="<div class='grid'>";
  h+="<div class='card'><h2>産業別GDPランキング（"+esc(jm.period)+"）<span class='statusChip'>"+esc(jm.status)+"</span></h2>";
  h+="<p style='font-size:12.5px'>合計 <b>"+jm.totalTrn2023+"兆円</b>（2013年 "+jm.totalTrn2013+"兆円 → +21.7%）。行をクリックすると要因（2013年比）を表示。</p>";
  h+="<table class='t'><tr><th>順位</th><th>業種</th><th>金額(兆円)</th><th>構成比</th><th>2013比</th></tr>";
  D.jind.records.forEach(function(r){
    var trn=r.y2023Oku/10000, sh=trn/jm.totalTrn2023*100, g=r.growthPct;
    h+="<tr class='click jRow' data-j='"+r.rank+"'><td class='num'>"+r.rank+"</td><td style='font-weight:700'>"+esc(r.name)+"</td><td class='num'>"+nf(trn,1)+"</td><td>"+bar(sh,"#3aa564",12)+"<span style='font-size:11px'>"+nf(sh,1)+"%</span></td><td class='num "+(g>=121.7?"pos":g<100?"neg":"")+"'>"+g+"%</td></tr>";
  });
  h+="<tr><td></td><td style='font-weight:700;color:#8a5a12'>"+esc(jm.adjustment.label)+"</td><td class='num'>"+jm.adjustment.valueTrn+"</td><td colspan='2' style='font-size:11px;color:#6a7b8b'>"+esc(jm.adjustment.note)+"</td></tr></table>";
  h+=srcLine(["出典: "+S(jm.source)+"（利用者整理）","単位: 名目・兆円","2013比>121.7%=全体平均より高成長"]);
  h+="</div>";
  var pm=D.pref.meta;
  var sorters={gdp:function(a,b){return b.gdpMilYen-a.gdpMilYen;},pop:function(a,b){return b.pop-a.pop;},pc:function(a,b){return b.perCapMan-a.perCapMan;}};
  var recs=D.pref.records.slice().sort(sorters[state.prefSort]);
  h+="<div class='card'><h2>都道府県別ランキング（47）<span class='statusChip'>"+esc(pm.status)+"</span></h2>";
  h+="<div class='chipRow'>"+[["gdp","GDP順"],["pop","人口順"],["pc","一人当たりGDP順"]].map(function(x){return "<button class='mchip"+(state.prefSort===x[0]?" on":"")+"' data-ps='"+x[0]+"'>"+x[1]+"</button>";}).join("")+"</div>";
  h+="<div class='flow-note'>⚠ "+esc(pm.warning)+"</div>";
  h+="<table class='t'><tr><th>#</th><th>都道府県</th><th>GDP(兆円)</th><th></th><th>人口(万人)</th><th>一人当たり(万円)</th><th>全国順位</th></tr>";
  recs.forEach(function(r,i){
    var trn=r.gdpMilYen/1e6;
    h+="<tr class='click pRow"+(state.pref===r.name?" sel":"")+"' data-p='"+esc(r.name)+"'><td class='num'>"+(i+1)+"</td><td style='font-weight:700'>"+esc(r.name)+"</td><td class='num'>"+nf(trn,1)+"</td><td>"+bar(trn,"#2b7d8c",120)+"</td><td class='num'>"+nf(r.pop/1e4,0)+"</td><td class='num'>"+nf(r.perCapMan,1)+"</td><td class='num'>"+r.perCapRank+"位</td></tr>";
  });
  h+="</table>"+srcLine(["合計 約"+pm.sumTrn+"兆円（国民経済計算591.5兆とは基準差）","照合先: "+S(pm.crossCheck),"クリック→右パネルに産業構成（県内順位・全国平均との差）"]);
  h+="</div></div>";
  return h;
}
function prefAvg(){ // 単純平均（47県）
  if(D._pavg) return D._pavg;
  var cols=D.pref.industryCols, avg={};
  cols.forEach(function(c){ var s=0; D.pref.records.forEach(function(r){ s+=r.industriesPct[c]||0; }); avg[c]=s/D.pref.records.length; });
  D._pavg=avg; return avg;
}
function showPref(name){
  var r=D.pref.records.find(function(x){return x.name===name;}); if(!r)return;
  state.pref=name;
  var avg=prefAvg();
  var pairs=D.pref.industryCols.map(function(c){return [c,r.industriesPct[c]||0];}).filter(function(p){return p[1]>0;}).sort(function(a,b){return b[1]-a[1];});
  var h="<p style='font-size:13px'><b>GDP</b> "+nf(r.gdpMilYen/1e6,1)+"兆円（全国"+r.rank+"位）｜<b>人口</b> "+nf(r.pop/1e4,0)+"万人｜<b>一人当たり</b> "+nf(r.perCapMan,1)+"万円（全国"+r.perCapRank+"位）</p>";
  h+="<h3 style='color:var(--blueD);font-size:13px'>産業構成（県内比率順・全国平均との差つき）</h3><table class='t'><tr><th>#</th><th>産業</th><th>構成比</th><th>vs全国平均</th></tr>";
  pairs.forEach(function(p,i){ var d=p[1]-avg[p[0]];
    h+="<tr><td class='num'>"+(i+1)+"</td><td>"+esc(p[0])+"</td><td>"+bar(p[1],"#2b7d8c",25)+"<span class='num' style='font-size:11px'>"+p[1]+"%</span></td><td class='num "+(d>1?"pos":d<-1?"neg":"")+"'>"+(d>0?"+":"")+nf(d,1)+"pt</td></tr>"; });
  h+="</table><div class='src'>全国平均＝47都道府県の単純平均。対象年: "+esc(D.pref.meta.period)+"（照合待ち）｜出典: 利用者提供＋"+S(D.pref.meta.crossCheck)+"</div>";
  openInsp(r.name,h);
  document.querySelectorAll(".pRow").forEach(function(tr){ tr.classList.toggle("sel",tr.dataset.p===name); });
}

// ---------- view 4: 財政・社会保障 ----------
function payBars(b,a,maxV){
  return "<div class='pair'><span class='lbl'>予算</span>"+bar(b,"#9ab6d4",maxV)+"<span class='num'>"+nf(b,1)+"兆</span></div>"+
         "<div class='pair'><span class='lbl'>実績</span>"+bar(a,"#e0663a",maxV)+"<span class='num'>"+nf(a,1)+"兆</span></div>";
}
function fiscTable(items,total){
  var maxV=Math.max.apply(null,items.map(function(x){return Math.max(x.budget,x.actual);}));
  var h="<table class='t'><tr><th>項目</th><th>予算→実績（兆円）</th><th>差額</th><th>構成比(実績)</th></tr>";
  items.forEach(function(x){ var d=x.actual-x.budget;
    h+="<tr><td style='font-weight:800'>"+x.icon+" "+esc(x.name)+(x.isResidual?"<span class='statusChip'>残余</span>":"")+"<div style='font-size:11px;color:#5a6f82;font-weight:400;max-width:330px'>"+esc(x.desc)+"</div></td>"+
       "<td style='min-width:200px'>"+payBars(x.budget,x.actual,maxV)+"</td>"+
       "<td class='num "+(d>0?"neg":"pos")+"'>"+(d>0?"+":"")+nf(d,1)+"兆</td>"+
       "<td class='num'>"+nf(x.actual/total*100,1)+"%</td></tr>"; });
  return h+"</table>";
}
function vFiscal(){
  var F=D.fisc, t=F.totals;
  var h="<div class='grid'>";
  h+="<div class='card'><h2>一般会計 "+esc(F.meta.period)+"：予算と実績を並べる<span class='statusChip'>"+esc(F.meta.status)+"</span></h2>";
  h+="<div class='two'><div><h3>総額</h3>"+payBars(t.budget,t.actual,t.actual)+
     "<p style='font-size:12.5px'>予算114.4兆 → 実績127.6兆（<b class='neg'>+13.2兆</b>）。差の主因は補正予算で、財源は公債金の増発（35.6→43.9兆）。</p></div>"+
     "<div><h3>フローとストックを混同しない</h3><div class='flow-note'>💡 <b>公債金 43.9兆円</b>＝2023年度に新しく借りた「単年のフロー」。<br><b>債務残高 約1,324兆円</b>（2025年3月末）＝過去の借金の「累積ストック」。<br>この2つは別物。フローが続く限りストックは増える。</div></div></div>";
  h+="<h3>歳出（使う）</h3>"+fiscTable(F.expenditure,t.actual);
  h+="<h3>歳入（集める）</h3>"+fiscTable(F.revenue,t.actual);
  h+=srcLine(["出典: "+S(F.meta.source)+"（"+esc(F.meta.note).slice(0,60)+"…）"]);
  h+="</div>";
  // 社会保障
  var SS=D.soc;
  h+="<div class='card'><h2>社会保障関係費 "+SS.totalTrn+"兆円の中身と資金フロー</h2>";
  h+="<details class='acc' open><summary>内訳（年金・医療・介護・少子化/福祉）</summary><div class='bd'><table class='t'><tr><th>区分</th><th>金額</th><th>構成比</th><th>説明</th></tr>";
  SS.breakdown.forEach(function(b){
    h+="<tr><td style='font-weight:800'>"+esc(b.name)+"</td><td class='num'>"+nf(b.trn,1)+"兆円</td><td>"+bar(b.trn/SS.totalTrn*100,"#e0663a",60)+"<span style='font-size:11px'>"+nf(b.trn/SS.totalTrn*100,0)+"%</span></td><td style='font-size:12px;color:#5a6f82'>"+esc(b.desc||"")+
      (b.children? "<ul style='margin:4px 0 0;padding-left:16px'>"+b.children.map(function(c){return "<li><b>"+esc(c.name)+"</b> "+(c.approx?"約":"")+c.trn+"兆：" + esc(c.desc)+"</li>";}).join("")+"</ul>":"")+
      (b.context? "<div class='flow-note' style='margin-top:6px'><b>"+esc(b.context.name)+"</b>＝"+b.context.flows.map(function(f){return esc(f[0])+" "+esc(f[1]);}).join(" ＋ ")+"</div>":"")+"</td></tr>";
  });
  h+="</table></div></details>";
  h+="<details class='acc' open><summary>医療費 約"+SS.medical.totalTrn+"兆円の資金フロー（財源→支出）</summary><div class='bd'>"+medFlowSvg()+
     "<div class='flow-note'>🏛️ <b>地方交付税（"+nf(SS.kofu.totalTrn,1)+"兆円）との関係</b>："+esc(SS.kofu.flowNote)+"</div>"+
     "<table class='t'><tr><th>交付税の内訳</th><th>金額</th><th>説明</th></tr>"+
     SS.kofu.items.map(function(k){return "<tr><td style='font-weight:700'>"+esc(k.name)+"</td><td class='num'>"+(k.approx?"約":"")+k.trn+"兆円</td><td style='font-size:12px;color:#5a6f82'>"+esc(k.desc)+"</td></tr>";}).join("")+"</table>"+
     srcLine(["出典: "+S(SS.meta.source)+"・"+S(SS.meta.crossCheck)+"（利用者整理・概算）","対象年: "+SS.meta.period])+"</div></details>";
  h+="</div>";
  // 国債
  var B=F.bond;
  h+="<div class='card'><h2>国債：発行→償還→残高（つながりで読む）</h2><div class='two'>";
  h+="<div><h3>発行（2023年度・総額"+B.issuanceTotalTrn+"兆円）</h3><table class='t'>"+B.issuance.map(function(x){return "<tr><td style='font-weight:700'>"+esc(x.name)+"</td><td class='num'>"+nf(x.trn,1)+"兆</td><td style='font-size:11.5px;color:#5a6f82'>"+esc(x.desc)+"</td></tr>";}).join("")+"</table></div>";
  h+="<div><h3>満期償還（元本 約"+B.maturityTrn+"兆円の処理）</h3><table class='t'>"+B.maturity.map(function(x){return "<tr><td style='font-weight:700'>"+esc(x.name)+"</td><td class='num'>"+nf(x.trn,1)+"兆</td><td style='font-size:11.5px;color:#5a6f82'>"+esc(x.desc)+"</td></tr>";}).join("")+"</table>"+
     "<h3>歳出に出る国債費（25.2兆）</h3><table class='t'>"+B.kosaihi.map(function(x){return "<tr><td style='font-weight:700'>"+esc(x.name)+"</td><td class='num'>約"+x.trn+"兆</td><td style='font-size:11.5px;color:#5a6f82'>"+esc(x.desc)+"</td></tr>";}).join("")+"</table></div></div>";
  h+="<h3>債務残高（ストック）の推移</h3><table class='t'><tr>"+B.stock.points.map(function(p){return "<td class='num' style='font-size:15px;font-weight:900'>"+p.date+"<br>約"+nf(p.trn,1)+"兆円"+(p.note?"<span class='statusChip'>"+p.note+"</span>":"")+"</td>";}).join("")+"</tr></table>";
  h+="<div class='src'>"+esc(B.stock.note)+" ｜ 定義: "+esc(B.stock.definition)+" ｜ 出典: "+S(B.stock.source)+"</div>";
  h+="</div></div>";
  return h;
}
function medFlowSvg(){
  var M=D.soc.medical;
  var srcs=M.sources, uses=M.uses;
  var W=760,H=290;
  var s="<svg viewBox='0 0 "+W+" "+H+"' style='width:100%;height:auto' role='img' aria-label='医療費の資金フロー図'>";
  var colors={"保険料":"#2a6fb5","公費":"#e0663a","自己負担":"#8a6fbf"};
  var y=16;
  srcs.forEach(function(f){
    var hgt=54;
    s+="<rect x='8' y='"+y+"' width='218' height='"+hgt+"' rx='8' fill='#fff' stroke='"+colors[f.kind]+"' stroke-width='2'/>";
    s+="<text x='16' y='"+(y+18)+"' font-size='12' font-weight='800' fill='"+colors[f.kind]+"'>"+esc(f.name)+" 約"+f.trn+"兆"+(f.sharePct?"（"+f.sharePct+"%）":"")+"</text>";
    s+="<text x='16' y='"+(y+34)+"' font-size='9.5' fill='#5a6f82'>"+esc(f.desc.slice(0,26))+"</text>";
    s+="<text x='16' y='"+(y+46)+"' font-size='9.5' fill='#5a6f82'>"+esc(f.desc.slice(26,52))+"</text>";
    var lbl=f.kind==="公費"?(f.name.indexOf("地方")>=0?"一般財源から（地方負担）":"一般会計から（国庫）"):f.kind;
    s+="<line x1='226' y1='"+(y+hgt/2)+"' x2='320' y2='145' stroke='"+colors[f.kind]+"' stroke-width='2.5' opacity='.7'/>";
    s+="<text x='232' y='"+(y+hgt/2-4)+"' font-size='9' fill='"+colors[f.kind]+"' font-weight='700'>"+esc(lbl)+"</text>";
    y+=hgt+12;
  });
  s+="<rect x='320' y='105' width='130' height='80' rx='12' fill='#1c548c'/><text x='385' y='138' font-size='13' font-weight='900' fill='#fff' text-anchor='middle'>国民医療費</text><text x='385' y='158' font-size='15' font-weight='900' fill='#fff' text-anchor='middle'>約"+M.totalTrn+"兆円</text>";
  var y2=30;
  uses.forEach(function(u){
    s+="<line x1='450' y1='145' x2='540' y2='"+(y2+22)+"' stroke='#3aa564' stroke-width='2.5' opacity='.7'/>";
    s+="<rect x='540' y='"+y2+"' width='210' height='44' rx='8' fill='#fff' stroke='#3aa564' stroke-width='2'/>";
    s+="<text x='550' y='"+(y2+18)+"' font-size='12' font-weight='800' fill='#2e6b47'>"+esc(u.name)+"</text>";
    s+="<text x='550' y='"+(y2+34)+"' font-size='11' fill='#5a6f82'>約"+u.trn+"兆円（"+u.pct+"%）</text>";
    y2+=58;
  });
  s+="</svg><div class='src'>矢印ラベル＝お金の性質（保険料／国庫＝一般会計／地方負担＝使途自由の一般財源から／自己負担）。1対1の目的財源ではない点に注意。対象年: "+esc(M.period)+"</div>";
  return s;
}

// ---------- view 5: 推移・示唆 ----------
function chartSvg(series){
  var pts=series.points, W=340, H=170, pad=34;
  var ys=pts.map(function(p){return p.y;});
  var ymin=0, ymax=Math.max.apply(null,ys)*1.15;
  var n=pts.length;
  var s="<svg viewBox='0 0 "+W+" "+H+"' style='width:100%;height:auto'>";
  s+="<text x='6' y='14' font-size='11' font-weight='800' fill='#1c548c'>"+esc(series.name)+"（"+esc(series.unit)+"）</text>";
  var bw=Math.min(56,(W-pad*2)/n*0.6);
  pts.forEach(function(p,i){
    var x=pad+(W-pad*2)*(n===1?0.5:i/(n-1));
    var h=(p.y-ymin)/(ymax-ymin)*(H-58);
    s+="<rect x='"+(x-bw/2)+"' y='"+(H-30-h)+"' width='"+bw+"' height='"+h+"' rx='4' fill='#2a6fb5' opacity='.85'/>";
    s+="<text x='"+x+"' y='"+(H-34-h)+"' font-size='10' font-weight='800' text-anchor='middle' fill='#1c548c'>"+nf(p.y,1)+"</text>";
    s+="<text x='"+x+"' y='"+(H-14)+"' font-size='9.5' text-anchor='middle' fill='#5a6f82'>"+esc(p.x)+(p.note?"※":"")+"</text>";
  });
  s+="</svg>";
  return s;
}
function vTrends(){
  var T=D.tl;
  var h="<div class='grid'><div class='card'><h2>推移（現在保有している系列）<span class='statusChip'>"+esc(T.meta.status)+"</span></h2><div class='cty-grid'>";
  T.series.forEach(function(sr){ h+="<div class='card' style='box-shadow:none'>"+chartSvg(sr)+"<div class='src'>出典: "+S(sr.source)+(sr.note?" ｜ "+esc(sr.note):"")+"</div></div>"; });
  h+="</div><div class='src'>産業別の2013→2023比較は「3. 日本の経済」の表（2013比列）でも確認可能。都道府県の推移系列は公表年が揃い次第追加。</div></div>";
  var I=T.insights;
  h+="<div class='card'><h2>事実から分けた示唆</h2>";
  h+="<div class='insight obs'><b class='ttl'>👀 このデータから読める観察（事実ベース）</b>"+I.observations.map(function(x){return "・"+esc(x);}).join("<br>")+"</div>";
  h+="<div class='insight cau'><b class='ttl'>⚠ 判断を急がないための注意</b>"+I.cautions.map(function(x){return "・"+esc(x);}).join("<br>")+"</div>";
  h+="<div class='insight q'><b class='ttl'>❓ 次に確かめる問い</b>"+I.questions.map(function(x){return "・"+esc(x);}).join("<br>")+"</div>";
  h+="</div></div>";
  return h;
}

// ---------- view 6: 地政学・関係線 ----------
function vGeo(){
  var types=D.geo.meta.types;
  var h="<div class='grid'><div class='card'><h2>関係線マップ<span class='statusChip'>"+esc(D.geo.meta.status)+"</span></h2>";
  h+="<div class='legendGeo'>"+Object.keys(types).map(function(k){var t=types[k];
    return "<label style='cursor:pointer'><input type='checkbox' class='geoF' data-g='"+k+"' "+(state.geoFilter[k]?"checked":"")+"> <i style='background:"+t.color+"'></i>"+t.label+"</label>";}).join("")+"</div>";
  h+="<div id='gmap' class='map-wrap' style='height:400px'></div>";
  h+=srcLine(["as of "+D.geo.meta.asOf,"出典: "+S(D.geo.meta.source)+"（概説）","地図: © OpenStreetMap contributors"]);
  h+="</div><div class='card'><h2>関係の一覧（種類・時点・出典つき）</h2><table class='t'><tr><th>種類</th><th>関係</th><th>国</th><th>説明</th></tr>";
  D.geo.relations.forEach(function(r){ if(!state.geoFilter[r.type])return;
    var t=types[r.type], a=cty(r.a), b=cty(r.b);
    h+="<tr><td><span style='font-size:11px;font-weight:800;color:"+t.color+"'>"+t.label+"</span></td><td style='font-weight:800'>"+esc(r.label)+"</td><td>"+a.flag+"—"+b.flag+"</td><td style='font-size:12px;color:#5a6f82'>"+esc(r.desc)+"<br><span class='src'>as of "+r.asOf+" ｜ "+S(r.source)+"</span></td></tr>"; });
  h+="</table></div>";
  h+="<div class='card'><h2>読み物：世界を読む5つの視点（事実と論点の整理）</h2>";
  D.geo.essays.forEach(function(e_){ h+="<details class='acc'><summary>"+esc(e_.title)+"</summary><div class='bd'><p style='font-size:13px;line-height:1.9'>"+esc(e_.body)+"</p></div></details>"; });
  h+="<div class='src'>これらは公開情報の整理・論点であり、特定の立場を断定する解説ではない。</div></div></div>";
  return h;
}
var gmapObj=null;
function mountGeoMap(){
  var el=document.getElementById("gmap"); if(!el||!window.L)return;
  gmapObj=L.map(el,{scrollWheelZoom:false}).setView([30,20],1.6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:6,attribution:"© OpenStreetMap contributors"}).addTo(gmapObj);
  var types=D.geo.meta.types;
  D.countries.records.forEach(function(c){
    L.circleMarker(c.ll,{radius:6,color:c.color,fillColor:c.color,fillOpacity:.8,weight:1.5}).addTo(gmapObj).bindTooltip(c.flag+" "+c.name);
  });
  D.geo.relations.forEach(function(r){ if(!state.geoFilter[r.type])return;
    var a=cty(r.a), b=cty(r.b), t=types[r.type];
    var line=L.polyline([a.ll,b.ll],{color:t.color,weight:2.6,opacity:.75,dashArray:r.type==="tension"?"6 6":null}).addTo(gmapObj);
    line.bindTooltip("<b>"+esc(r.label)+"</b><br><span style='font-size:11px'>"+esc(r.desc)+"</span><br><span style='font-size:10px;color:#888'>"+t.label+" / as of "+r.asOf+"</span>",{sticky:true});
  });
}

// ---------- event binding ----------
function bindView(m){
  m.querySelectorAll("[data-m]").forEach(function(b){ b.addEventListener("click",function(){ state.metric=b.dataset.m; render(); }); });
  m.querySelectorAll(".cRow,[data-c].cty,[data-c].mchip").forEach(function(el){ el.addEventListener("click",function(){
    if(state.tab==="country"){ state.country=el.dataset.c; render(); } else selectCountry(el.dataset.c); }); });
  m.querySelectorAll("[data-ct]").forEach(function(b){ b.addEventListener("click",function(){ state.ctyTab=b.dataset.ct; render(); }); });
  m.querySelectorAll("[data-ps]").forEach(function(b){ b.addEventListener("click",function(){ state.prefSort=b.dataset.ps; render(); }); });
  m.querySelectorAll(".pRow").forEach(function(tr){ tr.addEventListener("click",function(){ showPref(tr.dataset.p); }); });
  m.querySelectorAll(".jRow").forEach(function(tr){ tr.addEventListener("click",function(){
    var r=D.jind.records[parseInt(tr.dataset.j,10)-1];
    openInsp(r.rank+"位 "+r.name,
      "<p style='font-size:14px'><b>2023年</b> "+nf(r.y2023Oku/10000,1)+"兆円（構成比 "+nf(r.y2023Oku/10000/D.jind.meta.totalTrn2023*100,1)+"%）<br><b>2013年</b> "+nf(r.y2013Oku/10000,1)+"兆円 → <b class='"+(r.growthPct>=100?"pos":"neg")+"'>"+r.growthPct+"%</b>（全体平均121.7%）</p>"+
      "<div class='flow-note'>要因（一般に言われる背景の整理）："+esc(r.reason)+"</div>"+
      "<div class='src'>出典: "+S(D.jind.meta.source)+"（利用者整理・名目値）。名目の伸びには物価・円安の影響を含む。</div>");
  }); });
  m.querySelectorAll(".geoF").forEach(function(cb){ cb.addEventListener("change",function(){ state.geoFilter[cb.dataset.g]=cb.checked; render(); }); });
  if(state.tab==="world") mountWorldMap();
  if(state.tab==="geo") mountGeoMap();
}
})();
