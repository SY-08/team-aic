/* シナジーMAP マインドマップ本体：data/synergy/*.json を1枚の連結ツリーに。シナジー/マップ 2モード。*/
(function(){
"use strict";
var RATE=150, uid=0;
var C={root:"#1c548c",ind:"#3aa564",out:"#e0663a",inc:"#2a6fb5",debt:"#5b4a66",geo:"#7a6a4f",cty:"#2a6fb5"};
var FILES=["sources","countries","country-debt","country-industries","japan-industries","prefectures","national-fiscal","social-security","timelines","geopolitical-relations"];
var D={}, DATA=null, SYN=[];
function N(o){o.id="n"+(uid++);o.open=false;o.children=o.children||[];return o;}
function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function nf(x,d){if(x==null||isNaN(x))return"-";return Number(x).toLocaleString(undefined,{maximumFractionDigits:d==null?1:d});}
function yenTrn(u){return Math.round(u*RATE);}
function sgn(v){if(v==null)return"-";return "<span class='"+(v>0?"pos":v<0?"neg":"")+"'>"+(v>0?"+":"")+v+"%</span>";}
function cty(id){return D.countries.records.find(function(c){return c.id===id;});}

Promise.all(FILES.map(function(f){return fetch("data/synergy/"+f+".json").then(function(r){if(!r.ok)throw new Error(f);return r.json();});}))
.then(function(a){D.sources=a[0];D.countries=a[1];D.debt=a[2];D.cind=a[3];D.jind=a[4];D.pref=a[5];D.fisc=a[6];D.soc=a[7];D.tl=a[8];D.geo=a[9];boot();})
.catch(function(e){document.body.insertAdjacentHTML("beforeend","<div class='err'><div><b>データファイルを読み込めませんでした（"+esc(e.message)+".json）。</b><br>公開ページ <b>https://sy-08.github.io/team-aic/world-map.html</b> で開いてください（ローカルのfile://直開きはブラウザ制限で不可）。</div></div>");});

/* ---------- tree builders ---------- */
function pcUsd(c){return Math.round(c.gdpUsdTrn*1e6/c.popM/100)*100;}
function buildJapan(){
  var jm=D.jind.meta, F=D.fisc, SS=D.soc, B=F.bond;
  // 生産：産業ランキング
  var indKids=D.jind.records.map(function(r){var t=r.y2023Oku/10000;
    return N({label:r.rank+"位 "+r.name,val:nf(t,1),unit:"兆円",color:C.ind,
      note:"2013年 "+nf(r.y2013Oku/10000,1)+"兆円 → 2023年 "+nf(t,1)+"兆円（成長率"+r.growthPct+"%／全体平均121.7%）。"+r.reason});});
  indKids.push(N({label:jm.adjustment.label,val:"約"+jm.adjustment.valueTrn,unit:"兆円",color:C.ind,note:jm.adjustment.note}));
  // 都道府県ランキング
  var avg={}; D.pref.industryCols.forEach(function(col){var s=0;D.pref.records.forEach(function(r){s+=r.industriesPct[col]||0;});avg[col]=s/D.pref.records.length;});
  var prefKids=D.pref.records.map(function(r){var t=r.gdpMilYen/1e6;
    var pairs=D.pref.industryCols.map(function(col){return[col,r.industriesPct[col]||0];}).filter(function(p){return p[1]>0;}).sort(function(a,b){return b[1]-a[1];});
    var top=pairs.slice(0,5).map(function(p){return p[0]+" "+p[1]+"%";}).join("・");
    return N({label:r.rank+"位 "+r.name,val:(t<100?nf(t,1):nf(t,0)),unit:"兆円",color:"#2b7d8c",
      note:"人口"+nf(r.pop/1e4,0)+"万人・1人あたり"+r.perCapMan+"万円（全国"+r.perCapRank+"位）｜産業構成トップ5: "+top});});
  var prod=N({key:"gdp",label:"① 生産＝GDP "+jm.totalTrn2023+"兆円（2023）",val:String(jm.totalTrn2023),unit:"兆円",color:C.ind,
    note:"日本国内で1年に生み出した付加価値。2013年486.2兆→2023年591.5兆（+21.7%）。産業別と都道府県別の2つの切り口で分解。出典：内閣府 国民経済計算・県民経済計算。",
    children:[
      N({label:"産業別ランキング（36分類・2013→2023推移つき）",val:String(jm.totalTrn2023),unit:"兆円",color:C.ind,note:"大きい順。開くと各業種の金額・GDP比・成長率・要因。",children:indKids}),
      N({label:"都道府県別ランキング（47・県民経済計算）",val:"約"+D.pref.meta.sumTrn,unit:"兆円",color:"#2b7d8c",note:"生産GDPを都道府県で分解。各県に1人あたり(全国順位)と産業構成トップ5。※国民経済計算591.5兆とは基準差。"+D.pref.meta.warning,children:prefKids}),
      N({label:"時代の示唆：10年で何が伸び何が縮んだか",color:C.gold,note:D.tl.insights.observations.join(" / ")})
    ]});
  // 財政：歳出
  function fiscNode(x){return N({label:x.icon+" "+x.name,val:nf(x.actual,1),unit:"兆円",plan:x.budget,color:x.id==="bond"?C.debt:(x.id==="kofu"?C.inc:C.out),note:x.desc,key:x.id==="social"?"sec":(x.id==="bond"?"out-bond":(x.id==="kofu"?"kofu":null))});}
  var expKids=F.expenditure.map(fiscNode);
  // 社会保障 内訳を 社会保障ノードにぶら下げ
  var secNode=expKids.find(function(n){return n.key==="sec";});
  if(secNode){ secNode.children=SS.breakdown.map(function(b){
      var ch=(b.children||[]).map(function(c){return N({label:c.name,val:(c.approx?"約":"")+c.trn,unit:"兆円",color:C.out,note:c.desc});});
      var node=N({label:b.name,val:nf(b.trn,1),unit:"兆円",color:C.out,note:(b.desc||"")+(b.context?" 【全体像】"+b.context.name+"＝"+b.context.flows.map(function(f){return f[0]+" "+f[1];}).join("＋"):""),children:ch,key:b.name.indexOf("医療")>=0?"med":null});
      return node; });
  }
  // 国債費 内訳
  var bondExp=expKids.find(function(n){return n.key==="out-bond";});
  if(bondExp){ bondExp.children=B.kosaihi.map(function(x){return N({label:x.name,val:"約"+x.trn,unit:"兆円",color:C.debt,note:x.desc});}); }
  // 交付税 内訳
  var kofuExp=expKids.find(function(n){return n.key==="kofu";});
  if(kofuExp){ kofuExp.children=SS.kofu.items.map(function(k){return N({label:k.name,val:(k.approx?"約":"")+k.trn,unit:"兆円",color:C.inc,note:k.desc});}); }
  var revKids=F.revenue.map(function(x){return N({label:x.icon+" "+x.name,val:nf(x.actual,1),unit:"兆円",plan:x.budget,color:x.id==="newbond"?C.debt:C.inc,note:x.desc,key:x.id==="newbond"?"inc-bond":null});});
  var fisc=N({key:"fisc",label:"② 財政（2023年度・予算→実績）",unit:"兆円",color:C.out,
    note:"国のお金の使い方(歳出)と集め方(歳入)。全項目を予算→実績で。予算114.4兆→実績127.6兆の差は補正＋公債金の増発(35.6→43.9兆)。出典：財務省。",
    children:[
      N({key:"out",label:"歳出（使う）実績 "+nf(F.totals.actual,1),val:nf(F.totals.actual,1),unit:"兆円",plan:F.totals.budget,color:C.out,note:"国が使ったお金。予算114.4兆→実績127.6兆。",children:expKids}),
      N({key:"inc",label:"歳入（集める）実績 "+nf(F.totals.actual,1),val:nf(F.totals.actual,1),unit:"兆円",plan:F.totals.budget,color:C.inc,note:"どこから来たか。予定114.4兆→実績127.6兆。",children:revKids})
    ]});
  // 借金
  var debtNode=N({key:"debt",label:"③ 国債と債務残高",val:"約"+nf(B.stock.points[1].trn,0),unit:"兆円",color:C.debt,
    note:"毎年の公債金が積み上がった残高。2025年3月末 約"+nf(B.stock.points[1].trn,0)+"兆円＝GDPの約2.2倍。世界最悪水準。"+B.stock.note,
    children:[
      N({key:"issue",label:"発行（2023年度・総額"+B.issuanceTotalTrn+"兆円）",val:String(B.issuanceTotalTrn),unit:"兆円",color:C.debt,note:"1年で発行した国債の総額。新規の借金だけでなく借金の付け替え(借換債)も含む。",
        children:B.issuance.map(function(x){return N({label:x.name,val:nf(x.trn,1),unit:"兆円",color:C.debt,note:x.desc,key:x.name.indexOf("新規")>=0?"issue-new":null});})}),
      N({key:"manki",label:"満期償還（元本 約"+B.maturityTrn+"兆円の処理）",val:"約"+B.maturityTrn,unit:"兆円",color:C.debt,note:"満期が来て返す義務が生じた元本。返し方は2つ。",
        children:B.maturity.map(function(x){return N({label:x.name,val:nf(x.trn,1),unit:"兆円",color:C.debt,note:x.desc});})}),
      N({label:"残高の推移",color:C.debt,note:B.stock.points.map(function(p){return p.date+" 約"+nf(p.trn,1)+"兆円"+(p.note?"("+p.note+")":"");}).join(" → ")+"。"+B.stock.note})
    ]});
  var shisa=N({label:"日本の示唆・課題 🇯🇵",color:C.gold,note:"【課題】重化学工業依存の後の空白（家電はサムスン・LG、半導体はTSMC・サムスンにシェアを奪われた）／IT・半導体・デジタルでの出遅れ（GAFA・BATに完敗）／国の看板産業の不在。【強み】ゲーム・アニメ（輸出シェア6割超）・漫画（世界最大市場）・ロボット（産業用シェア世界首位=FANUC・安川・川重）＝『エンタメ文化×精密工学』は唯一無二。ロボットの原点は鉄腕アトム(1952)→WABOT-1(1973 世界初の人型)→ASIMO——文化が技術を生む国。→円安・高齢化需要頼みから『次の柱』をどう作るか。"});
  return [prod,fisc,debtNode,shisa];
}
function buildCountry(c){
  var node=N({key:c.id,label:c.flag+" "+c.name,val:String(c.gdpUsdTrn),unit:"兆ドル",pop:+(c.popM/100).toFixed(2),popM:c.popM,popRank:c.popRankWorld,pg:c.pgPct,gg:c.ggPct,pg10:c.pg10Pct,ll:c.ll,color:c.color,note:"地政学："+c.geoNote});
  var d=D.debt.records[c.id]; if(d){node.debtY=d.debtYenTrn;node.debtR=d.debtGdpPct;}
  var ci=D.cind.records[c.id], kids=[];
  if(ci){
    kids.push(N({label:"主要産業（国内順位）",color:"#8a6fbf",note:"国内での存在感が大きい順。",children:ci.majors.map(function(m){return N({label:m.rank+"位 "+m.name,color:"#8a6fbf",note:m.desc});})}));
    var s3=ci.sectors3; kids.push(N({label:"GDP構成（3分類・"+D.cind.meta.sectors.period+"）",color:"#6a5fa0",note:"国際比較用の共通分類。"+D.cind.meta.sectors.status,
      children:[N({label:"サービス",val:String(s3["サービス"]),unit:"%",color:"#2a6fb5"}),N({label:"工業・建設",val:String(s3["工業・建設"]),unit:"%",color:"#3aa564"}),N({label:"農林水産",val:String(s3["農林水産"]),unit:"%",color:"#c9a13a"})]}));
  }
  if(c.id==="jp") kids=kids.concat(buildJapan());
  node.children=kids;
  return node;
}
function buildTree(){
  var geoNode=N({label:"🌐 世界の見方（気候・地政学・歴史）",color:C.geo,note:"国の数字の『なぜ』を読み解くレンズ。開くと5つの視点。",
    children:D.geo.essays.map(function(e){return N({label:e.title,color:C.geo,note:e.body});})});
  var countries=D.countries.records.map(buildCountry);
  var other=N({label:"その他の国々",val:"約26",unit:"兆ドル",color:"#9aa7b4",note:"上位15か国以外の合計（世界GDPに足し上げるための残り）。"});
  DATA=N({key:"root",label:"🌍 世界のGDP（名目・2024）",val:"約110",unit:"兆ドル",color:C.root,
    note:"世界全体が1年で生み出した価値。出典：IMF/世界銀行/国連。国カードにGDP・円換算・人口・一人当たり・増減率・債務。開くと産業(国内順位)や示唆。日本を開くと生産→財政→借金の全構造へ。点線はお金や関係の『つながり』。右上でマップモードに切替。",
    children:[geoNode].concat(countries).concat([other])});
  SYN=[["inc-bond","issue-new"],["out-bond","manki"],["kofu","med"]];
}

/* ---------- engine ---------- */
var world,stage,svg,COLW=300,CARDW=236,els={},byKey={},scale=1,tx=0,ty=0,map=null;
function num(v){if(v==null)return null;var n=parseFloat(String(v).replace(/[^0-9.]/g,""));return isNaN(n)?null:n;}
function precompute(node,parent){node._parent=parent;node._num=num(node.val);var pv=parent?parent._num:null;
  var sameU=parent&&((parent.unit||"兆円")===(node.unit||"兆円"));
  if(pv&&node._num!=null&&sameU){node._share=node._num/pv;node._pct=Math.round(node._share*100);}else node._share=null;
  node.children.forEach(function(c){precompute(c,node);});}
function metricsHtml(node){
  if(node.gg!==undefined&&node.popM){var pc=Math.round(node._num*1e4/(node.popM/100)/100)*100;var pcy=Math.round(pc*RATE/1e4);
    return "<div class='mg'><div><b>人口(世界"+(node.popRank||"-")+"位)</b>"+nf(node.popM,0)+"百万人</div><div><b>一人当たりGDP</b>$"+nf(pc,0)+"(約"+nf(pcy,0)+"万円)</div>"+
      "<div><b>人口増減(前年/10年)</b>"+sgn(node.pg)+"/"+sgn(node.pg10)+"</div><div><b>GDP成長率</b>"+sgn(node.gg)+"</div></div>";}
  return "";}
function yenHtml(node){if((node.unit||"")==="兆ドル"&&node._num!=null)return "<div class='yen'>≈ 日本円 約"+nf(yenTrn(node._num),0)+"兆円</div>";return "";}
function debtHtml(node){if(node.debtY)return "<div class='debtline'>政府債務 約"+nf(node.debtY,0)+"兆円 ・ GDP比 "+node.debtR+"%（2023）</div>";return "";}
function planHtml(node){if(node.plan!=null)return "<div class='plan'>予算 "+nf(node.plan,1)+"兆 → 実績 "+node.val+"兆円</div>";return "";}
function build(node){var d=document.createElement("div");d.className="node"+(node.key==="root"?" root":"");
  var kids=node.children.length;
  var body=node._share!=null
    ? "<div class='valrow'>"+(node.val?"<span class='val'>"+node.val+"<small>"+(node.unit||"兆円")+"</small></span>":"<span></span>")+"<span class='share' style='color:"+node.color+"'>"+node._pct+"%</span></div><div class='barwrap'><i style='width:"+Math.max(2,Math.round(node._share*100))+"%;background:"+node.color+"'></i></div>"
    : (node.val?"<div class='val'>"+node.val+"<small>"+(node.unit||"兆円")+"</small></div>":"");
  d.innerHTML="<div class='card' style='border-color:"+node.color+"'><div class='lbl'>"+node.label+"</div>"+body+yenHtml(node)+metricsHtml(node)+debtHtml(node)+planHtml(node)+
    "<div class='note'>"+(node.note||"")+"</div>"+(kids?"<div class='kids' data-k>▸ ひらく（"+kids+"）</div>":"")+"</div>";
  world.appendChild(d);els[node.id]=d;if(node.key)byKey[node.key]=node;
  var card=d.querySelector(".card");
  card.addEventListener("click",function(){if(node.ll)flyTo(node.ll);openNode(node);});
  if(node.ll)card.addEventListener("mouseenter",function(){flyTo(node.ll);});
  node.children.forEach(build);}
function closeAll(n){n.open=false;var el=els[n.id];if(el){var cd=el.querySelector(".card");if(cd)cd.classList.remove("open");var k=el.querySelector("[data-k]");if(k&&n.children.length)k.textContent="▸ ひらく（"+n.children.length+"）";}n.children.forEach(closeAll);}
function openNode(node){var card=els[node.id].querySelector(".card");
  var bx=(node._x!=null?node._x*COLW+40:0),by=(node._cy!=null?node._cy+40:0),sbx=bx*scale+tx,sby=by*scale+ty;
  card.classList.toggle("open");
  if(node.children.length){ if(!node.open)node.open=true; else closeAll(node);
    var k=card.querySelector("[data-k]");if(k)k.textContent=(node.open?"▾ とじる（":"▸ ひらく（")+node.children.length+"）"; }
  layout();
  var ax=(node._x*COLW+40)*scale,ay=(node._cy+40)*scale; tx=sbx-ax; ty=sby-ay; applyT();}
function visible(n,a){a.push(n);if(n.open)n.children.forEach(function(c){visible(c,a);});return a;}
function assignPos(node,depth,top){var H=node._h||88,GAP=18;
  if(!node.open||!node.children.length){node._x=depth;node._cy=top+H/2;return H;}
  var cur=top,first=null,last=null;
  node.children.forEach(function(c){var sp=assignPos(c,depth+1,cur);if(first===null)first=c._cy;last=c._cy;cur+=sp+GAP;});
  node._x=depth;node._cy=(first+last)/2;return Math.max(cur-GAP-top,H);}
function xy(n){return {x:n._x*COLW+40,y:n._cy+40};}
function layout(){var vis=visible(DATA,[]);
  for(var id in els)els[id].style.display="none";
  vis.forEach(function(n){els[n.id].style.display="block";});
  vis.forEach(function(n){n._h=els[n.id].offsetHeight||88;});
  assignPos(DATA,0,0);
  var links="";
  vis.forEach(function(n){var el=els[n.id],p=xy(n);el.style.left=p.x+"px";el.style.top=p.y+"px";
    if(n.open)n.children.forEach(function(c){var a=xy(n),b=xy(c),x1=a.x+CARDW,x2=b.x,mx=(x1+x2)/2;
      links+="<path d='M"+x1+","+a.y+" C"+mx+","+a.y+" "+mx+","+b.y+" "+x2+","+b.y+"' stroke='"+c.color+"' stroke-width='2.5' fill='none' opacity='.5'/>";});});
  var vs={};vis.forEach(function(n){vs[n.id]=1;});
  SYN.forEach(function(p){var f=byKey[p[0]],t=byKey[p[1]];if(f&&t&&vs[f.id]&&vs[t.id]){var a=xy(f),b=xy(t),x1=a.x+CARDW,x2=b.x+CARDW,mx=Math.max(x1,x2)+70;
    links+="<path d='M"+x1+","+a.y+" C"+mx+","+a.y+" "+mx+","+b.y+" "+x2+","+b.y+"' stroke='#e0663a' stroke-width='2.4' stroke-dasharray='6 5' fill='none' opacity='.7'/>";}});
  svg.innerHTML=links;
  var mx=0,my=0;vis.forEach(function(n){var p=xy(n);mx=Math.max(mx,p.x+340);my=Math.max(my,p.y+(n._h||88)+40);});
  world.style.width=mx+"px";world.style.height=my+"px";svg.setAttribute("width",mx);svg.setAttribute("height",my);}
function applyT(){world.style.transform="translate("+tx+"px,"+ty+"px) scale("+scale+")";}
function refreshKids(){visible(DATA,[]).forEach(function(n){if(n.children.length){var k=els[n.id].querySelector("[data-k]");if(k)k.textContent=(n.open?"▾ とじる（":"▸ ひらく（")+n.children.length+"）";}});}
function focus(nodes){var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  nodes.forEach(function(n){var p=xy(n);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x+CARDW);minY=Math.min(minY,p.y-40);maxY=Math.max(maxY,p.y+70);});
  var w=maxX-minX,h=maxY-minY,sw=stage.clientWidth,sh=stage.clientHeight-70,pad=28;
  var s=Math.min((sw-pad*2)/w,(sh-pad*2)/h,1.5);s=Math.max(.4,s);scale=s;tx=(sw-w*s)/2-minX*s;ty=70+(sh-h*s)/2-minY*s;applyT();}
function fitAll(){DATA.open=true;DATA.children.forEach(function(c){c.open=false;});refreshKids();layout();focus(visible(DATA,[]));}
function initView(){layout();scale=0.9;tx=100-(40*scale);ty=(stage.clientHeight/2)-((DATA._cy+40)*scale);applyT();}

/* ---------- background map + map mode ---------- */
var mapMarkers=[],mapLines=[],mode="synergy",mapFilter={alliance:true,economy:true,supply:true,tension:true};
function initMap(){try{
  map=L.map("geo",{zoomControl:false,attributionControl:true,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false,tap:false}).setView([25,12],2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:6,attribution:"© OpenStreetMap contributors"}).addTo(map);
}catch(e){}}
function flyTo(ll){if(map&&ll&&mode==="synergy"){map.flyTo(ll,4,{duration:1.0});}}
function buildMapLayer(){
  var types=D.geo.meta.types;
  D.countries.records.forEach(function(c){
    var mk=L.circleMarker(c.ll,{radius:Math.max(6,Math.sqrt(c.gdpUsdTrn)*2.6),color:c.color,fillColor:c.color,fillOpacity:.6,weight:2});
    mk.bindTooltip(c.flag+" "+c.name+"（GDP "+c.gdpUsdTrn+"兆$ / 債務比 "+((D.debt.records[c.id]||{}).debtGdpPct||"-")+"%）");
    mk.on("click",function(){showCountryInfo(c.id);});
    mk._cty=c; mapMarkers.push(mk);
  });
  D.geo.relations.forEach(function(r){var a=cty(r.a),b=cty(r.b),t=types[r.type];
    var ln=L.polyline([a.ll,b.ll],{color:t.color,weight:2.6,opacity:.75,dashArray:r.type==="tension"?"6 6":null});
    ln.bindTooltip("<b>"+esc(r.label)+"</b><br>"+esc(r.desc)+"<br><span style='font-size:10px;color:#888'>"+t.label+" / as of "+r.asOf+"</span>",{sticky:true});
    ln._rel=r; mapLines.push(ln);
  });
  // filter legend
  var fh=""; Object.keys(types).forEach(function(k){var t=types[k];fh+="<label><input type='checkbox' data-g='"+k+"' checked> <i style='background:"+t.color+"'></i>"+t.label+"</label>";});
  document.getElementById("mapFilters").innerHTML=fh;
  document.getElementById("mapFilters").addEventListener("change",function(e){var cb=e.target;if(cb.dataset.g){mapFilter[cb.dataset.g]=cb.checked;drawMapLayer();}});
}
function drawMapLayer(){
  mapMarkers.forEach(function(m){m.addTo(map);});
  mapLines.forEach(function(l){ if(mapFilter[l._rel.type]) l.addTo(map); else map.removeLayer(l); });
}
function clearMapLayer(){mapMarkers.forEach(function(m){map.removeLayer(m);});mapLines.forEach(function(l){map.removeLayer(l);});}
function showCountryInfo(id){var c=cty(id),d=D.debt.records[id]||{},ci=D.cind.records[id]||{majors:[]};
  var pc=Math.round(c.gdpUsdTrn*1e6/c.popM/100)*100;
  var h="<h3>"+c.flag+" "+esc(c.name)+"</h3>"+
    "<p style='font-size:13px;line-height:1.8'><b>GDP</b> "+c.gdpUsdTrn+"兆$（≈"+nf(yenTrn(c.gdpUsdTrn),0)+"兆円）｜<b>人口</b> "+nf(c.popM,0)+"百万人（世界"+c.popRankWorld+"位）｜<b>一人当たり</b> $"+nf(pc,0)+"<br><b>GDP成長率</b> "+sgn(c.ggPct)+"｜<b>人口増減</b> 前年"+sgn(c.pgPct)+"／10年"+sgn(c.pg10Pct)+"｜<b>政府債務</b> 約"+nf(d.debtYenTrn||0,0)+"兆円（GDP比"+((d.debtGdpPct)||"-")+"%）</p>"+
    "<p style='font-size:13px;line-height:1.8'><b>地政学：</b>"+esc(c.geoNote)+"</p>"+
    "<b style='font-size:13px;color:#1c548c'>主要産業</b><ol style='font-size:12.5px;line-height:1.7;margin:4px 0'>"+ci.majors.map(function(m){return "<li>"+esc(m.name)+"："+esc(m.desc)+"</li>";}).join("")+"</ol>"+
    "<b style='font-size:13px;color:#1c548c'>この国の関係線</b><ul style='font-size:12px;line-height:1.7;margin:4px 0'>"+
      D.geo.relations.filter(function(r){return r.a===id||r.b===id;}).map(function(r){var o=cty(r.a===id?r.b:r.a);return "<li>["+D.geo.meta.types[r.type].label+"] "+esc(r.label)+"（"+o.flag+o.name+"）</li>";}).join("")+"</ul>"+
    "<div style='font-size:11px;color:#6a7b8b'>出典：IMF/世界銀行/国連/外務省（概算・1$="+RATE+"円）</div>";
  document.getElementById("infoBody").innerHTML=h;
  document.getElementById("infoOv").classList.add("on");
}
function setMode(m){mode=m;
  document.body.classList.toggle("mapmode",m==="map");
  document.querySelectorAll("#modeSw button").forEach(function(b){b.classList.toggle("on",b.dataset.mode===m);});
  if(map){setTimeout(function(){map.invalidateSize();},60);}
  if(m==="map"){
    map.dragging.enable();map.scrollWheelZoom.enable();map.doubleClickZoom.enable();map.touchZoom.enable();
    if(!mapMarkers.length)buildMapLayer(); drawMapLayer(); map.setView([25,15],2);
  }else{
    map.dragging.disable();map.scrollWheelZoom.disable();map.doubleClickZoom.disable();map.touchZoom.disable();
    clearMapLayer();
  }
}

