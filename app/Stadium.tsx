import type { CSSProperties } from 'react';

// Pixel sprites as character grids; '.' is transparent.
const PALETTE: Record<string, string> = { H: '#1d3a8a', h: '#2f56c4', G: '#9aa6b8', S: '#e0a375', J: '#f2c230', j: '#c99a12', P: '#1d3a8a', W: '#f4f1e8', w: '#c9c4b5', T: '#d9a75f', t: '#9c6b2e', L: '#f4f1e8', K: '#1a1a22', R: '#d7263d', r: '#8f1424', s: '#ffd9d9' };
const READY = [
  '.....HHHH.......', '....HhhhHH......', '....HHHHHHG.....', '....SSSSGG......', '.....SSS........', '....JJJJJ.......', '...JJjJJJJ......', '...JJjJJJLL.....',
  '...JJJJJ.LLT....', '...JJJJJ..Tt....', '....PPPP..Tt....', '....PPPP..Tt....', '....WW.WW.Tt....', '....Ww.Ww.Tt....', '....Ww.Ww.......', '....WW.WW.......', '...KKK.KKK......',
];
const SWING = [
  '.....HHHH.....tT', '....HhhhHH...tT.', '....HHHHHHG.tT..', '....SSSSGG.tT...', '.....SSS..tT....', '....JJJJJLL.....', '...JJjJJJLL.....', '...JJjJJJJ......',
  '...JJJJJ........', '...JJJJJ........', '....PPPP........', '....PPPP........', '...WW..WW.......', '...Ww...Ww......', '..Ww.....Ww.....', '..WW.....WW.....', '.KKK.....KKK....',
];
// Idle bat waggle and the backlift before the swing.
const WAGGLE = [...READY.slice(0, 8), '...JJJJJ.LLTt...', '...JJJJJ...Tt...', '....PPPP...Tt...', '....PPPP....Tt..', '....WW.WW...Tt..', '....Ww.Ww.......', '....Ww.Ww.......', '....WW.WW.......', '...KKK.KKK......'];
const BACKLIFT = [
  'tT...HHHH.......', '.tT.HhhhHH......', '..tTHHHHHHG.....', '...LLSSSGG......', '....LSSS........', '....JJJJJ.......', '...JJjJJJJ......', '...JJjJJJ.......',
  '...JJJJJ........', '...JJJJJ........', '....PPPP........', '....PPPP........', '....WW.WW.......', '....Ww.Ww.......', '....Ww.Ww.......', '....WW.WW.......', '...KKK.KKK......',
];
const BALL = ['.rRR.', 'rRsRR', 'RRsRr', '.RRr.'];

export function Sprite({ rows, className }: { rows: string[]; className?: string }) {
  return <svg className={className} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true">
    {rows.flatMap((row, y) => [...row].map((c, x) => c === '.' ? null : <rect key={x + '-' + y} x={x} y={y} width="1" height="1" fill={PALETTE[c]} />))}
  </svg>;
}
export const Batter = ({ swing = false }: { swing?: boolean }) => <Sprite rows={swing ? SWING : READY} className="k-batter" />;
// Stacked frames; CSS flips between them (idle waggle, or backlift → follow-through).
function AnimatedBatter({ swing }: { swing: boolean }) {
  return <div className={'k-frames ' + (swing ? 'swing' : 'idle')}>
    {swing ? <><Sprite rows={SWING} className="k-batter f-swing" /><Sprite rows={BACKLIFT} className="k-batter f-back" /></>
      : <><Sprite rows={READY} className="k-batter f-ready" /><Sprite rows={WAGGLE} className="k-batter f-waggle" /></>}
  </div>;
}
export const Ball = () => <Sprite rows={BALL} className="k-ball-sprite" />;

function Tower({ side }: { side: 'l' | 'r' }) {
  return <div className={'k-tower ' + side} aria-hidden="true">
    <div className="k-glow" />
    <svg viewBox="0 0 14 64" shapeRendering="crispEdges">
      <rect x="0" y="0" width="14" height="9" fill="#3a4560" />
      {[1, 5, 9].flatMap(x => [1, 5].map(y => <rect key={x + '-' + y} x={x} y={y} width="3" height="3" fill="#fff7d6" />))}
      <rect x="6" y="9" width="2" height="55" fill="#2a3348" />
      {[16, 28, 40, 52].map(y => <rect key={y} x="4" y={y} width="6" height="1" fill="#2a3348" />)}
    </svg>
  </div>;
}

export type Shot = { kind: 'hit'; distance: number; label: string } | { kind: 'bowled' } | null;

// Background scene. A hit sends the ball a distance proportional to metres scored (0–1000 → 0–1 of the field).
export default function Stadium({ shot, shotKey }: { shot: Shot; shotKey: number }) {
  const hit = shot?.kind === 'hit';
  const six = hit && shot.distance >= 0.75;
  return <div className={'k-scene' + (six ? ' cheer' : '')} key={'scene' + shotKey} aria-hidden="true">
    <div className="k-stars" />
    <Tower side="l" /><Tower side="r" />
    <div className="k-stands" />
    <div className="k-ground"><div className="k-rope" /><div className="k-pitch" /></div>
    <div className={'k-actor' + (six ? ' celebrate' : '')}>
      <div className={'k-stumps' + (shot?.kind === 'bowled' ? ' down' : '')}><i /><i /><i /><b /><b /></div>
      <AnimatedBatter swing={hit} />
    </div>
    {hit && <div className="k-flight" style={{ '--d': shot.distance } as CSSProperties}>
      <div className="k-fly-x"><div className="k-fly-y"><Ball /></div><span className="k-land">{shot.label}</span></div>
    </div>}
  </div>;
}
