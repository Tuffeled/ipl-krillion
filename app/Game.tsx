'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { dateKey, makeQuestions, suggest, type Question, type Verdict } from '../lib/game';
import Stadium, { Ball, Batter, type Shot } from './Stadium';

type Result={question:Question; answer:string; correct:boolean; points:number; apps:number|null; eligible?:number};
type Session={mode:'daily'|'practice'; date:string; questions:Question[]; results:Result[]; deadline:number; phase:'question'|'feedback'|'summary'};
const KEY='ipl-krillion-daily-v1';
const HOWTO_SEEN='ipl-krillion-howto-seen';
type Pending={since:number};
const post=(path:string,body:object)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.ok?r.json():Promise.reject(r.status));
type Stats={players:number; total:number|null; higher:number; average:number; buckets:number[]};
// Only decides whether to show the leaderboard; scores go through /api/leaderboard (some ISPs block supabase.co).
const LEADERBOARD=!!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const MAX=7000;

function tier(r:Result){
 if(!r.correct)return {name:'BOWLED',color:'var(--miss)',square:'⬛'};
 if(r.points>=1000)return {name:'OUT OF THE GROUND',color:'var(--gold)',square:'🟩'};
 if(r.points>=750)return {name:'SIX!',color:'var(--pink)',square:'🟩'};
 if(r.points>=500)return {name:'FOUR!',color:'var(--cyan)',square:'🟩'};
 if(r.points>=250)return {name:'DRIVEN',color:'var(--grass)',square:'🟨'};
 return {name:'NUDGED',color:'var(--muted)',square:'🟨'};
}
// IST has no daylight saving, so the next reset is the next multiple of a day after shifting by +5:30.
const untilReset=(now:number)=>{const DAY=864e5,left=DAY-((now+19800000)%DAY);return Math.floor(left/36e5)+'H '+Math.floor(left%36e5/6e4)+'M'};
const shortDate=(d:string)=>new Date(d+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});

function Curve({stats}:{stats:Stats|'loading'|'error'}){
 if(stats==='loading')return <p className="k-note">COUNTING TODAY’S PLAYERS…</p>;
 if(stats==='error'||stats.total===null)return <p className="k-note">COULDN’T REACH THE LEADERBOARD</p>;
 const mine=Math.min(Math.floor(stats.total/500),13),max=Math.max(...stats.buckets,1),top=Math.max(1,Math.ceil((stats.higher+1)/stats.players*100));
 return <div className="k-panel k-curve">
  <p className="k-curve-top">{stats.players===1?'FIRST PLAYER TODAY':'TOP '+top+'%'}</p>
  <p className="k-note">#{stats.higher+1} OF {stats.players.toLocaleString()} · AVG {stats.average.toLocaleString()} M</p>
  <svg viewBox="0 0 140 52" preserveAspectRatio="none" shapeRendering="crispEdges" role="img" aria-label={'Distribution of '+stats.players+' daily scores; you are in the top '+top+' percent'}>
   {stats.buckets.map((n,i)=>{const h=n?Math.max(2,Math.round(n/max*50)):1;return <rect key={i} x={i*10+1} y={52-h} width="8" height={h} fill={i===mine?'#ffcc33':n?'#4de3ff66':'#1b3050'}/>})}
  </svg>
 </div>;
}

function AnimatedScore({value}:{value:number}){
 const [shown,setShown]=useState(0);
 useEffect(()=>{
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||value===0){setShown(value);return}
  let frame=0;const start=performance.now();
  const tick=(t:number)=>{const p=Math.min((t-start)/1100,1);setShown(Math.round(value*(1-Math.pow(1-p,3))));if(p<1)frame=requestAnimationFrame(tick)};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[value]);
 return <b aria-label={'Plus '+value+' metres'}>+{shown.toLocaleString()} M</b>;
}

