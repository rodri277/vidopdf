import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../state/session';
import type { AssetInfo, AssetProblem } from '../../state/session-store';
import { canvasToFile, trimCanvas } from './trim';

type Kind = 'draw' | 'type' | 'image';
const KINDS: readonly Kind[] = ['draw', 'type', 'image'];
const SIZE = { width: 520, height: 180 };
const INK = ['#111827', '#1d4ed8'] as const;
const FONTS = ['cursive', 'serif', 'sans-serif'] as const;

interface Props {
  readonly onCreated: (asset: AssetInfo) => void;
}

/** Three ways to make a signature: draw it, type it, or use a picture of it. Nothing is stored. */
export function SignatureMaker({ onCreated }: Props) {
  const { t } = useTranslation();
  const name = useId();
  const [kind, setKind] = useState<Kind>('draw');
  const [ink, setInk] = useState<string>(INK[0]);
  const [text, setText] = useState('');
  const [font, setFont] = useState<(typeof FONTS)[number]>('cursive');
  const [problem, setProblem] = useState<AssetProblem | 'empty' | undefined>();
  const pad = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ x: number; y: number } | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null);
  const { addAsset } = useSession.getState();

  const register = async (made: File | undefined) => {
    if (made === undefined) {
      setProblem('empty');
      return;
    }
    const result = await addAsset(made);
    if (typeof result === 'string') setProblem(result);
    else {
      setProblem(undefined);
      onCreated(result);
    }
  };

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * SIZE.width,
      y: ((event.clientY - box.top) / box.height) * SIZE.height,
    };
  };
  const stroke = (event: PointerEvent<HTMLCanvasElement>) => {
    const from = drawing.current;
    const context = pad.current?.getContext('2d');
    if (from === undefined || context === null || context === undefined) return;
    const to = point(event);
    context.strokeStyle = ink;
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    drawing.current = to;
  };

  const useDrawing = () => {
    const source = pad.current;
    const trimmed = source === null ? undefined : trimCanvas(source);
    void (trimmed === undefined
      ? register(undefined)
      : canvasToFile(trimmed, 'signature.png').then(register));
  };

  const useTyped = () => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE.width * 2;
    canvas.height = SIZE.height * 2;
    const context = canvas.getContext('2d');
    if (context === null || text.trim() === '') {
      void register(undefined);
      return;
    }
    context.fillStyle = ink;
    context.font = `italic 96px ${font}`;
    context.textBaseline = 'middle';
    context.fillText(text.trim(), 20, canvas.height / 2, canvas.width - 40);
    const trimmed = trimCanvas(canvas, 12);
    void (trimmed === undefined
      ? register(undefined)
      : canvasToFile(trimmed, 'signature.png').then(register));
  };

  return (
    <fieldset className="stamp-form">
      <legend>{t('sign.make.title')}</legend>
      <div role="radiogroup" aria-label={t('sign.make.title')} className="choices">
        {KINDS.map((value) => (
          <label key={value} className="choice">
            <input
              type="radio"
              name={name}
              checked={kind === value}
              onChange={() => {
                setKind(value);
                setProblem(undefined);
              }}
            />
            <span>{t(`sign.make.kinds.${value}`)}</span>
          </label>
        ))}
      </div>
      {kind !== 'image' && (
        <div className="field-row">
          {INK.map((color) => (
            <label key={color} className="choice">
              <input
                type="radio"
                name={`${name}-ink`}
                checked={ink === color}
                onChange={() => {
                  setInk(color);
                }}
              />
              <span className="ink-swatch" style={{ background: color }} aria-hidden="true" />
              <span className="visually-hidden">
                {t(color === INK[0] ? 'sign.make.black' : 'sign.make.blue')}
              </span>
            </label>
          ))}
        </div>
      )}
      {kind === 'draw' && (
        <div role="group" aria-label={t('sign.make.padLabel')} className="stamp-fields">
          <canvas
            ref={pad}
            className="signature-pad"
            width={SIZE.width}
            height={SIZE.height}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drawing.current = point(event);
            }}
            onPointerMove={stroke}
            onPointerUp={() => {
              drawing.current = undefined;
            }}
            onPointerCancel={() => {
              drawing.current = undefined;
            }}
          />
          <div className="field-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                pad.current?.getContext('2d')?.clearRect(0, 0, SIZE.width, SIZE.height);
              }}
            >
              {t('sign.make.clear')}
            </button>
            <button type="button" className="btn btn-primary" onClick={useDrawing}>
              {t('sign.make.use')}
            </button>
          </div>
          <p className="muted">{t('sign.make.drawHint')}</p>
        </div>
      )}
      {kind === 'type' && (
        <>
          <label className="field">
            <span>{t('sign.make.typeLabel')}</span>
            <input
              type="text"
              value={text}
              maxLength={60}
              onChange={(event) => {
                setText(event.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>{t('sign.make.style')}</span>
            <select
              value={font}
              onChange={(event) => {
                setFont(FONTS.find((f) => f === event.target.value) ?? 'cursive');
              }}
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {t(`sign.make.fonts.${f}`)}
                </option>
              ))}
            </select>
          </label>
          <p className="typed-preview" style={{ color: ink, fontFamily: font }} aria-hidden="true">
            {text}
          </p>
          <button type="button" className="btn btn-primary" onClick={useTyped}>
            {t('sign.make.use')}
          </button>
        </>
      )}
      {kind === 'image' && (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => {
              file.current?.click();
            }}
          >
            {t('sign.make.choose')}
          </button>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            data-testid="signature-input"
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.target.value = '';
              if (chosen !== undefined) void register(chosen);
            }}
          />
          <p className="muted">{t('sign.make.imageHint')}</p>
        </>
      )}
      {problem !== undefined && <p role="alert">{t(`sign.make.problems.${problem}`)}</p>}
    </fieldset>
  );
}
