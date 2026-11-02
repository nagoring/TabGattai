import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { LanguageSetting, Settings, ThemeSetting } from '../../core/types';
import { useI18n } from '../../i18n';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onExport: () => void;
  onImport: (file: File, backupFirst: boolean) => Promise<void>;
  onClose: () => void;
}

export function SettingsPanel({ settings, onChange, onExport, onImport, onClose }: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupFirst, setBackupFirst] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await onImport(file, backupFirst);
    } finally {
      setBusy(false);
    }
  };

  const version = typeof chrome !== 'undefined' && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : '';

  return (
    <dialog ref={dialogRef} className="settings" aria-labelledby="settings-title" onClose={onClose} onCancel={onClose}>
      <div className="settings-header">
        <h2 id="settings-title">{t('settingsTitle')}</h2>
        <button type="button" className="icon-button" onClick={() => dialogRef.current?.close()} aria-label={t('close')}>×</button>
      </div>

      <fieldset>
        <legend>{t('sectionGeneral')}</legend>
        <label className="check">
          <input type="checkbox" checked={settings.includePinned} onChange={(e) => onChange({ includePinned: e.target.checked })} />
          {t('includePinned')}
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.removeOnRestore} onChange={(e) => onChange({ removeOnRestore: e.target.checked })} />
          {t('removeOnRestore')}
        </label>
        <label className="field">
          <span>{t('theme')}</span>
          <select value={settings.theme} onChange={(e) => onChange({ theme: e.target.value as ThemeSetting })}>
            <option value="system">{t('themeSystem')}</option>
            <option value="light">{t('themeLight')}</option>
            <option value="dark">{t('themeDark')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('language')}</span>
          <select value={settings.language} onChange={(e) => onChange({ language: e.target.value as LanguageSetting })}>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>{t('sectionData')}</legend>
        <div className="row">
          <button type="button" className="button" onClick={onExport}>{t('exportJson')}</button>
          <button type="button" className="button" disabled={busy} onClick={() => fileRef.current?.click()}>{t('importJson')}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleFile} />
        </div>
        <label className="check">
          <input type="checkbox" checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} />
          {t('backupBeforeImport')}
        </label>
      </fieldset>

      <fieldset>
        <legend>{t('sectionAbout')}</legend>
        <p className="note">{t('privacyNote')}</p>
        {version && <p className="note">{t('version', { version })}</p>}
      </fieldset>
    </dialog>
  );
}
