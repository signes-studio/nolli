import{CATEGORY_META as g,escapeHtml as r,formatCategoria as z,normalizarCategoria as B}from"./state.js";import{getOptimizedPhotoUrl as F}from"./imageProxy.js";function H(a,{variant:n="list",className:f="",distance:l="",action:u="",actionClass:h="",featureId:v=a?.featureId||a?.id||"",showPhoto:y=!0,tag:e="article"}={}){const i=String(v||a?.id||""),p=String(a?.id||i),N=B(a?.categoria),m=(g[N]||g.otro).color||"#EA560D",s=String(a?.nombre_obra||a?.title||"Obra de arquitectura").trim(),S=Array.isArray(a?.arquitectos)?a.arquitectos.join(", "):a?.arquitectos||a?.arquitecto||"",q=String(S).trim()||"Arquitecto no especificado",A=a?.a\u00F1o_construccion||a?.ano_construccion||a?.year?String(a?.a\u00F1o_construccion||a?.ano_construccion||a?.year).trim():"",C=String(a?.place||a?.ciudad||a?.city||"").trim(),o=a?.importancia!=null?Number(a.importancia):NaN,t=Number.isFinite(o)&&o>=0&&o<=3,d=t?Math.min(3,Math.max(0,Math.round(o))):3,I=4-d,b=t?["Hito / Obra Cumbre (Nivel 0 \u2014 4/4)","Importancia Alta (Nivel 1 \u2014 3/4)","Importancia Media (Nivel 2 \u2014 2/4)","Importancia Menor (Nivel 3 \u2014 1/4)"][d]:"",_=a?.foto_miniatura||a?.foto_url||"",$=y&&_?F(_,n==="compact"||n==="profile"?"thumb":"card"):"",M=[q,A,C].filter(Boolean).map(r).join(" \xB7 "),c=a?.coordenadas||(a?.longitud!=null&&a?.latitud!=null?[a.longitud,a.latitud]:null),O=c?.[0]!=null?c[0]:"",E=c?.[1]!=null?c[1]:"",x=e==="button"?'type="button"':'role="button" tabindex="0"',j=z(a?.categoria);return`<${e} class="obra-card obra-card--${r(n)} ${r(f)}" data-feature-id="${r(i)}" data-id="${r(p)}" data-obra-id="${r(p)}" data-radar-feature-id="${r(i)}" data-search-feature-id="${r(i)}" data-architect-work-id="${r(i)}" data-lng="${r(String(O))}" data-lat="${r(String(E))}" ${x} aria-label="Ver ${r(s)}">
    ${$?`<div class="obra-card__thumb"><img src="${r($)}" alt="${r(s)}" loading="lazy" decoding="async" onerror="this.parentElement.style.display='none'"></div>`:""}
    <div class="obra-card__body">
      <div class="obra-card__topline">
        <div class="obra-card__tags">
          <span class="obra-card__category" style="--obra-category:${m};">
            <span class="obra-card__cat-pip" style="background:${m};"></span>
            <span>${r(j)}</span>
          </span>
          ${t?`<span class="obra-card__importance-meter" title="${r(b)}" aria-label="${r(b)}" role="img">${[1,2,3,4].map(w=>`<span class="obra-card__importance-sq ${w<=I?"is-filled":""}"></span>`).join("")}</span>`:""}
          ${t&&d===0?'<span class="obra-card__badge-hito">HITO</span>':""}
        </div>
        ${l?`<span class="obra-card__distance">${r(l)}</span>`:""}
      </div>
      <h3 class="obra-card__title">${r(s)}</h3>
      <p class="obra-card__meta">${M}</p>
    </div>
    ${u?`<div class="obra-card__action ${r(h)}">${u}</div>`:""}
  </${e}>`}export{H as renderObraCard};
