import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { revertVideoEdit } from '../../utils/api';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
export default function RevertVideoButton({
  videoId,
  onReverted,
  disabled = false,
}: {
  videoId: string;
  onReverted: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div>
      <Button
        label={t('videoEdit.revert')}
        type={busy || disabled ? ButtonType.disabled : ButtonType.secondary}
        onClick={async () => {
          if (!window.confirm(t('videoEdit.revertConfirm'))) return;
          setBusy(true);
          setError('');
          try {
            const response = await revertVideoEdit(videoId);
            if (response.ok) onReverted();
            else
              setError(
                response.status === 403
                  ? t('videonotallowedit')
                  : response.status === 409
                    ? t('videoEdit.conflict')
                    : t('videoEdit.requestFailed'),
              );
          } catch {
            setError(t('videoEdit.requestFailed'));
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
