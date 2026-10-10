import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { FormFieldInfo, FormValue } from '@vidopdf/core';
import { useSession } from '../../state/session';

function asText(value: FormValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function asList(value: FormValue | undefined): string[] {
  return typeof value === 'object' ? [...value] : [];
}

/** One field, shown as the control that fits its kind. Read-only fields are shown but not editable. */
function Field({ sourceId, field }: { sourceId: string; field: FormFieldInfo }) {
  const id = useId();
  const typed = useSession((state) => state.session.workspace.forms[sourceId]?.[field.name]);
  const { setFormValue } = useSession.getState();
  const value = typed ?? field.value;
  const set = (next: FormValue) => {
    setFormValue(sourceId, field.name, next);
  };

  if (field.kind === 'checkbox') {
    return (
      <label className="choice">
        <input
          type="checkbox"
          disabled={field.readOnly}
          checked={value === true}
          onChange={(event) => {
            set(event.target.checked);
          }}
        />
        <span>{field.name}</span>
      </label>
    );
  }
  if (field.kind === 'radio') {
    return (
      <fieldset className="anchor-picker">
        <legend>{field.name}</legend>
        {field.options.map((option) => (
          <label key={option} className="choice">
            <input
              type="radio"
              name={id}
              disabled={field.readOnly}
              checked={value === option}
              onChange={() => {
                set(option);
              }}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.kind === 'dropdown' || field.kind === 'list') {
    const multiple = field.kind === 'list';
    return (
      <label className="field">
        <span>{field.name}</span>
        <select
          multiple={multiple}
          disabled={field.readOnly}
          value={multiple ? asList(value) : asText(value)}
          onChange={(event) => {
            const chosen = [...event.target.selectedOptions].map((option) => option.value);
            set(multiple ? chosen : (chosen[0] ?? ''));
          }}
        >
          {!multiple && <option value="" />}
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{field.name}</label>
      {field.multiline ? (
        <textarea
          id={id}
          rows={3}
          disabled={field.readOnly}
          value={asText(value)}
          onChange={(event) => {
            set(event.target.value);
          }}
        />
      ) : (
        <input
          id={id}
          type="text"
          disabled={field.readOnly}
          value={asText(value)}
          onChange={(event) => {
            set(event.target.value);
          }}
        />
      )}
    </div>
  );
}

/** The forms of the loaded files: fill them here, and choose to keep them fillable or flatten. */
export function FormsPanel() {
  const { t } = useTranslation();
  const sources = useSession((state) => state.session.workspace.sources);
  const forms = useSession((state) => state.forms);
  const mode = useSession((state) => state.session.workspace.formMode);
  const { loadForms, setFormMode } = useSession.getState();
  useEffect(() => {
    void loadForms();
  }, [sources, loadForms]);

  const withForm = sources.filter((source) => (forms[source.id]?.fields.length ?? 0) > 0);
  const xfa = sources.filter((source) => forms[source.id]?.hasXfa === true);
  return (
    <fieldset className="stamp-form">
      <legend>{t('document.forms.title')}</legend>
      {withForm.length === 0 && <p className="muted">{t('document.forms.none')}</p>}
      {xfa.length > 0 && (
        <p className="warning">
          {t('document.forms.xfa', { names: xfa.map((s) => s.name).join(', ') })}
        </p>
      )}
      {withForm.map((source) => {
        const info = forms[source.id];
        return (
          <fieldset key={source.id} className="stamp-form">
            <legend>{source.name}</legend>
            <div className="stamp-fields">
              {info?.fields.map((field) => (
                <Field key={field.name} sourceId={source.id} field={field} />
              ))}
              {(info?.skipped ?? 0) > 0 && (
                <p className="muted">
                  {t('document.forms.skipped', { count: info?.skipped ?? 0 })}
                </p>
              )}
            </div>
          </fieldset>
        );
      })}
      {withForm.length > 0 && (
        <label className="choice">
          <input
            type="checkbox"
            checked={mode === 'flatten'}
            onChange={(event) => {
              setFormMode(event.target.checked ? 'flatten' : 'keep');
            }}
          />
          <span>{t('document.forms.flatten')}</span>
        </label>
      )}
      <p className="muted">{t('document.forms.hint')}</p>
    </fieldset>
  );
}
