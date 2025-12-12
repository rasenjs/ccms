import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface InputDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const InputDialog: React.FC<InputDialogProps> = ({
  isOpen,
  title,
  message,
  placeholder,
  defaultValue = '',
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="dialog-overlay" onKeyDown={handleKeyDown}>
      <div className="dialog-content">
        <h3>{title}</h3>
        <p>{message}</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
          <div className="dialog-buttons">
            <button type="button" onClick={onCancel} className="btn-cancel">
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-confirm">
              {t('common.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
