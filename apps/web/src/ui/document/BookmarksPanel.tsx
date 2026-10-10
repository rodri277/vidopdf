import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_TITLE_LENGTH,
  addBookmark,
  flattenBookmarks,
  indentBookmark,
  outdentBookmark,
  removeBookmark,
  shiftBookmark,
  updateBookmark,
} from '@vidopdf/core';
import type { BookmarkMode, BookmarkNode } from '@vidopdf/core';
import { useSession } from '../../state/session';
import { NumberField } from './fields';

const MODES: readonly BookmarkMode[] = ['auto', 'custom', 'none'];

function Row({ node, depth, pageCount }: { node: BookmarkNode; depth: number; pageCount: number }) {
  const { t } = useTranslation();
  const pages = useSession((state) => state.session.workspace.pages);
  const { editBookmarks } = useSession.getState();
  const position =
    node.pageId === null ? 0 : pages.findIndex((page) => page.id === node.pageId) + 1;
  const name = node.title === '' ? t('document.bookmarks.untitled') : node.title;
  const act = (label: string, change: (nodes: readonly BookmarkNode[]) => BookmarkNode[]) => (
    <button
      type="button"
      className="btn btn-small"
      aria-label={`${label}: ${name}`}
      onClick={() => {
        editBookmarks(change);
      }}
    >
      {label}
    </button>
  );
  return (
    <li className="bookmark-row" style={{ marginInlineStart: `${String(depth * 20)}px` }}>
      <label className="field">
        <span className="visually-hidden">{t('document.bookmarks.title')}</span>
        <input
          type="text"
          value={node.title}
          maxLength={MAX_TITLE_LENGTH}
          placeholder={t('document.bookmarks.title')}
          onChange={(event) => {
            editBookmarks(
              (nodes) => updateBookmark(nodes, node.id, { title: event.target.value }),
              `title:${node.id}`,
            );
          }}
        />
      </label>
      <NumberField
        label={t('document.bookmarks.page')}
        value={position}
        min={0}
        max={pageCount}
        onChange={(value) => {
          editBookmarks(
            (nodes) =>
              updateBookmark(nodes, node.id, {
                pageId: value === 0 ? null : (pages[value - 1]?.id ?? null),
              }),
            `page:${node.id}`,
          );
        }}
      />
      <div className="bookmark-actions">
        {act(t('document.bookmarks.up'), (nodes) => shiftBookmark(nodes, node.id, -1))}
        {act(t('document.bookmarks.down'), (nodes) => shiftBookmark(nodes, node.id, 1))}
        {act(t('document.bookmarks.indent'), (nodes) => indentBookmark(nodes, node.id))}
        {act(t('document.bookmarks.outdent'), (nodes) => outdentBookmark(nodes, node.id))}
        {act(t('document.bookmarks.remove'), (nodes) => removeBookmark(nodes, node.id))}
      </div>
    </li>
  );
}

/** The bookmarks of the output: the files' own, a tree edited by hand, or none. */
export function BookmarksPanel() {
  const { t } = useTranslation();
  const name = useId();
  const settings = useSession((state) => state.session.workspace.bookmarks);
  const pages = useSession((state) => state.session.workspace.pages);
  const { setBookmarkMode, editBookmarks, importBookmarks } = useSession.getState();
  const rows = flattenBookmarks(settings.nodes);
  return (
    <fieldset className="stamp-form">
      <legend>{t('document.bookmarks.legend')}</legend>
      <div role="radiogroup" aria-label={t('document.bookmarks.legend')} className="choices">
        {MODES.map((mode) => (
          <label key={mode} className="choice">
            <input
              type="radio"
              name={name}
              checked={settings.mode === mode}
              onChange={() => {
                setBookmarkMode(mode);
              }}
            />
            <span>{t(`document.bookmarks.modes.${mode}`)}</span>
          </label>
        ))}
      </div>
      <p className="muted">{t(`document.bookmarks.hints.${settings.mode}`)}</p>
      {settings.mode === 'custom' && (
        <div className="stamp-fields">
          <div className="field-row">
            <button type="button" className="btn" onClick={() => void importBookmarks()}>
              {t('document.bookmarks.import')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                editBookmarks((nodes) =>
                  addBookmark(nodes, null, {
                    id: crypto.randomUUID(),
                    title: t('document.bookmarks.newTitle'),
                    pageId: pages[0]?.id ?? null,
                    children: [],
                  }),
                );
              }}
            >
              {t('document.bookmarks.add')}
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="muted">{t('document.bookmarks.empty')}</p>
          ) : (
            <ul className="bookmark-list">
              {rows.map(({ node, depth }) => (
                <Row key={node.id} node={node} depth={depth} pageCount={pages.length} />
              ))}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  );
}
