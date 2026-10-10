import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ALL_ALLOWED } from '@vidopdf/core';
import type { Permissions } from '@vidopdf/core';
import { useSession } from '../../state/session';
import type { ProtectDraft } from '../../state/session-store';

const EMPTY: ProtectDraft = {
  userPassword: '',
  confirm: '',
  ownerPassword: '',
  permissions: ALL_ALLOWED,
};

const SWITCHES = [
  ['print', 'print'],
  ['copy', 'copy'],
  ['modify', 'modify'],
  ['annotate', 'annotate'],
] as const;

/** Passwords for the result: one to open it, what readers may do, and nothing is ever kept. */
export function ProtectField() {
  const { t } = useTranslation();
  const id = useId();
  const draft = useSession((state) => state.protect);
  const restricted = useSession((state) =>
    state.session.workspace.sources.some((source) => source.restrictions !== undefined),
  );
  const { setProtect } = useSession.getState();
  const change = (changes: Partial<ProtectDraft>) => {
    setProtect({ ...(draft ?? EMPTY), ...changes });
  };
  const allow = (key: (typeof SWITCHES)[number][0], on: boolean) => {
    const permissions: Permissions = { ...(draft ?? EMPTY).permissions };
    change({
      permissions:
        key === 'print'
          ? { ...permissions, print: on ? 'high' : 'none' }
          : { ...permissions, [key]: on },
    });
  };
  const mismatch =
    draft !== undefined && draft.confirm !== '' && draft.confirm !== draft.userPassword;

  return (
    <fieldset>
      <legend>{t('protect.legend')}</legend>
      <label className="choice">
        <input
          type="checkbox"
          checked={draft !== undefined}
          onChange={(event) => {
            setProtect(event.target.checked ? EMPTY : undefined);
          }}
        />
        <span>{t('protect.enable')}</span>
      </label>
      {restricted && <p className="warning">{t('protect.inherited')}</p>}
      {draft !== undefined && (
        <div className="stamp-fields">
          <label className="field">
            <span>{t('protect.password')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={draft.userPassword}
              onChange={(event) => {
                change({ userPassword: event.target.value });
              }}
            />
          </label>
          <div className="field">
            <label htmlFor={`${id}-confirm`}>{t('protect.confirm')}</label>
            <input
              id={`${id}-confirm`}
              type="password"
              autoComplete="new-password"
              value={draft.confirm}
              aria-invalid={mismatch}
              onChange={(event) => {
                change({ confirm: event.target.value });
              }}
            />
            {mismatch && <span role="alert">{t('protect.mismatch')}</span>}
          </div>
          <fieldset className="anchor-picker">
            <legend>{t('protect.allow')}</legend>
            {SWITCHES.map(([key]) => (
              <label key={key} className="choice">
                <input
                  type="checkbox"
                  checked={
                    key === 'print' ? draft.permissions.print !== 'none' : draft.permissions[key]
                  }
                  onChange={(event) => {
                    allow(key, event.target.checked);
                  }}
                />
                <span>{t(`protect.permissions.${key}`)}</span>
              </label>
            ))}
          </fieldset>
          {!restricted && (
            <label className="field">
              <span>{t('protect.owner')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={draft.ownerPassword}
                onChange={(event) => {
                  change({ ownerPassword: event.target.value });
                }}
              />
              <span className="muted">{t('protect.ownerHint')}</span>
            </label>
          )}
          <p className="warning">{t('protect.lost')}</p>
        </div>
      )}
    </fieldset>
  );
}
