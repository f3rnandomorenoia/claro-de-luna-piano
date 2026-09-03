'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay as OSMDType } from 'opensheetmusicdisplay';
import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  MousePointer2,
  Music2,
  Piano,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type Hand = 'right' | 'left';
type ScoreNote = { midi: number; label: string; hand: Hand };
type ScorePosition = { time: number; notes: ScoreNote[] };
type ScoreMeasure = { number: string; positions: ScorePosition[] };
type Selection = { measureIndex: number; positionIndex: number };
type Marker = { x: number; y: number };

type RuntimeOsmd = OSMDType & {
  graphic: {
    MeasureList: Array<Array<{
      staffEntries: Array<{
        relInMeasureTimestamp: { RealValue: number };
        PositionAndShape: { AbsolutePosition: { x: number; y: number } };
      }>;
    }>>;
    GetNearestStaffEntry(point: unknown): {
      relInMeasureTimestamp: { RealValue: number };
      parentMeasure: { parentSourceMeasure: { measureListIndex: number } };
    } | null;
  };
};

const NOTE_NAMES = [
  'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa',
  'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si',
];

const NOTE_COLORS = [
  '#E21C48', '#F26622', '#F99D1C', '#FFCC33', '#FFF32B', '#BCD85F',
  '#62BC47', '#009C95', '#0071BB', '#5E50A1', '#8D5BA6', '#CF3E96',
];

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

function applyPitchClassColors(osmd: OSMDType): number {
  let coloredNotes = 0;

  for (const measure of osmd.Sheet.SourceMeasures) {
    for (const container of measure.VerticalSourceStaffEntryContainers) {
      for (const staffEntry of container.StaffEntries) {
        if (!staffEntry) continue;
        for (const voiceEntry of staffEntry.VoiceEntries) {
          for (const note of voiceEntry.Notes) {
            const pitch = note.Pitch;
            if (!pitch || note.isRest()) continue;
            const pitchClass = (
              (Number(pitch.FundamentalNote) + pitch.AccidentalHalfTones) % 12 + 12
            ) % 12;
            note.NoteheadColor = NOTE_COLORS[pitchClass];
            coloredNotes += 1;
          }
        }
      }
    }
  }

  return coloredNotes;
}

function parseScore(xmlText: string): ScoreMeasure[] {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const part = doc.querySelector('score-partwise > part');
  if (!part) return [];

  let divisions = 1;
  return Array.from(part.children)
    .filter((node) => node.tagName === 'measure')
    .map((measure) => {
      let cursor = 0;
      let lastOnset = 0;
      const grouped = new Map<number, ScoreNote[]>();

      for (const child of Array.from(measure.children)) {
        if (child.tagName === 'attributes') {
          const nextDivisions = Number(child.querySelector('divisions')?.textContent);
          if (Number.isFinite(nextDivisions) && nextDivisions > 0) divisions = nextDivisions;
          continue;
        }
        if (child.tagName === 'backup') {
          cursor -= Number(child.querySelector('duration')?.textContent ?? 0);
          continue;
        }
        if (child.tagName === 'forward') {
          cursor += Number(child.querySelector('duration')?.textContent ?? 0);
          continue;
        }
        if (child.tagName !== 'note') continue;

        const duration = Number(child.querySelector(':scope > duration')?.textContent ?? 0);
        const isChord = Boolean(child.querySelector(':scope > chord'));
        const isGrace = Boolean(child.querySelector(':scope > grace'));
        const onset = isChord ? lastOnset : cursor;
        lastOnset = onset;

        const pitch = child.querySelector(':scope > pitch');
        if (pitch) {
          const step = pitch.querySelector('step')?.textContent ?? 'C';
          const alter = Number(pitch.querySelector('alter')?.textContent ?? 0);
          const octave = Number(pitch.querySelector('octave')?.textContent ?? 4);
          const midi = (octave + 1) * 12 + STEP_TO_SEMITONE[step] + alter;
          const hand: Hand = child.querySelector(':scope > staff')?.textContent === '2' ? 'left' : 'right';
          const notes = grouped.get(onset) ?? [];
          notes.push({ midi, label: midiLabel(midi), hand });
          grouped.set(onset, notes);
        }

        if (!isChord && !isGrace) cursor += duration;
      }

      const positions = Array.from(grouped.entries())
        .sort(([a], [b]) => a - b)
        .map(([onset, notes]) => ({
          time: onset / (divisions * 4),
          notes: dedupeNotes(notes),
        }));

      return { number: measure.getAttribute('number') ?? '?', positions };
    });
}

