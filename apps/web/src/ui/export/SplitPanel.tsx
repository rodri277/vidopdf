import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  analyzeRanges,
  buildSplitPlan,
  outlineDepth,
  parseRanges,
  suggestedBaseName,
} from '@vidopdf/core';
import { useSession } from '../../state/session';
import { protectIncomplete } from '../../state/session-store';
import { sameSpec, specFromDraft, usableBookmarks } from '../../state/split';
import type { SplitKind } from '../../state/split';
import { useUi } from '../../state/ui-store';
import { CompressionField } from './CompressionField';
import { ProtectField } from './ProtectField';
import { formatBytes } from '../format';
import { describePages, splitErrorMessage } from './messages';

const KINDS: readonly SplitKind[] = ['every', 'ranges', 'bookmarks', 'size'];
/** The preview lists this many files, then says how many more there are. */
const PREVIEW_LIMIT = 30;

function useLivePreview(kind: SplitKind) {
  const draft = useUi((state) => state.splitDraft);
  const pages = useSession((state) => state.session.workspace.pages);
  const { previewSplit, clearSplit } = useSession.getState();
  const spec = useMemo(() => specFromDraft(draft), [draft]);

  useEffect(() => {
    // Sizes are measured on demand, so a stale measurement must not outlive its inputs.
    if (kind === 'size') {
      clearSplit();
      return;
    }
    const timer = setTimeout(() => void previewSplit(spec), kind === 'ranges' ? 150 : 0);
    return () => {
      clearTimeout(timer);
    };
  }, [kind, spec, pages, previewSplit, clearSplit]);
  return spec;
}

function RangesFields() {
  const { t } = useTranslation();
  const draft = useUi((state) => state.splitDraft);
  const { patchSplit } = useUi.getState();
  const total = useSession((state) => state.session.workspace.pages.length);
  const parsed = parseRanges(draft.ranges, total);
  const coverage = parsed.ok ? analyzeRanges(parsed.value, total) : undefined;
  return (
    <>
      <label className="field">
        <span>{t('export.split.rangesLabel')}</span>
        <input
          type="text"
          value={draft.ranges}
          placeholder="1-3, 5, 8-"
          aria-describedby="ranges-hint"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            patchSplit({ ranges: event.target.value });
          }}
        />
        <small id="ranges-hint" className="muted">
          {t('export.split.rangesHint')}
        </small>
      </label>
      <label className="choice">
        <input
          type="checkbox"
          checked={draft.keepRest}
          onChange={(event) => {
            patchSplit({ keepRest: event.target.checked });
          }}
        />
        <span>{t('export.split.keepRest')}</span>
      </label>
      {coverage !== undefined && coverage.repeated.length > 0 && (
        <p className="warning">
          {t('export.split.repeated', { pages: describePages(coverage.repeated) })}
        </p>
      )}
      {coverage !== undefined && coverage.unassigned.length > 0 && !draft.keepRest && (
        <p className="muted">
          {t('export.split.unassigned', { pages: describePages(coverage.unassigned) })}
        </p>
      )}
    </>
  );
}

function BookmarkFields() {
  const { t } = useTranslation();
  const draft = useUi((state) => state.splitDraft);
  const { patchSplit } = useUi.getState();
  const pages = useSession((state) => state.session.workspace.pages);
  const outlines = useSession((state) => state.outlines);
  const { loadOutlines } = useSession.getState();
  useEffect(() => {
    void loadOutlines();
  }, [loadOutlines, pages]);
  const depth = Math.max(0, ...Object.values(outlines).map((entries) => outlineDepth(entries)));
  const count = usableBookmarks(pages, outlines, draft.level);
  return (
    <>
      {depth > 1 && (
        <label className="field">
          <span>{t('export.split.levelLabel')}</span>
          <select
            value={draft.level}
            onChange={(event) => {
              patchSplit({ level: Number(event.target.value) });
            }}
          >
            {Array.from({ length: depth }, (_, i) => i + 1).map((level) => (
              <option key={level} value={level}>
                {t('export.split.levelOption', { n: level })}
              </option>
            ))}
          </select>
        </label>
      )}
      <p>
        {count > 0 ? t('export.split.bookmarksFound', { count }) : t('export.split.bookmarksNone')}
      </p>
      <p className="muted">{t('export.split.bookmarksCaveat')}</p>
    </>
  );
}