function HowTo({open,onClose}:{open:boolean; onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;if(!d)return;if(open&&!d.open)d.showModal();if(!open&&d.open)d.close()},[open]);
 return <dialog ref={ref} className="k-howto" aria-labelledby="howto-title" onClose={onClose} onClick={e=>{if(e.target===ref.current)onClose()}}>
  <div className="k-howto-in">
   <button className="k-x" type="button" onClick={onClose} aria-label="Close how to play">✕</button>
   <h2 id="howto-title">HOW TO PLAY</h2>
   <ol className="k-steps">
    <li><span className="k-step-n">1</span><div><h3>READ THE QUESTION</h3><p className="k-mini-card">Name a wicketkeeper from a Chennai Super Kings squad</p></div></li>
    <li><span className="k-step-n">2</span><div><h3>NAME ONE IPL PLAYER</h3><p>Type a name before the <b>25 second</b> clock runs out. Wrong name? Try again, the clock keeps going.</p><p className="k-mini-input">MS Dhoni<i>▌</i><span>18s</span></p></div></li>
    <li><span className="k-step-n">3</span><div><h3>NICHE PLAYERS HIT FURTHER</h3><p>The nichest players hit the longest shots, up to <b>1,000 m</b>. Big names only nudge it.</p>
     <div className="k-example"><Batter swing/><div><p><b>MS Dhoni</b> · 278 matches</p><p className="k-arc short"><Ball/> +100 M</p><p><b>A niche squad player</b></p><p className="k-arc long"><Ball/> +1,000 M</p></div></div></div></li>
   </ol>
   <p className="k-howto-foot">7 questions a day, the same for everyone. New ones at midnight IST. Practice as much as you like.</p>
   <button className="k-btn k-btn-big" type="button" onClick={onClose} autoFocus>LET’S PLAY ▸</button>
  </div>
 </dialog>;
}

// Crowd roar synthesised from noise (no audio file needed): two voice bands that swell, wobble and fade.
function crowdCheer(ctx:AudioContext){
 const t=ctx.currentTime,len=2.8,buf=ctx.createBuffer(1,ctx.sampleRate*len,ctx.sampleRate),d=buf.getChannelData(0);
 for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 const src=ctx.createBufferSource();src.buffer=buf;
 const out=ctx.createGain();out.gain.setValueAtTime(0,t);out.gain.linearRampToValueAtTime(.5,t+.4);out.gain.setValueAtTime(.5,t+1.1);out.gain.exponentialRampToValueAtTime(.001,t+len);out.connect(ctx.destination);
 for(const [f,q,g,wobble] of [[700,.8,.7,6],[2200,1.4,.35,9]]){
  const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=q;
  const lfo=ctx.createOscillator(),depth=ctx.createGain();lfo.frequency.value=wobble;depth.gain.value=f*.25;lfo.connect(depth).connect(bp.frequency);lfo.start(t);lfo.stop(t+len);
  const gain=ctx.createGain();gain.gain.value=g;src.connect(bp).connect(gain).connect(out);
 }
 src.start(t);src.stop(t+len);
}

const Icon=({d}:{d:string})=><svg viewBox="0 0 20 20" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d={d}/></svg>;