function dedupeNotes(notes: ScoreNote[]): ScoreNote[] {
  const seen = new Set<string>();
  return notes.filter((note) => {
    const key = `${note.midi}-${note.hand}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function midiLabel(midi: number) {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

function textColor(background: string) {
  const rgb = background.replace('#', '').match(/.{2}/g)?.map((part) => parseInt(part, 16)) ?? [0, 0, 0];
  const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  return luminance > 165 ? '#1D2433' : '#FFFFFF';
}

export function MoonlightTrainer() {
  const scoreRef = useRef<HTMLDivElement>(null);
  const scoreScrollRef = useRef<HTMLDivElement>(null);
  const keyboardScrollRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<RuntimeOsmd | null>(null);
  const pointFactoryRef = useRef<((x: number, y: number) => unknown) | null>(null);
  const [measures, setMeasures] = useState<ScoreMeasure[]>([]);
  const [selection, setSelection] = useState<Selection>({ measureIndex: 0, positionIndex: 0 });
  const [marker, setMarker] = useState<Marker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [helpOpen, setHelpOpen] = useState(true);

  const selectedMeasure = measures[selection.measureIndex];
  const selectedPosition = selectedMeasure?.positions[selection.positionIndex];
  const activeNotes = useMemo(() => selectedPosition?.notes ?? [], [selectedPosition]);

  const activeByMidi = useMemo(() => {
    const map = new Map<number, Set<Hand>>();
    for (const note of activeNotes) {
      const hands = map.get(note.midi) ?? new Set<Hand>();
      hands.add(note.hand);
      map.set(note.midi, hands);
    }
    return map;
  }, [activeNotes]);

  const placeMarker = useCallback((measureIndex: number, time: number, shouldScroll = true) => {
    const osmd = osmdRef.current;
    if (!osmd) return;
    const graphicalMeasures = osmd.graphic.MeasureList[measureIndex] ?? [];
    const entries = graphicalMeasures.flatMap((measure) => measure?.staffEntries ?? []);
    if (!entries.length) return;
    const entry = entries.reduce((closest, candidate) =>
      Math.abs(candidate.relInMeasureTimestamp.RealValue - time) <
      Math.abs(closest.relInMeasureTimestamp.RealValue - time) ? candidate : closest,
    );
    const position = entry.PositionAndShape.AbsolutePosition;
    const zoom = osmd.zoom || 1;
    const nextMarker = { x: position.x * 10 * zoom, y: position.y * 10 * zoom };
    setMarker(nextMarker);
    if (shouldScroll) {
      scoreScrollRef.current?.scrollTo({ top: Math.max(0, nextMarker.y - 110), behavior: 'smooth' });
    }
  }, []);

  const chooseSelection = useCallback((measureIndex: number, positionIndex: number, shouldScroll = true) => {
    const measure = measures[measureIndex];
    if (!measure?.positions.length) return;
    const boundedPosition = Math.max(0, Math.min(positionIndex, measure.positions.length - 1));
    setSelection({ measureIndex, positionIndex: boundedPosition });
    placeMarker(measureIndex, measure.positions[boundedPosition].time, shouldScroll);
  }, [measures, placeMarker]);

  const move = useCallback((direction: -1 | 1) => {
    if (!measures.length) return;
    let nextMeasure = selection.measureIndex;
    let nextPosition = selection.positionIndex + direction;
    if (nextPosition < 0) {
      nextMeasure = Math.max(0, nextMeasure - 1);
      nextPosition = Math.max(0, (measures[nextMeasure]?.positions.length ?? 1) - 1);
    } else if (nextPosition >= (measures[nextMeasure]?.positions.length ?? 0)) {
      nextMeasure = Math.min(measures.length - 1, nextMeasure + 1);
      nextPosition = 0;
    }
    chooseSelection(nextMeasure, nextPosition);
  }, [chooseSelection, measures, selection]);

  useEffect(() => {
    let cancelled = false;
    async function loadScore() {
      try {
        const scoreUrl = new URL('score/moonlight.musicxml', document.baseURI);
        const response = await fetch(scoreUrl);
        if (!response.ok) throw new Error('No se pudo cargar la partitura');
        const xml = await response.text();
        const parsed = parseScore(xml);
        if (cancelled || !scoreRef.current) return;
        setMeasures(parsed);

        const { OpenSheetMusicDisplay, PointF2D } = await import('opensheetmusicdisplay');
        if (cancelled || !scoreRef.current) return;
        scoreRef.current.innerHTML = '';
        const osmd = new OpenSheetMusicDisplay(scoreRef.current, {
          backend: 'svg',
          autoResize: false,
          pageFormat: 'Endless',
          drawingParameters: 'compacttight',
          drawTitle: false,
          drawComposer: false,
          drawPartNames: false,
          drawMeasureNumbers: true,
          drawMeasureNumbersOnlyAtSystemStart: false,
          coloringEnabled: true,
          coloringMode: 0,
          colorStemsLikeNoteheads: false,
        });
        osmd.zoom = 0.88;
        await osmd.load(xml);
        if (cancelled) return;
        const coloredNotes = applyPitchClassColors(osmd);
        if (coloredNotes === 0) throw new Error('No se pudieron colorear las notas');
        osmd.render();
        osmdRef.current = osmd as RuntimeOsmd;
        pointFactoryRef.current = (x, y) => new PointF2D(x, y);
        setStatus('ready');
        requestAnimationFrame(() => placeMarker(0, parsed[0]?.positions[0]?.time ?? 0, false));
      } catch (error) {
        console.error(error);
        if (!cancelled) setStatus('error');
      }
    }
    void loadScore();
    return () => {
      cancelled = true;
      osmdRef.current?.clear();
      osmdRef.current = null;
    };
  }, [placeMarker]);

  useEffect(() => {
    if (!activeNotes.length || !keyboardScrollRef.current) return;
    const averageMidi = activeNotes.reduce((sum, note) => sum + note.midi, 0) / activeNotes.length;
    const whiteBefore = Array.from({ length: Math.max(0, Math.floor(averageMidi) - 21) }, (_, index) => 21 + index)
      .filter((midi) => WHITE_PITCH_CLASSES.has(midi % 12)).length;
    keyboardScrollRef.current.scrollTo({
      left: Math.max(0, whiteBefore * 38 - keyboardScrollRef.current.clientWidth / 2),
      behavior: 'smooth',
    });
  }, [activeNotes]);

  function handleScoreClick(event: React.MouseEvent<HTMLButtonElement>) {
    const osmd = osmdRef.current;
    const factory = pointFactoryRef.current;
    const svg = scoreRef.current?.querySelector('svg');
    if (!osmd || !factory || !svg || !measures.length) return;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / (10 * (osmd.zoom || 1));
    const y = (event.clientY - rect.top) / (10 * (osmd.zoom || 1));
    const entry = osmd.graphic.GetNearestStaffEntry(factory(x, y));
    if (!entry) return;
    const measureIndex = entry.parentMeasure.parentSourceMeasure.measureListIndex;
    const positions = measures[measureIndex]?.positions ?? [];
    if (!positions.length) return;
    const positionIndex = positions.reduce((closest, position, index) =>
      Math.abs(position.time - entry.relInMeasureTimestamp.RealValue) <
      Math.abs(positions[closest].time - entry.relInMeasureTimestamp.RealValue) ? index : closest, 0);
    chooseSelection(measureIndex, positionIndex, false);
    setMarker({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    setHelpOpen(false);
  }

  return (
    <main className="trainer-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true"><Music2 size={21} strokeWidth={1.8} /></div>
        <div className="brand-copy">
          <p>Beethoven · Sonata n.º 14</p>
          <h1>Claro de luna <span>del pentagrama al piano</span></h1>
        </div>
        <div className="header-actions">
          <span className={`status-dot ${status}`} />
          <span className="status-label">
            {status === 'ready' ? 'Partitura preparada' : status === 'error' ? 'Error de carga' : 'Preparando partitura'}
          </span>
          <Button variant="outline" size="icon" aria-label="Mostrar ayuda" onClick={() => setHelpOpen((open) => !open)}>
            <CircleHelp size={18} />
          </Button>
        </div>
      </header>

      <section className="workspace">
        <div className="score-column">
          <div className="score-toolbar">
            <div className="measure-readout">
              <span>Compás</span><strong>{selectedMeasure?.number ?? '1'}</strong>
              <span className="position-count">posición {selection.positionIndex + 1} de {selectedMeasure?.positions.length ?? 0}</span>
            </div>
            <div className="transport" aria-label="Navegación por la partitura">
              <Button variant="outline" size="sm" onClick={() => move(-1)} disabled={status !== 'ready'}>
                <ChevronLeft size={17} /> Anterior
              </Button>
              <Button variant="outline" size="sm" onClick={() => move(1)} disabled={status !== 'ready'}>
                Siguiente <ChevronRight size={17} />
              </Button>
            </div>
            <label className="measure-jump">
              <span>Ir al compás</span>
              <input type="range" min="1" max={Math.max(1, measures.length)} value={selection.measureIndex + 1}
                onChange={(event) => chooseSelection(Number(event.target.value) - 1, 0)} disabled={status !== 'ready'} />
              <output>{selection.measureIndex + 1} / {measures.length || 92}</output>
            </label>
          </div>

          <div ref={scoreScrollRef} className="score-scroll">
            {status === 'loading' && (
              <output className="score-loading">
                <div className="loading-note">♪</div><strong>Preparando los 92 compases…</strong>
                <span>La partitura aparecerá coloreada por notas.</span>
              </output>
            )}
            {status === 'error' && (
              <div className="score-loading error" role="alert">
                <strong>No se pudo abrir la partitura.</strong><span>Recarga la página para intentarlo de nuevo.</span>
              </div>
            )}
            <button
              type="button"
              className="score-canvas-wrap"
              onClick={handleScoreClick}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') move(-1);
                if (event.key === 'ArrowRight') move(1);
              }}
              aria-label="Partitura interactiva. Pulsa una zona o usa las flechas izquierda y derecha para cambiar de posición."
            >
              <div ref={scoreRef} className="score-canvas" aria-label="Partitura interactiva de Claro de luna" />
              {marker && status === 'ready' && (
                <span className="score-marker" style={{ left: marker.x, top: marker.y }} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <aside className="selection-panel" aria-live="polite">
          <div className="selection-heading">
            <Piano size={20} />
            <div><span>Qué tocar ahora</span><strong>{activeNotes.length} {activeNotes.length === 1 ? 'tecla' : 'teclas'}</strong></div>
          </div>
          <HandGroup label="Mano derecha" hand="right" notes={activeNotes} />
          <HandGroup label="Mano izquierda" hand="left" notes={activeNotes} />
          <div className="selection-tip">
            <MousePointer2 size={17} />
            <p><strong>Pulsa una nota o zona del pentagrama.</strong> La marca roja indica la posición elegida.</p>
          </div>
          {helpOpen && (
            <div className="help-card">
              <strong>Cómo usarlo</strong>
              <ol><li>Toca cualquier punto de la partitura.</li><li>Mira las teclas encendidas abajo.</li><li>Avanza posición a posición con los botones.</li></ol>
              <p>Los colores identifican Do, Re, Mi… y se repiten en cada octava.</p>
            </div>
          )}
        </aside>
      </section>

      <KeyboardDock activeByMidi={activeByMidi} scrollRef={keyboardScrollRef} />
    </main>
  );
}

function HandGroup({ label, hand, notes }: { label: string; hand: Hand; notes: ScoreNote[] }) {
  const handNotes = notes.filter((note) => note.hand === hand);
  return (
    <div className="hand-group">
      <div className="hand-title"><span className={`hand-dot ${hand}`} /> {label}</div>
      <div className="note-pills">
        {handNotes.map((note) => <NotePill key={`${hand}-${note.midi}`} note={note} />)}
        {!handNotes.length && <span className="rest-label">Espera</span>}
      </div>
    </div>
  );
}

function NotePill({ note }: { note: ScoreNote }) {
  const color = NOTE_COLORS[note.midi % 12];
  return <span className="note-pill" style={{ background: color, color: textColor(color) }}>{note.label}</span>;
}

function KeyboardDock({ activeByMidi, scrollRef }: {
  activeByMidi: Map<number, Set<Hand>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const whiteKeys = useMemo(() =>
    Array.from({ length: 88 }, (_, index) => index + 21).filter((midi) => WHITE_PITCH_CLASSES.has(midi % 12)), []);
  const whiteWidth = 38;
  return (
    <section className="keyboard-dock" aria-label="Teclado de piano">
      <div className="keyboard-meta">
        <div><span className="eyebrow">Teclado completo · 88 teclas</span>
          <strong>{activeByMidi.size ? 'Las teclas encendidas se pulsan juntas' : 'Selecciona una posición de la partitura'}</strong></div>
        <div className="hand-legend"><span><i className="hand-dot right" /> derecha</span><span><i className="hand-dot left" /> izquierda</span></div>
      </div>
      <div ref={scrollRef} className="keyboard-scroll">
        <div className="keyboard" style={{ width: whiteKeys.length * whiteWidth }}>
          {whiteKeys.map((midi, index) => {
            const hands = activeByMidi.get(midi);
            const active = Boolean(hands?.size);
            const color = NOTE_COLORS[midi % 12];
            return (
              <div key={midi}
                className={`white-key ${active ? 'active' : ''} ${hands?.has('right') ? 'right-hand' : ''} ${hands?.has('left') ? 'left-hand' : ''}`}
                style={{ left: index * whiteWidth, width: whiteWidth, '--note-color': color } as React.CSSProperties}
                aria-label={`${midiLabel(midi)}${active ? ', pulsar' : ''}`}>
                {(midi % 12 === 0 || active) && <span>{midiLabel(midi)}</span>}
              </div>
            );
          })}
          {whiteKeys.slice(0, -1).map((midi, index) => {
            const blackMidi = midi + 1;
            if (WHITE_PITCH_CLASSES.has(blackMidi % 12)) return null;
            const hands = activeByMidi.get(blackMidi);
            const active = Boolean(hands?.size);
            const color = NOTE_COLORS[blackMidi % 12];
            return (
              <div key={blackMidi}
                className={`black-key ${active ? 'active' : ''} ${hands?.has('right') ? 'right-hand' : ''} ${hands?.has('left') ? 'left-hand' : ''}`}
                style={{ left: (index + 1) * whiteWidth - 11, '--note-color': color } as React.CSSProperties}
                aria-label={`${midiLabel(blackMidi)}${active ? ', pulsar' : ''}`}>
                {active && <span>{midiLabel(blackMidi)}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
