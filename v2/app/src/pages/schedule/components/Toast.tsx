import React from 'react';

interface ToastProps {
  message: string;
  type: 'ok' | 'err';
  show: boolean;
}

const Toast: React.FC<ToastProps> = ({ message, type, show }) => {
  return (
    <div className={`toast${show ? ' show' : ''} ${type === 'ok' ? 'ok' : 'err'}`}>
      {message}
    </div>
  );
};

export default React.memo(Toast);