export default function Game({pool,names,aliases}:{pool:Question[]; names:string[]; aliases:Record<string,string>}){
 const [input,setInput]=useState('');const [dismissed,setDismissed]=useState(false);
 const hint=useMemo(()=>suggest(input,names,aliases),[input,names,aliases]);
 const ghost=dismissed?null:hint;
 const acceptGhost=()=>{if(ghost){setInput(ghost.name);setDismissed(false)}};
 const [soundOn,setSoundOn]=useState(true);const audio=useRef<Record<string,HTMLAudioElement>>({});const audioCtx=useRef<AudioContext|null>(null);const answerInput=useRef<HTMLInputElement>(null);
 const [session,setSession]=useState<Session|null>(null);const [pending,setPending]=useState<Pending|null>(null);
 const [stats,setStats]=useState<Stats|'loading'|'error'|null>(null);const [answerError,setAnswerError]=useState('');const [now,setNow]=useState(0);const [hydrated,setHydrated]=useState(false);
 const [howto,setHowto]=useState(false);const [shared,setShared]=useState('');
 useEffect(()=>{
  setSoundOn(localStorage.getItem('ipl-krillion-sound')!=='off');setNow(Date.now());setHydrated(true);
  if(!localStorage.getItem(HOWTO_SEEN))setHowto(true);
  const saved=localStorage.getItem(KEY);if(saved){try{const s=JSON.parse(saved) as Session;if(s.date===dateKey()||s.phase!=='summary')setSession(s)}catch{localStorage.removeItem(KEY)}}
  const id=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(id);
 },[]);
 useEffect(()=>{if(session?.mode==='daily')localStorage.setItem(KEY,JSON.stringify(session))},[session]);
 useEffect(()=>{
  if(session?.phase!=='summary'||session.mode!=='daily'||!LEADERBOARD){setStats(null);return}
  let player=localStorage.getItem('ipl-climb-player');if(!player){player=crypto.randomUUID();localStorage.setItem('ipl-climb-player',player)}
  let cancelled=false;setStats('loading');
  fetch('/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_date:session.date,p_player:player,p_points:session.results.map(r=>r.points)})})
   .then(r=>r.ok?r.json():Promise.reject(r.status)).then((s:Stats)=>{if(!cancelled)setStats(s)}).catch(()=>{if(!cancelled)setStats('error')});
  return()=>{cancelled=true};
 },[session?.phase,session?.mode,session?.date]);
 useEffect(()=>{if(session?.phase==='question'&&!pending&&!howto)answerInput.current?.focus()},[session?.phase,session?.results.length,pending,howto]);
 function playSound(name:'click-soft'|'success-chime'|'error-004'){if(!soundOn)return;try{const s=audio.current[name]||new Audio('/sounds/'+name+'.mp3');audio.current[name]=s;s.volume=0.35;s.currentTime=0;void s.play().catch(()=>{})}catch{/* Audio is optional. */}}
 function toggleSound(){const next=!soundOn;setSoundOn(next);localStorage.setItem('ipl-krillion-sound',next?'on':'off')}
 function closeHowto(){setHowto(false);localStorage.setItem(HOWTO_SEEN,'1')}
 const remaining=session?Math.max(0,Math.ceil((session.deadline-(pending?pending.since:now))/1000)):25;
 function start(mode:'daily'|'practice'){playSound('click-soft');const date=dateKey();setInput('');setAnswerError('');setPending(null);setShared('');setSession({mode,date,questions:makeQuestions(pool,mode==='daily'?date:String(Date.now())+Math.random()),results:[],deadline:Date.now()+25000,phase:'question'})}
 function startDaily(){const saved=localStorage.getItem(KEY);if(saved){try{const s=JSON.parse(saved);if(s.date===dateKey()){setSession(s);return}}catch{}}start('daily')}
 function buzz(pattern:number[]){if(typeof navigator!=='undefined'&&'vibrate' in navigator&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)navigator.vibrate(pattern)}
 function resume(since:number,message=''){if(message){playSound('error-004');buzz([90])}setSession(s=>s&&{...s,deadline:s.deadline+Date.now()-since});setPending(null);setAnswerError(message)}
 async function ask(){
  // Enter takes the "did you mean" suggestion when one is showing.
  const text=(ghost?ghost.name:input).trim();if(!session||session.phase!=='question'||pending||!q||!text)return;
  const since=Date.now();playSound('click-soft');setAnswerError('');setPending({since});
  // Browsers only allow audio started from a tap or keypress, so open the audio context now, before the network wait.
  if(soundOn)try{audioCtx.current??=new AudioContext();void audioCtx.current.resume()}catch{/* Audio is optional. */}
  try{
   const verdict=await post('/api/judge',{promptId:q.id,text}) as Verdict;
   if(!verdict.correct){resume(since,verdict.reason);return}
   playSound('success-chime');buzz([35,55,45]);setPending(null);setInput('');
   // Sixes and out-of-the-ground hits (750+ m) get a cheer as the ball lands.
   if(verdict.points>=750&&soundOn&&audioCtx.current){const ctx=audioCtx.current;setTimeout(()=>{try{crowdCheer(ctx)}catch{}},900)}
   setSession(s=>s&&{...s,results:[...s.results,{question:q,answer:verdict.name,correct:true,points:verdict.points,apps:verdict.appearances,eligible:verdict.eligible}],phase:'feedback'});
  }catch{resume(since,'COULDN’T CHECK THAT — TRY AGAIN')}
 }
 useEffect(()=>{if(session?.phase!=='question'||pending||now===0||session.deadline>now)return;const question=session.questions[session.results.length];playSound('error-004');setSession({...session,results:[...session.results,{question,answer:'',correct:false,points:0,apps:null}],phase:'feedback'});setInput('');setAnswerError('')},[now,session,pending]);
 function next(){if(!session)return;playSound('click-soft');setSession({...session,phase:session.results.length===7?'summary':'question',deadline:Date.now()+25000})}
 async function share(){
  if(!session)return;
  const text='IPL Krillion '+(session.mode==='daily'?shortDate(session.date):'practice')+' · '+total.toLocaleString()+' m\n'+session.results.map(r=>tier(r).square).join('')+'\n'+location.origin;
  if(navigator.share){try{await navigator.share({text})}catch{/* Cancelled. */}return}
  try{await navigator.clipboard.writeText(text);setShared('COPIED!')}catch{setShared('COULDN’T COPY')}
 }

 const total=session?.results.reduce((sum,r)=>sum+r.points,0)||0;const q=session?.questions[session.results.length];const last=session?.results.at(-1);
 const phase=!session?'home':session.phase;
 const hot=remaining<=5;const lastTier=last&&tier(last);
 const todayDone=hydrated&&(()=>{try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return s?.date===dateKey()&&s.phase==='summary'}catch{return false}})();
 const shot:Shot=session?.phase==='feedback'&&last?(last.correct?{kind:'hit',distance:last.points/1000,label:'+'+last.points.toLocaleString()+' M'}:{kind:'bowled'}):null;

 return <main className="k-root" data-phase={phase}>
  <Stadium shot={shot} shotKey={session?.results.length??0}/>
  <div className="k-ui">
   <header className="k-top">
    {session?<button className="k-icon" type="button" onClick={()=>setSession(null)} aria-label="Home"><Icon d="M10 2 1 10h3v8h5v-5h2v5h5v-8h3z"/></button>:<span/>}
    {session&&session.phase!=='summary'&&<div className="k-board" role="group" aria-label="Scoreboard">
     <div className="k-cell"><span>METRES</span><b>{total.toLocaleString()}</b></div>
     <div className="k-cell k-mid"><span>{session.mode==='daily'?'TODAY':'PRACTICE'} · {Math.min(session.results.length+(session.phase==='question'?1:0),7)}/7</span>
      <div className="k-lamps" aria-hidden="true">{Array.from({length:7},(_,i)=>{const r=session.results[i];return <i key={i} className={r?(r.correct?'hit':'out'):i===session.results.length&&session.phase==='question'?'cur':''}/>})}</div></div>
     <div className={'k-cell'+(hot&&session.phase==='question'?' hot':'')}><span>TIME</span><b aria-label={remaining+' seconds left'}>{session.phase==='question'?remaining:'--'}</b></div>
    </div>}
    <div className="k-top-btns">
     <button className="k-icon" type="button" onClick={()=>setHowto(true)} aria-label="How to play">?</button>
     <button className="k-icon" type="button" onClick={toggleSound} aria-label={soundOn?'Mute sound':'Turn sound on'} aria-pressed={soundOn}><Icon d={soundOn?'M2 7h4l5-4v14l-5-4H2zM13 7h2v6h-2zM16 5h2v10h-2z':'M2 7h4l5-4v14l-5-4H2zM13 7h2v2h-2zM15 9h2v2h-2zM17 7h2v2h-2zM13 11h2v2h-2zM17 11h2v2h-2z'}/></button>
    </div>
   </header>

   <div className="k-body">
    {!session&&<section className="k-logo">
     <p className="k-logo-ipl">IPL</p>
     <h1>KRILLION</h1>
     <p className="k-tag">NAME THE RARE ONES. HIT IT FURTHER.</p>
    </section>}

    {session?.phase==='question'&&q&&<section key={session.results.length} className="k-panel k-question">
     <p className="k-kicker">QUESTION {session.results.length+1} OF 7</p>
     <h1>{q.prompt}</h1>
     <p className="k-hint">{q.hint}</p>
    </section>}

    {session?.phase==='feedback'&&last&&lastTier&&<section className="k-result" style={{'--tc':lastTier.color} as CSSProperties} role="status" aria-live="polite">
     <p className="k-result-name">{lastTier.name}</p>
     <p className="k-result-ans">{last.answer||'NO ANSWER'}</p>
     <p className="k-result-pts"><AnimatedScore value={last.points}/></p>
     <p className="k-note">{last.correct?(last.apps??0)+' IPL '+(last.apps===1?'MATCH':'MATCHES')+' · 1 OF '+last.eligible+' VALID ANSWERS':'THE CLOCK RAN OUT'}</p>
    </section>}

    {session?.phase==='summary'&&<section className="k-summary">
     <p className="k-kicker">{session.mode==='daily'?'TODAY · '+shortDate(session.date):'PRACTICE'}</p>
     <h1 className="k-total">{total.toLocaleString()}<small> M</small></h1>
     <p className="k-note">{Math.round(total/MAX*100)}% OF THE 7,000 M MAXIMUM</p>
     <table className="k-panel k-scorecard">
      <caption className="sr-only">Your scorecard</caption>
      <thead><tr><th scope="col">#</th><th scope="col">BATTER</th><th scope="col">M</th></tr></thead>
      <tbody>{session.results.map((r,i)=>{const t=tier(r);return <tr key={i} style={{'--tc':t.color} as CSSProperties}><td>{i+1}</td><td>{r.correct?r.answer:<em>{tier(r).name}</em>}<small>{r.question.prompt}</small></td><td>{r.points}</td></tr>})}</tbody>
      <tfoot><tr><td/><th scope="row">TOTAL</th><td>{total.toLocaleString()}</td></tr></tfoot>
     </table>
     {stats&&<Curve stats={stats}/>}
    </section>}
   </div>

   <footer className="k-dock">
    {!session&&<div className="k-actions">
     <button className="k-btn k-btn-big" disabled={!hydrated} onClick={startDaily}>{todayDone?'TODAY’S SCORECARD':'PLAY TODAY’S 7 ▸'}</button>
     <button className="k-btn k-btn-quiet" onClick={()=>start('practice')}>PRACTICE</button>
     <p className="k-note">{hydrated?'NEW QUESTIONS IN '+untilReset(now):' '}</p>
    </div>}

    {session?.phase==='question'&&q&&<>
     {answerError&&!pending&&<p className="k-reject" id="answer-error" role="alert">{answerError}</p>}
     <form className={'k-answer'+(hot?' hot':'')} onSubmit={e=>{e.preventDefault();ask()}}>
      <div className="k-input-wrap">
       <label htmlFor="answer" className="sr-only">Player name</label>
       <input ref={answerInput} id="answer" className={'k-input'+(answerError?' k-shake':'')} autoComplete="off" autoCorrect="off" spellCheck={false} autoCapitalize="words" enterKeyHint="go" readOnly={!!pending} value={input} aria-invalid={!!answerError} aria-describedby={(answerError?'answer-error ':'')+'answer-ghost'}
        onChange={e=>{setInput(e.target.value);setDismissed(false);if(answerError)setAnswerError('')}}
        onKeyDown={e=>{
         if(!ghost)return;
         // Backspace clears the suggestion first; the next one deletes text as usual.
         if(e.key==='Backspace'||e.key==='Escape'){e.preventDefault();setDismissed(true)}
         else if(e.key==='Tab'||(e.key==='ArrowRight'&&e.currentTarget.selectionStart===input.length)){e.preventDefault();acceptGhost()}
        }} placeholder="type a player…"/>
       {ghost&&<div className="k-ghost" aria-hidden="true"><span className="k-ghost-typed">{input}</span>
        {ghost.kind==='complete'?<span>{ghost.name.slice(input.length)}</span>:<span className="k-ghost-fix" onMouseDown={e=>{e.preventDefault();acceptGhost()}}>{' → '+ghost.name+'?'}</span>}</div>}
       <p id="answer-ghost" className="sr-only" aria-live="polite">{ghost?'Did you mean '+ghost.name+'? Enter to hit with it, Tab to fill it in, Backspace to dismiss.':''}</p>
       <div className="k-fuse" aria-hidden="true"><div style={{transform:'scaleX('+(remaining/25)+')'}}/></div>
      </div>
      <button className="k-btn k-btn-hit" type="submit" disabled={!!pending}>{pending?'…':'HIT ▸'}</button>
     </form>
    </>}

    {session?.phase==='feedback'&&<div className="k-actions"><button className="k-btn k-btn-big" onClick={next} autoFocus>{session.results.length===7?'SCORECARD ▸':'NEXT BALL ▸'}</button></div>}

    {session?.phase==='summary'&&<div className="k-actions">
     <button className="k-btn k-btn-big" onClick={share}>{shared||'SHARE ▸'}</button>
     <div className="k-row"><button className="k-btn k-btn-quiet" onClick={()=>start('practice')}>PRACTICE</button><button className="k-btn k-btn-quiet" onClick={()=>setSession(null)}>HOME</button></div>
     {session.mode==='daily'&&<p className="k-note">NEW QUESTIONS IN {untilReset(now)}</p>}
    </div>}
   </footer>
  </div>
  <HowTo open={howto} onClose={closeHowto}/>
 </main>;
}