/* ---------- ranking overlay ---------- */
var METRICS=[
 {k:"gdp",label:"GDP",col:"名目GDP",get:function(c){return c.gdpUsdTrn;},fmt:function(c){return c.gdpUsdTrn+"兆$ ≈"+nf(yenTrn(c.gdpUsdTrn),0)+"兆円";}},
 {k:"pop",label:"人口",col:"人口(世界順位)",get:function(c){return c.popM;},fmt:function(c){return nf(c.popM,0)+"百万人（世界"+c.popRankWorld+"位）";}},
 {k:"pc",label:"一人当たりGDP",col:"一人当たり(生産性)",get:function(c){return c.gdpUsdTrn/c.popM;},fmt:function(c){var d=Math.round(c.gdpUsdTrn*1e6/c.popM/100)*100;return "$"+nf(d,0)+"（約"+nf(Math.round(d*RATE/1e4),0)+"万円）";}},
 {k:"pg",label:"人口増減率",col:"前年比／10年比",get:function(c){return c.pgPct;},fmt:function(c){return (c.pgPct>0?"+":"")+c.pgPct+"% ／ "+(c.pg10Pct>0?"+":"")+c.pg10Pct+"%";}},
 {k:"gg",label:"GDP成長率",col:"前年比(実質)",get:function(c){return c.ggPct;},fmt:function(c){return (c.ggPct>0?"+":"")+c.ggPct+"%";}},
 {k:"debt",label:"債務残高",col:"政府債務(円換算)",get:function(c){return (D.debt.records[c.id]||{}).debtYenTrn||0;},fmt:function(c){return "約"+nf((D.debt.records[c.id]||{}).debtYenTrn||0,0)+"兆円";}},
 {k:"debtR",label:"債務/GDP比",col:"債務÷GDP",get:function(c){return (D.debt.records[c.id]||{}).debtGdpPct||0;},fmt:function(c){return ((D.debt.records[c.id]||{}).debtGdpPct||0)+"%";}}
];
function buildCmp(mk){var rows=D.countries.records.slice(),m=METRICS.find(function(x){return x.k===mk;})||METRICS[0];
  rows.sort(function(a,b){return m.get(b)-m.get(a);});
  var tabs="";METRICS.forEach(function(x){tabs+="<button class='cmpTab"+(x.k===m.k?" on":"")+"' data-m='"+x.k+"'>"+x.label+"</button>";});
  var h="<div class='cmpTabs'>"+tabs+"</div><table class='cmpT'><tr><th>順位</th><th>国</th><th>"+m.col+"</th></tr>";
  rows.forEach(function(c,i){h+="<tr><td style='font-weight:900;color:#8395a6'>"+(i+1)+"</td><td style='font-weight:800;color:"+c.color+"'>"+c.flag+" "+esc(c.name)+"</td><td style='font-weight:800'>"+m.fmt(c)+"</td></tr>";});
  h+="</table><div style='font-size:11px;color:#6a7b8b;margin-top:8px'>出典：IMF/世界銀行/国連（2024・概算）。債務は2023年。円換算＝1$="+RATE+"円。</div>";
  var body=document.getElementById("cmpBody");body.innerHTML=h;
  body.querySelectorAll(".cmpTab").forEach(function(b){b.onclick=function(){buildCmp(b.dataset.m);};});}

