import { useNavigate, Link } from 'react-router-dom';
import type { CSSProperties } from 'react';

// Переиспользуемая кнопка «назад». Фиксирована в левом верхнем углу,
// читается и на тёмном, и на светлом фоне страниц.
//   <BackButton to="/support" />   — явный родитель (предпочтительно)
//   <BackButton />                 — просто шаг назад по истории

const baseStyle: CSSProperties = {
  position: 'fixed',
  top: 20,
  left: 20,
  zIndex: 1000,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(17,19,24,0.82)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  color: '#cbd5e1',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'Mulish', system-ui, sans-serif",
  padding: '8px 14px',
  cursor: 'pointer',
  textDecoration: 'none',
  lineHeight: 1,
  boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
};

const hoverOn = (el: HTMLElement) => {
  el.style.borderColor = 'rgba(79,142,247,0.6)';
  el.style.color = '#fff';
};
const hoverOff = (el: HTMLElement) => {
  el.style.borderColor = 'rgba(255,255,255,0.14)';
  el.style.color = '#cbd5e1';
};

// In-flow вариант для встраивания в шапки/тулбары (без position:fixed).
const inlineStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  color: '#cbd5e1',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'Mulish', system-ui, sans-serif",
  padding: '8px 14px',
  cursor: 'pointer',
  textDecoration: 'none',
  lineHeight: 1,
  flexShrink: 0,
};

interface Props {
  /** Явный адрес назад. Если не задан — шаг назад по истории браузера. */
  to?: string;
  label?: string;
  /** Встроить в поток (без фиксированного позиционирования). */
  inline?: boolean;
}

export default function BackButton({ to, label = '← Назад', inline = false }: Props) {
  const navigate = useNavigate();

  const common = {
    style: inline ? inlineStyle : baseStyle,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => hoverOn(e.currentTarget),
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => hoverOff(e.currentTarget),
  };

  if (to) {
    return <Link to={to} {...common}>{label}</Link>;
  }
  return <button type="button" onClick={() => navigate(-1)} {...common}>{label}</button>;
}
