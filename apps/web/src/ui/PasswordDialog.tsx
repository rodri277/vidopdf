import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../state/session';
import { Modal } from './Modal';

/**
 * Asks for the password of a protected file, one file at a time. The password goes to the
 * workers that open the file and is not kept anywhere else; it is lost when the file is released.
 */
export function PasswordDialog() {
  const { t } = useTranslation();
  const request = useSession((state) => state.passwordRequests[0]);
  const { submitPassword, skipPassword } = useSession.getState();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (request === undefined) return null;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    void submitPassword(request.id, password).finally(() => {
      setBusy(false);
      setPassword('');
    });
  };
  return (
    <Modal
      open
      labelledBy="password-title"
      onClose={() => {
        skipPassword(request.id);
      }}
      className="password-dialog"
    >
      <form onSubmit={submit}>
        <h2 id="password-title">{t('password.title')}</h2>
        <p className="mono result-name">{request.file.name}</p>
        <p>{t('password.hint')}</p>
        <label className="field">
          <span>{t('password.label')}</span>
          <input
            type="password"
            value={password}
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the one thing this dialog asks for
            autoFocus
            aria-invalid={request.wrong}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        {request.wrong && <p role="alert">{t('password.wrong')}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              skipPassword(request.id);
            }}
          >
            {t('password.skip')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || password === ''}>
            {t('password.open')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