/* ---------- boot ---------- */
function boot(){
  world=document.getElementById("world");stage=document.getElementById("stage");svg=document.getElementById("links");
  initMap();buildTree();precompute(DATA,null);build(DATA);DATA.open=true;refreshKids();initView();
  // pan/zoom
  stage.addEventListener("mousedown",function(e){if(e.target.closest(".card"))return;world.style.transition="none";var sx=e.clientX,sy=e.clientY,ox=tx,oy=ty;stage.classList.add("drag");
    function mv(ev){tx=ox+(ev.clientX-sx);ty=oy+(ev.clientY-sy);applyT();}
    function up(){document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);stage.classList.remove("drag");world.style.transition="";}
    document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);});
  stage.addEventListener("touchstart",function(e){if(e.target.closest(".card"))return;world.style.transition="none";var t=e.touches[0],sx=t.clientX,sy=t.clientY,ox=tx,oy=ty;
    function mv(ev){var t2=ev.touches[0];tx=ox+(t2.clientX-sx);ty=oy+(t2.clientY-sy);applyT();}
    function up(){stage.removeEventListener("touchmove",mv);stage.removeEventListener("touchend",up);world.style.transition="";}
    stage.addEventListener("touchmove",mv,{passive:true});stage.addEventListener("touchend",up);},{passive:true});
  stage.addEventListener("wheel",function(e){e.preventDefault();world.style.transition="none";var d=e.deltaY<0?1.12:0.89;scale=Math.min(2,Math.max(.3,scale*d));applyT();},{passive:false});
  document.getElementById("zin").onclick=function(){world.style.transition="";scale=Math.min(2,scale*1.18);applyT();};
  document.getElementById("zout").onclick=function(){world.style.transition="";scale=Math.max(.3,scale*0.85);applyT();};
  document.getElementById("fitAll").onclick=fitAll;
  document.getElementById("cmp").onclick=function(){buildCmp("gdp");document.getElementById("cmpOv").classList.add("on");};
  document.getElementById("modeSw").addEventListener("click",function(e){var b=e.target.closest("button");if(b)setMode(b.dataset.mode);});
  document.getElementById("rateIn").addEventListener("change",function(){var v=parseFloat(this.value);if(v>0){RATE=v;var lg=document.getElementById("lgRate");if(lg)lg.textContent=v;
    for(var id in els){els[id].remove();} els={};byKey={}; precompute(DATA,null); build(DATA); layout(); applyT();
    if(mapMarkers.length){clearMapLayer();mapMarkers=[];mapLines=[];if(mode==="map"){buildMapLayer();drawMapLayer();}}}});
  document.querySelectorAll(".ov [data-close]").forEach(function(b){b.addEventListener("click",function(){b.closest(".ov").classList.remove("on");});});
  document.querySelectorAll(".ov").forEach(function(o){o.addEventListener("click",function(e){if(e.target===o)o.classList.remove("on");});});
  addEventListener("resize",function(){applyT();if(map)map.invalidateSize();});
}
})();
