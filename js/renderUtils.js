function y(t,o=[],e=20,i=null){if(!t)return null;const n=new AbortController;let l=0;const s=Math.ceil(o.length/e);function r(){if(n.signal.aborted)return;const a=l*e,d=Math.min(a+e,o.length);try{const c=document.createDocumentFragment(),u=document.createElement("div");for(let p=a;p<d;p++){const m=o[p];if(m!=null)for(u.innerHTML=m;u.firstChild;)c.appendChild(u.firstChild)}t?.appendChild(c)}catch(c){console.warn("Error en renderizado en chunks:",c)}l++,l<s&&!n.signal.aborted?"requestIdleCallback"in window?window.requestIdleCallback(()=>r(),{timeout:100}):requestAnimationFrame(()=>r()):i&&!n.signal.aborted&&i()}return o.length===0?(i&&i(),n):("requestIdleCallback"in window?window.requestIdleCallback(()=>r(),{timeout:100}):r(),n)}function b(t,o=[],e=null,i=80,n=5){if(!t||!e||o.length===0)return;const l=document.createElement("div");l.style.position="relative",l.style.height=`${o.length*i}px`;const s=document.createElement("div");s.style.position="absolute",s.style.top="0",s.style.left="0",s.style.right="0",l.appendChild(s),t.innerHTML="",t.appendChild(l);function r(){const c=t?.parentElement,u=c?.scrollTop||0,p=c?.clientHeight||0,m=Math.max(0,Math.floor(u/i)-n),v=Math.min(o.length,Math.ceil((u+p)/i)+n);s.innerHTML="";const x=document.createDocumentFragment();for(let h=m;h<v;h++){const g=o[h];if(g!==void 0&&e){const f=document.createElement("div");f.style.position="absolute",f.style.top=`${h*i}px`,f.style.left="0",f.style.right="0",f.innerHTML=e(g,h),x.appendChild(f)}}s.appendChild(x)}let a=null;const d=t.parentElement;d&&d.addEventListener("scroll",()=>{a||(a=requestAnimationFrame(()=>{r(),a=null}))},{passive:!0}),r()}function w(t,o,e=new Map){if(e.has(t)){const n=e.get(t);return n&&typeof n.then=="function"?n:Promise.resolve(n)}const i=o().then(n=>(e.set(t,n),n)).catch(n=>{throw e.delete(t),n});return e.set(t,i),i}function I(t,o=300){let e=null;return function(...n){e&&clearTimeout(e),e=setTimeout(()=>t(...n),o)}}function T(t,o=100){let e=0,i=null;return function(...l){const s=Date.now(),r=s-e;r>=o?(e=s,t(...l)):(i&&clearTimeout(i),i=setTimeout(()=>{e=Date.now(),t(...l)},o-r))}}function L(t,o,e=new Set){if(!t)return"";const i=Math.round(o*10)/10,n=[Math.round(t.getWest()*100)/100,Math.round(t.getSouth()*100)/100,Math.round(t.getEast()*100)/100,Math.round(t.getNorth()*100)/100].join(","),l=Array.from(e||[]).sort().join("|");return`${n}@${i}:${l}`}function M(t,o,e,i){if(t==null||o==null||e==null||i==null)return 1/0;const n=6371e3,l=o*Math.PI/180,s=i*Math.PI/180,r=(i-o)*Math.PI/180,a=(e-t)*Math.PI/180,d=Math.sin(r/2)*Math.sin(r/2)+Math.cos(l)*Math.cos(s)*Math.sin(a/2)*Math.sin(a/2),c=2*Math.atan2(Math.sqrt(d),Math.sqrt(1-d));return n*c}function C(t,o,e,i,n){if(t==null||o==null||e==null||i==null||n<=0)return!1;const l=n/111320;if(Math.abs(i-o)>l)return!1;const s=Math.cos(o*Math.PI/180),r=n/(111320*Math.max(.01,s));return Math.abs(e-t)>r?!1:M(t,o,e,i)<=n}function k(t){return t==null||!Number.isFinite(t)?"":t<1e3?`${Math.round(t)} M`:`${(t/1e3).toFixed(1)} KM`}function A(t,o={}){const{actionText:e=null,onAction:i=null,duration:n=e?5e3:3200}=o;let l=document.getElementById("nolli-neo-toast");l||(l=document.createElement("div"),l.id="nolli-neo-toast",l.style.cssText=`
      position: fixed;
      left: 50%;
      bottom: 84px;
      transform: translateX(-50%);
      z-index: 99999;
      background: #141411;
      color: #F8F1DF;
      border: 2px solid #EA560D;
      padding: 10px 16px;
      max-width: min(92vw, 420px);
      width: max-content;
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 12px;
      opacity: 0;
      transition: opacity 0.2s ease;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.1);
      border-radius: 8px !important;
    `,document.body.appendChild(l));const s=String(t).toLowerCase().includes("inicia sesi\xF3n")||String(t).toLowerCase().includes("iniciar sesi\xF3n"),r=e||(s?"iniciar sesi\xF3n":null);if(l.innerHTML=`
    <span style="flex:1;">${String(t)}</span>
    ${r?`<button type="button" id="nolli-toast-action-btn" style="background:var(--accent, rgb(234, 86, 13)); color:white; border:none; padding:6px 12px; font-family:'Inter',sans-serif; font-size:11px; font-weight:600; cursor:pointer; text-transform:lowercase; border-radius:6px !important; flex-shrink:0;">${r}</button>`:""}
  `,r){const a=l.querySelector("#nolli-toast-action-btn");a&&(a.style.setProperty("border-radius","6px","important"),a.onclick=()=>{if(l&&(l.style.opacity="0"),i)i();else if(s){const d=document.getElementById("modal-login");d&&d.classList.add("open")}})}l.style.opacity="1",l._timer&&clearTimeout(l._timer),l._timer=setTimeout(()=>{l&&(l.style.opacity="0")},n)}function $(t,o){if(!t||!o)return()=>{};const e=()=>{const i=Math.max(0,t.scrollWidth-t.clientWidth);if(i<=1){o.classList.remove("can-scroll-left","can-scroll-right");return}const n=t.scrollLeft;o.classList.toggle("can-scroll-left",n>2),o.classList.toggle("can-scroll-right",i-n>2)};if(t.addEventListener("scroll",e,{passive:!0}),window.addEventListener("resize",e,{passive:!0}),"ResizeObserver"in window){const i=new ResizeObserver(()=>e());i.observe(t),Array.from(t.children).forEach(n=>i.observe(n))}return e(),requestAnimationFrame(e),setTimeout(e,100),setTimeout(e,400),e}function D(t,o={}){if(!t)return;const{state:e="idle",pct:i=0,title:n,badge:l,message:s}=o;if(e==="idle"){t.innerHTML="",t.classList.add("hidden");return}if(t.classList.remove("hidden"),e==="uploading"){const r=Math.max(0,Math.min(100,Math.round(i))),a=n||(r>=100?"OPTIMIZANDO IMAGEN_":"SUBIENDO IMAGEN_"),d=t.querySelector(".nolli-upload-card.is-uploading");if(d){const c=d.querySelector(".nolli-upload-card-title"),u=d.querySelector(".nolli-upload-card-pct"),p=d.querySelector(".nolli-upload-progress-bar");c&&(c.textContent=a),u&&(u.textContent=`${r}%`),p&&(p.style.width=`${r}%`);return}t.innerHTML=`
      <div class="nolli-upload-card is-uploading" role="status" aria-live="polite">
        <div class="nolli-upload-card-row">
          <div class="nolli-upload-card-meta">
            <span class="nolli-upload-spinner" aria-hidden="true"></span>
            <span class="nolli-upload-card-title">${a}</span>
          </div>
          <span class="nolli-upload-card-pct">${r}%</span>
        </div>
        <div class="nolli-upload-progress-track" aria-hidden="true">
          <div class="nolli-upload-progress-bar" style="width: ${r}%;"></div>
        </div>
      </div>
    `;return}if(e==="success"){const r=n||"FOTOGRAF\xCDA SUBIDA_",a=l||"OPTIMIZADA";t.innerHTML=`
      <div class="nolli-upload-card is-success" role="status" aria-live="polite">
        <div class="nolli-upload-card-row">
          <div class="nolli-upload-card-meta">
            <span class="nolli-upload-icon-success" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span class="nolli-upload-card-title">${r}</span>
          </div>
          <span class="nolli-upload-badge-success">${a}</span>
        </div>
      </div>
    `;return}if(e==="error"){const r=n||"ERROR AL SUBIR_",a=s||"No se pudo transferir la fotograf\xEDa.";t.innerHTML=`
      <div class="nolli-upload-card is-error" role="alert">
        <div class="nolli-upload-card-row">
          <div class="nolli-upload-card-meta">
            <span class="nolli-upload-icon-error" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </span>
            <span class="nolli-upload-card-title">${r}</span>
          </div>
        </div>
        <p class="nolli-upload-card-error-text">${a}</p>
      </div>
    `}}export{M as calcularDistanciaMetros,b as createVirtualList,I as debounce,C as estaDentroDeRadio,w as fetchWithCache,k as formatearDistancia,L as getViewportKey,$ as initTabsScrollIndicator,y as renderInChunks,D as setUploadStatusFeedback,A as showNeoToast,T as throttle};