function SizeFields() {
  const { t } = useTranslation();
  const draft = useUi((state) => state.splitDraft);
  const { patchSplit } = useUi.getState();
  const split = useSession((state) => state.split);
  const { previewSplit, cancelJob } = useSession.getState();
  const spec = specFromDraft(draft);
  const measuring = split.phase === 'measuring';
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>{t('export.split.sizeLabel')}</span>
          <input
            type="number"
            min={1}
            step="any"
            value={Number.isNaN(draft.sizeValue) ? '' : draft.sizeValue}
            onChange={(event) => {
              patchSplit({ sizeValue: event.target.valueAsNumber });
            }}
          />
        </label>
        <label className="field">
          <span>{t('export.split.sizeUnit')}</span>
          <select
            value={draft.sizeUnit}
            onChange={(event) => {
              patchSplit({ sizeUnit: event.target.value === 'KB' ? 'KB' : 'MB' });
            }}
          >
            <option value="KB">KB</option>
            <option value="MB">MB</option>
          </select>
        </label>
      </div>
      <p className="muted">{t('export.split.sizeHint')}</p>
      {measuring ? (
        <>
          <progress max={split.total} value={split.done} aria-label={t('export.split.measure')} />
          <p role="status" className="mono">
            {t('export.split.measuring', { done: split.done, total: split.total })}
          </p>
          <button type="button" className="btn" onClick={cancelJob}>
            {t('export.cancel')}
          </button>
        </>
      ) : (
        <button type="button" className="btn" onClick={() => void previewSplit(spec)}>
          {t('export.split.measure')}
        </button>
      )}
    </>
  );
}

function Preview({ stale }: { stale: boolean }) {
  const { t } = useTranslation();
  const split = useSession((state) => state.split);
  const workspace = useSession((state) => state.session.workspace);
  const kind = useUi((state) => state.splitDraft.kind);
  if (split.phase === 'failed') {
    const quiet = split.error.kind === 'ranges' && split.error.problem.kind === 'empty';
    const text = splitErrorMessage(t, split.error);
    return quiet ? <p className="muted">{text}</p> : <p role="alert">{text}</p>;
  }
  if (split.phase !== 'ready' || stale)
    return kind === 'size' ? <p className="muted">{t('export.split.needsMeasure')}</p> : null;
  const plan = buildSplitPlan(workspace, split.groups, suggestedBaseName(workspace));
  return (
    <div className="preview-list">
      <h3>{t('export.split.previewTitle', { count: plan.outputs.length })}</h3>
      <ul>
        {plan.outputs.slice(0, PREVIEW_LIMIT).map((output, index) => {
          const pages = split.groups[index]?.pages.length ?? 0;
          const size = split.sizes?.[index];
          return (
            <li key={output.name} className="mono">
              {size === undefined
                ? t('export.split.previewItem', { name: output.name, count: pages })
                : t('export.split.previewItemSize', {
                    name: output.name,
                    pages,
                    size: formatBytes(size),
                  })}
            </li>
          );
        })}
      </ul>
      {plan.outputs.length > PREVIEW_LIMIT && (
        <p className="muted">
          {t('export.split.previewMore', { count: plan.outputs.length - PREVIEW_LIMIT })}
        </p>
      )}
    </div>
  );
}

export function SplitPanel() {
  const { t } = useTranslation();
  const draft = useUi((state) => state.splitDraft);
  const { patchSplit } = useUi.getState();
  const split = useSession((state) => state.split);
  const busy = useSession((state) => state.job.phase === 'running');
  const { runSplit } = useSession.getState();
  const spec = useLivePreview(draft.kind);
  const stale = split.phase === 'ready' && !sameSpec(split.spec, spec);
  const incomplete = useSession((state) => protectIncomplete(state.protect));
  const canRun = split.phase === 'ready' && !stale && !busy && !incomplete;

  return (
    <>
      <fieldset>
        <legend>{t('export.split.kindLabel')}</legend>
        {KINDS.map((kind) => (
          <label key={kind} className="choice">
            <input
              type="radio"
              name="split-kind"
              checked={draft.kind === kind}
              onChange={() => {
                patchSplit({ kind });
              }}
            />
            <span>{t(`export.split.kinds.${kind}`)}</span>
          </label>
        ))}
      </fieldset>

      {draft.kind === 'every' && (
        <label className="field">
          <span>{t('export.split.everyLabel')}</span>
          <input
            type="number"
            min={1}
            step={1}
            value={Number.isNaN(draft.every) ? '' : draft.every}
            onChange={(event) => {
              patchSplit({ every: event.target.valueAsNumber });
            }}
          />
        </label>
      )}
      {draft.kind === 'ranges' && <RangesFields />}
      {draft.kind === 'bookmarks' && <BookmarkFields />}
      {draft.kind === 'size' && <SizeFields />}

      <Preview stale={stale} />
      <CompressionField />
      <ProtectField />
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canRun}
          onClick={() => void runSplit()}
        >
          {t('export.split.run')}
        </button>
      </div>
    </>
  );
}
