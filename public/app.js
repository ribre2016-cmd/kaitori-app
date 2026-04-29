import {DataCaptureView,Camera,DataCaptureContext,FrameSourceState,TorchState} from "@scandit/web-datacapture-core";
import {barcodeCaptureLoader,BarcodeCaptureSettings,BarcodeCapture,Symbology,SymbologyDescription} from "@scandit/web-datacapture-barcode";
const el=id=>document.getElementById(id);
const keywordInput=el("keyword"),statusEl=el("status"),mainDebug=el("mainDebug");
const scannerStatus=el("scannerStatus"),debugMsg=el("debugMsg"),lastRead=el("lastRead"),scanHistory=el("scanHistory"),scannerModal=el("scannerModal");
const historyEl=el("history");
let context,view,camera,barcodeCapture,initialized=false,torchOn=false,lastCode="",lastAt=0;
function yen(v){return typeof v==="number" ? "¥"+v.toLocaleString() : "-"}
function blank(v){return v || "-"}
function errorText(e){return["name: "+(e?.name||""),"message: "+(e?.message||String(e||"")),"secureContext: "+window.isSecureContext,"protocol: "+location.protocol].join("\n")}
function showError(e){debugMsg.textContent=errorText(e);mainDebug.textContent=errorText(e)}
function setLoading(){statusEl.textContent="価格取得中…";["priceA","priceB","mobilePriceA","mobilePriceB"].forEach(id=>el(id).textContent="取得中")}
function renderResult(data){
  el("wordA").textContent=data.normalized?.A||"-"; el("wordB").textContent=data.normalized?.B||"-";
  el("priceA").textContent=yen(data.A?.price); el("priceB").textContent=yen(data.B?.price);
  el("mobilePriceA").textContent=yen(data.A?.price); el("mobilePriceB").textContent=yen(data.B?.price);
  el("titleA").textContent=blank(data.A?.title); el("titleB").textContent=blank(data.B?.title);
  el("genreA").textContent=blank(data.A?.genre); el("genreB").textContent=blank(data.B?.genre);
  el("releaseA").textContent=blank(data.A?.releaseDate); el("releaseB").textContent=blank(data.B?.releaseDate);
  el("modelA").textContent=blank(data.A?.model); el("modelB").textContent=blank(data.B?.model);
  el("linkA").href=data.A?.detailUrl||data.A?.url||"#"; el("linkB").href=data.B?.detailUrl||data.B?.url||"#";
  const diffText=typeof data.diff==="number" ? (data.diff>0?`Aが高い +${data.diff.toLocaleString()}円`:data.diff<0?`Bが高い +${Math.abs(data.diff).toLocaleString()}円`:"同額") : "差額：-";
  el("diff").textContent=diffText; el("mobileDiff").textContent=diffText;
}
async function runSearch(value){
  const keyword=(value||keywordInput.value||"").trim(); if(!keyword)return;
  keywordInput.value=keyword; setLoading();
  try{
    const res=await fetch("/api/search?q="+encodeURIComponent(keyword),{cache:"no-store"});
    const data=await res.json();
    if(!data.ok) throw new Error(data.error||"検索エラー");
    renderResult(data); statusEl.textContent="取得完了："+keyword; saveHistory(keyword,data);
  }catch(e){statusEl.textContent="価格取得に失敗しました。A/Bリンクで確認してください。"; mainDebug.textContent=errorText(e)}
}
function saveHistory(original,data){const history=JSON.parse(localStorage.getItem("kaitori_vercel_history")||"[]");history.unshift({original,date:new Date().toLocaleString("ja-JP"),a:yen(data.A?.price),b:yen(data.B?.price)});localStorage.setItem("kaitori_vercel_history",JSON.stringify(history.slice(0,80)));renderHistory()}
function renderHistory(){const history=JSON.parse(localStorage.getItem("kaitori_vercel_history")||"[]");historyEl.innerHTML="";history.forEach(item=>{const li=document.createElement("li");li.textContent=`${item.date} / ${item.original} / A:${item.a} / B:${item.b}`;li.onclick=()=>runSearch(item.original);historyEl.appendChild(li)})}
function handleDetected(data,symbologyName=""){const code=String(data||"").trim();if(!code)return;const now=Date.now();if(code===lastCode&&now-lastAt<1500)return;lastCode=code;lastAt=now;if(navigator.vibrate)navigator.vibrate(80);lastRead.textContent=code;scannerStatus.textContent="読み取り成功："+code;const li=document.createElement("li");li.textContent=`${new Date().toLocaleTimeString("ja-JP")} / ${code}${symbologyName?" / "+symbologyName:""}`;li.onclick=()=>runSearch(code);scanHistory.prepend(li);runSearch(code)}
async function initializeScandit(){if(initialized)return;if(!window.isSecureContext)throw new Error("HTTPSではありません。");scannerStatus.textContent="Scandit SDKを読み込み中…";debugMsg.textContent="";context=await DataCaptureContext.forLicenseKey(window.SCANDIT_LICENSE_KEY,{libraryLocation:"https://cdn.jsdelivr.net/npm/@scandit/web-datacapture-barcode@8.2.1/sdc-lib/",moduleLoaders:[barcodeCaptureLoader()]});view=await DataCaptureView.forContext(context);view.connectToElement(el("dataCaptureView"));const settings=new BarcodeCaptureSettings();settings.enableSymbologies([Symbology.EAN13UPCA,Symbology.EAN8,Symbology.UPCE,Symbology.Code128,Symbology.Code39,Symbology.QR]);try{settings.codeDuplicateFilter=1200}catch(e){}barcodeCapture=await BarcodeCapture.forContext(context,settings);barcodeCapture.addListener({didScan:async(mode,session)=>{const barcode=session.newlyRecognizedBarcode;if(!barcode)return;let readableName="";try{readableName=new SymbologyDescription(barcode.symbology).readableName}catch(e){}handleDetected(barcode.data||"",readableName)}});scannerStatus.textContent="カメラ準備中…";camera=Camera.pickBestGuess();if(!camera)throw new Error("Scanditで利用可能なカメラが見つかりません。");await camera.applySettings(BarcodeCapture.recommendedCameraSettings);await context.setFrameSource(camera);initialized=true}
async function openScanner(){scannerModal.classList.remove("hidden");try{await initializeScandit();await barcodeCapture.setEnabled(true);scannerStatus.textContent="カメラ許可が出たら許可してください";await context.frameSource.switchToDesiredState(FrameSourceState.On);scannerStatus.textContent="バーコードを枠に入れてください"}catch(e){console.error(e);showError(e);scannerStatus.textContent="起動NG。赤い詳細を確認してください。";statusEl.textContent="Scandit起動NG。詳細を確認してください。"}}
async function closeScanner(){try{if(barcodeCapture)await barcodeCapture.setEnabled(false);if(context?.frameSource)await context.frameSource.switchToDesiredState(FrameSourceState.Off)}catch(e){}scannerModal.classList.add("hidden")}
async function toggleTorch(){if(!camera)return;torchOn=!torchOn;try{await camera.setDesiredTorchState(torchOn?TorchState.On:TorchState.Off)}catch(e){scannerStatus.textContent="ライト非対応です";showError(e)}}
el("searchBtn").onclick=()=>runSearch();el("openScannerBtn").onclick=openScanner;el("closeScannerBtn").onclick=closeScanner;el("torchBtn").onclick=toggleTorch;el("clearHistoryBtn").onclick=()=>{localStorage.removeItem("kaitori_vercel_history");renderHistory()};keywordInput.addEventListener("keydown",e=>{if(e.key==="Enter")runSearch()});renderHistory();
