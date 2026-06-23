import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const ALLOWED_DOMAINS = ['velvix.org', 'gameup.club'];

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') || '/';

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [codeError, setCodeError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    fetch('/api/check', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.ok) navigate(redirect, { replace: true }); })
      .catch(() => {});
  }, [navigate, redirect]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function startCountdown() {
    setCountdown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function sendCode() {
    setEmailError('');
    const e = email.trim().toLowerCase();
    if (!e || !ALLOWED_DOMAINS.some(d => e.endsWith('@' + d))) {
      setEmailError('Введите корректный корпоративный адрес (@velvix.org или @gameup.club)');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStep('code');
        startCountdown();
        setTimeout(() => digitRefs.current[0]?.focus(), 50);
      } else {
        setEmailError(data.error || 'Не удалось отправить код. Попробуйте ещё раз.');
      }
    } catch {
      setEmailError('Ошибка сети. Проверьте соединение.');
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    setCodeError('');
    const c = code.join('');
    if (c.length !== 6) return;
    setVerifying(true);
    try {
      const res = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: c }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        navigate(redirect, { replace: true });
      } else {
        setCodeError(data.error || 'Неверный код. Попробуйте ещё раз.');
        setCode(['', '', '', '', '', '']);
        digitRefs.current[0]?.focus();
      }
    } catch {
      setCodeError('Ошибка сети. Проверьте соединение.');
    } finally {
      setVerifying(false);
    }
  }

  async function resendCode() {
    setCodeError('');
    try {
      const res = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCode(['', '', '', '', '', '']);
        startCountdown();
      } else {
        setCodeError(data.error || 'Не удалось отправить код.');
      }
    } catch {
      setCodeError('Ошибка сети.');
    }
  }

  function handleDigit(i: number, val: string) {
    const v = val.replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[i] = v;
    setCode(next);
    if (v && i < 5) digitRefs.current[i + 1]?.focus();
  }

  function handleDigitKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      const next = [...code];
      next[i - 1] = '';
      setCode(next);
      digitRefs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = Array(6).fill('').map((_, i) => pasted[i] || '');
    setCode(next);
    if (pasted.length >= 6) digitRefs.current[5]?.focus();
  }

  const codeComplete = code.every(d => d);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', fontFamily: "'Mulish', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@300;400;700&family=Mulish:wght@300;400;600&display=swap" rel="stylesheet" />

      {/* grid bg */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', width: 600, height: 600, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.12, background: 'var(--accent)', top: -200, left: -100, pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', width: 600, height: 600, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.12, background: '#34d399', bottom: -200, right: -100, pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420 }}>
        {/* logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,var(--accent),#34d399)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡</div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 700, color: '#fff' }}>Support<span style={{ color: 'var(--accent)' }}>CIS</span></div>
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, fontWeight: 300, background: 'linear-gradient(90deg,var(--accent),#34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '0.22em', textTransform: 'uppercase' }}>Внутренний портал команды</div>
        </div>

        {/* card */}
        <div style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '40px 36px', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg,transparent,var(--accent),transparent)', opacity: 0.6 }} />

          {step === 'email' ? (
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20, background: 'rgba(79,142,247,0.18)', color: 'var(--accent)', marginBottom: 20 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'pulse 2s ease infinite', display: 'inline-block' }} />
                Авторизация
              </div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Вход в портал</div>
              <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 28 }}>
                Введите корпоративный email — мы отправим одноразовый код для входа.
              </p>
              <label style={{ display: 'block', fontFamily: "'Unbounded', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Корпоративный email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendCode()}
                placeholder="name@velvix.org"
                autoComplete="email"
                style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', fontSize: 15, padding: '13px 16px', outline: 'none', fontFamily: "'Mulish', sans-serif" }}
              />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Используйте корпоративный адрес @velvix.org или @gameup.club</div>
              {emailError && <div style={{ fontSize: 12, color: '#f87171', marginTop: 10 }}>{emailError}</div>}
              <button
                onClick={sendCode}
                disabled={sending}
                style={{ width: '100%', marginTop: 24, padding: 14, background: sending ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,var(--accent),#3a7bd5)', border: 'none', borderRadius: 12, color: '#fff', fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: sending ? 'not-allowed' : 'pointer' }}
              >
                {sending ? '...' : 'Получить код'}
              </button>
            </div>
          ) : (
            <div>
              <button onClick={() => { setStep('email'); setCode(['','','','','','']); setCodeError(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 24, fontFamily: "'Mulish', sans-serif" }}>← Назад</button>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20, background: 'rgba(79,142,247,0.18)', color: 'var(--accent)', marginBottom: 20 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                Подтверждение
              </div>
              <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Введите код</div>
              <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7, marginBottom: 28 }}>
                Мы отправили 6-значный код на <strong style={{ color: 'var(--text)' }}>{email}</strong>.
              </p>
              <label style={{ display: 'block', fontFamily: "'Unbounded', sans-serif", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Код доступа</label>
              <div style={{ display: 'flex', gap: 8 }} onPaste={handlePaste}>
                {code.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { digitRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleDigitKey(i, e)}
                    style={{ width: '100%', textAlign: 'center', fontSize: 22, fontWeight: 600, padding: '14px 4px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', outline: 'none', fontFamily: "'Mulish', sans-serif" }}
                  />
                ))}
              </div>
              {codeError && <div style={{ fontSize: 12, color: '#f87171', marginTop: 10 }}>{codeError}</div>}
              <div style={{ marginTop: 16, fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {countdown > 0 ? <span>Повторно через {countdown}с</span> : <span />}
                <button
                  onClick={resendCode}
                  disabled={countdown > 0}
                  style={{ background: 'none', border: 'none', color: countdown > 0 ? 'var(--muted)' : 'var(--accent)', fontFamily: "'Mulish', sans-serif", fontSize: 13, cursor: countdown > 0 ? 'default' : 'pointer', padding: 0 }}
                >
                  Отправить снова
                </button>
              </div>
              <button
                onClick={verifyCode}
                disabled={!codeComplete || verifying}
                style={{ width: '100%', marginTop: 24, padding: 14, background: (!codeComplete || verifying) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,var(--accent),#3a7bd5)', border: (!codeComplete || verifying) ? '1px solid var(--border)' : 'none', borderRadius: 12, color: (!codeComplete || verifying) ? 'var(--muted)' : '#fff', fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (!codeComplete || verifying) ? 'not-allowed' : 'pointer' }}
              >
                {verifying ? '...' : 'Войти'}
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>© 2026 Velvix · Внутреннее использование</div>
      </div>
    </div>
  );
}
