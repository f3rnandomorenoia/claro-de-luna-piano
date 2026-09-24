const COLORS = ['#E21C48','#F26622','#F99D1C','#FFCC33','#FFF32B','#BCD85F','#62BC47','#009C95','#0071BB','#5E50A1','#8D5BA6','#CF3E96'];
const NAMES = ['Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];
const WHITE = new Set([0,2,4,5,7,9,11]);
const whites = Array.from({length:60},(_,i)=>i+29).filter(m=>WHITE.has(m%12));
const WIDTH = whites.length*25;
const coordinates = new Map();
whites.forEach((m,i)=>{
  coordinates.set(m,{x:i*25,width:25,black:false});
  if(i<whites.length-1&&!WHITE.has((m+1)%12))coordinates.set(m+1,{x:(i+1)*25-8,width:16,black:true});
});
const label = midi => `${NAMES[midi%12]}${Math.floor(midi/12)-1}`;
const main = document.querySelector('#measures');
const picker = document.querySelector('#measure-picker');
const controls = document.querySelector('.controls');
let held = false;
let measures = [];
const saved = (()=>{try{return Number(localStorage.getItem('moonlight-mobile-measure'))||1;}catch{return 1;}})();
function setCurrent(number){
  picker.value=String(number);
  try{localStorage.setItem('moonlight-mobile-measure',String(number));}catch{/* Storage is optional. */}
}
function jump(number, updateHash=true){
  const target=document.querySelector(`#compas-${number}`);
  if(!target)return;
  target.scrollIntoView({block:'start',behavior:'instant'});
  setCurrent(number);
  if(updateHash)history.replaceState(null,'',`#compas-${number}`);
}
function hashMeasure(){const match=location.hash.match(/^#compas-(\d+)$/);return match&&Number(match[1])>=1&&Number(match[1])<=69?Number(match[1]):null;}
function keyboard(notes){
  const shown=held?notes:notes.filter(n=>n.press);
  function keys(black){return shown.filter(n=>coordinates.get(n.midi).black===black).map(n=>{
    const k=coordinates.get(n.midi),base=COLORS[n.midi%12],h=black?119:204;
    const color=n.press?base:`rgb(${[1,3,5].map(i=>Math.round(194+parseInt(base.slice(i,i+2),16)*.24)).join(',')})`;
    return `<rect data-note="${n.midi}" data-press="${n.press}" x="${k.x}" y="8" width="${k.width}" height="${h}" fill="${color}" stroke="#243833" stroke-width=".8"/>`;
  }).join('');}
  const markers=shown.map(n=>{
    const k=coordinates.get(n.midi),cy=k.black?106:180;
    return `<circle cx="${k.x+k.width/2}" cy="${cy}" r="5.8" fill="white"/><circle cx="${k.x+k.width/2}" cy="${cy}" r="3.8" fill="${n.press?'#142b26':'white'}" stroke="#142b26" stroke-width="1.2"/>`;
  }).join('');
  const aria=shown.map(n=>`${label(n.midi)}, ${n.press?'pulsar':'mantener'}`).join('; ');
  return `<svg class="keyboard" viewBox="0 0 ${WIDTH} 215" role="img" aria-label="${aria}"><use href="#white-keys"/>${keys(false)}<use href="#black-keys"/>${keys(true)}<use href="#octave-labels"/>${markers}</svg>`;
}
function setupKeyboard(){
  const blackPath=[...coordinates.values()].filter(k=>k.black).map(k=>`M${k.x},8h16v119h-16z`).join('');
  const whitePath=whites.map((_,i)=>`M${i*25},8v204`).join('');
  const octaveLabels=whites.map((m,i)=>m%12===0?`<text x="${i*25+12.5}" y="202" text-anchor="middle" font-size="10" fill="#485d56">C${Math.floor(m/12)-1}</text>`:'').join('');
  document.body.insertAdjacentHTML('beforeend',`<svg class="defs" aria-hidden="true"><defs><g id="white-keys"><rect x="0" y="8" width="${WIDTH}" height="204" fill="#fff" stroke="#6f7a72"/><path d="${whitePath}" fill="none" stroke="#6f7a72" stroke-width=".8"/></g><g id="black-keys"><path d="${blackPath}" fill="#242d32"/></g><g id="octave-labels">${octaveLabels}</g></defs></svg>`);
}
function renderSteps(measure){return measure.steps.map((step,i)=>{
  const pressed=step.notes.filter(n=>n.press).map(n=>label(n.midi));
  const sustained=step.notes.filter(n=>!n.press).map(n=>label(n.midi));
  return `<li class="step" id="compas-${measure.number}-paso-${i+1}"><div class="step-label"><span class="step-number">${String(i+1).padStart(2,'0')}</span><span class="notes-text">${pressed.join(' · ')}</span></div>${keyboard(step.notes)}${held&&sustained.length?`<p class="held-text">Mantener: ${sustained.join(' · ')}</p>`:''}</li>`;
}).join('');}
function render(){
  main.innerHTML=measures.map(m=>`<section class="measure" id="compas-${m.number}" aria-labelledby="title-${m.number}"><header class="measure-header"><h2 id="title-${m.number}">Compás ${String(m.number).padStart(2,'0')}</h2><small>${m.steps.length} pasos</small></header>${m.number===1?'<p class="score-instruction">Si deve suonare tutto questo pezzo delicatissimamente e senza sordini.</p>':''}<button class="score-button" data-score="${m.number}" aria-label="Ampliar partitura del compás ${m.number}"><img src="${m.score}" alt="Pentagramas originales del compás ${m.number}" width="${m.scoreWidth}" height="${m.scoreHeight}" loading="${m.number<3?'eager':'lazy'}"><span>Partitura original · Toca para ampliar</span></button><div class="keyboard-caption"><span>↓ Sigue los pasos de arriba abajo</span><span>Fa1–Mi6 · C4 = do central</span></div><ol class="steps" aria-label="Pasos del compás ${m.number}">${renderSteps(m)}</ol>${m.number<69?`<a class="measure-end" href="#compas-${m.number+1}" data-next="${m.number+1}">Siguiente: compás ${m.number+1} ↓</a>`:'<p class="measure-end">Fin del primer movimiento</p>'}</section>`).join('');
  observeMeasures();
}
function observeMeasures(){
  // Read the measure that crosses the line just under the toolbar.
  let queued=false;
  const track=()=>{
    queued=false;const y=controls.getBoundingClientRect().bottom+24;
    const sections=[...document.querySelectorAll('.measure')];
    const visible=sections.find(s=>{const r=s.getBoundingClientRect();return r.top<=y&&r.bottom>y;});
    if(visible)setCurrent(Number(visible.id.slice(7)));
  };
  window.onscroll=()=>{if(!queued){queued=true;requestAnimationFrame(track);}};
}
function changeMode(value){
  if(held===value)return;
  const line=controls.getBoundingClientRect().bottom;
  const visible=[...document.querySelectorAll('.step')].find(s=>{const r=s.getBoundingClientRect();return r.top>=line&&r.top<innerHeight;});
  const anchor=visible?.id,offset=visible?.getBoundingClientRect().top;
  held=value;
  document.querySelector('#only-press').setAttribute('aria-pressed',String(!held));
  document.querySelector('#with-held').setAttribute('aria-pressed',String(held));
  document.querySelector('#mode-description').textContent=held?'Punto y color: pulsa ahora. Aro y color suave: mantén la tecla.':'Color y punto: pulsa ahora. Se muestran solo las nuevas pulsaciones.';
  measures.forEach(m=>{document.querySelector(`#compas-${m.number} .steps`).innerHTML=renderSteps(m);});
  if(anchor)requestAnimationFrame(()=>{const el=document.getElementById(anchor);if(el)window.scrollBy(0,el.getBoundingClientRect().top-offset);});
}
const dialog=document.createElement('dialog');dialog.className='score-dialog';
dialog.innerHTML='<div class="dialog-header"><h2 id="score-dialog-title"></h2><button type="button">Cerrar</button></div><p class="dialog-help">Desliza la partitura hacia los lados para ver los detalles.</p><div class="score-pan" tabindex="0" aria-label="Partitura ampliada desplazable"><img alt=""></div>';
dialog.setAttribute('aria-labelledby','score-dialog-title');document.body.append(dialog);
dialog.querySelector('button').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{document.body.style.overflow='';});
main.addEventListener('click',event=>{
  const button=event.target.closest('[data-score]');
  if(button){const m=measures[Number(button.dataset.score)-1];dialog.querySelector('h2').textContent=`Compás ${m.number} · Partitura original`;const img=dialog.querySelector('img');img.src=m.score;img.alt=`Partitura original ampliada del compás ${m.number}`;dialog.showModal();dialog.querySelector('.score-pan').scrollLeft=0;document.body.style.overflow='hidden';}
  const next=event.target.closest('[data-next]');if(next){event.preventDefault();jump(Number(next.dataset.next));}
});
picker.addEventListener('change',()=>jump(Number(picker.value)));
document.querySelector('#only-press').addEventListener('click',()=>changeMode(false));
document.querySelector('#with-held').addEventListener('click',()=>changeMode(true));
const legend=document.querySelector('#color-legend');
legend.innerHTML=COLORS.map((color,i)=>`<span class="swatch"><i style="background:${color}"></i>${NAMES[i]}</span>`).join('')+'<p class="legend-note"># = sostenido. El color se repite en todas las octavas.</p>';
document.querySelector('#legend-button').addEventListener('click',event=>{legend.hidden=!legend.hidden;event.currentTarget.setAttribute('aria-expanded',String(!legend.hidden));});
new ResizeObserver(()=>{document.documentElement.style.setProperty('--toolbar-height',`${controls.getBoundingClientRect().height}px`);}).observe(controls);
window.addEventListener('hashchange',()=>{const n=hashMeasure();if(n)jump(n,false);});
async function load(){
  try{
    const response=await fetch('./data.json');if(!response.ok)throw new Error('No se pudo cargar la partitura.');
    const data=await response.json();measures=data.measures;
    if(measures.length!==69)throw new Error('La partitura está incompleta.');
    picker.innerHTML=measures.map(m=>`<option value="${m.number}">${m.number} / 69</option>`).join('');picker.disabled=false;
    render();
    const initial=hashMeasure();
    if(initial)requestAnimationFrame(()=>jump(initial,false));
    else if(saved>1&&saved<=69){
      const button=document.createElement('button');button.className='resume';button.textContent=`Continuar en el compás ${saved}`;
      button.addEventListener('click',()=>{jump(saved);button.remove();});document.querySelector('.intro').append(button);
    }
  }catch(error){main.innerHTML='<div class="error" role="alert"><p>No se ha podido cargar la guía. Comprueba la conexión y vuelve a intentarlo.</p><button>Reintentar</button></div>';main.querySelector('button').addEventListener('click',load);console.error(error);}
}
setupKeyboard();void load();
