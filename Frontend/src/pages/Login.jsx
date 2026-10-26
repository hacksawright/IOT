import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LogIn,
  UserRound,
  Wifi,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import * as authApi from '../api/auth.api';
import './Login.css';

export default function Login() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [changeUsername, setChangeUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  if (user) {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const openPasswordDialog = () => {
    setChangeUsername(username.trim());
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setShowChangePassword(true);
  };

  const closePasswordDialog = () => {
    if (passwordBusy) return;
    setShowChangePassword(false);
    setPasswordError('');
    setPasswordSuccess('');
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setPasswordError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setPasswordBusy(true);
    let authenticated = false;
    try {
      // Endpoint đổi mật khẩu yêu cầu JWT; xác minh tài khoản trước khi gọi API này.
      await authApi.login(changeUsername.trim(), currentPassword);
      authenticated = true;
      await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess('Đổi mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.');
      setPassword('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.');
    } finally {
      if (authenticated) authApi.logout();
      setPasswordBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-visual-panel" aria-label="Giới thiệu IoT Control">
        <div className="login-brand" aria-label="IoT Control - Trang đăng nhập">
          <span className="login-brand__icon"><Wifi size={21} strokeWidth={2.5} /></span>
          <strong>IoT Control</strong>
        </div>

        <div className="login-hero">
          <p className="login-eyebrow">SMART PUMP <span>·</span> FIELD MONITORING</p>
          <h2>Giám sát bơm, node cảm biến và sức khỏe cây trồng trên một màn hình.</h2>
          <p className="login-hero__description">
            Theo dõi thiết bị theo thời gian thực, nhận cảnh báo ngưỡng và chẩn đoán bệnh lá bằng AI.
          </p>
        </div>
        <div className="login-visual-glow" aria-hidden="true" />
      </section>

      <section className="login-form-panel" aria-label="Đăng nhập hệ thống">
        <div className="login-form-content">
          <header className="login-form-header">
            <h1>Đăng nhập</h1>
            <p>Truy cập bảng điều khiển hệ thống.</p>
          </header>

          <form className="login-form" onSubmit={submit}>
            <label className="login-field">
              <span>TÊN ĐĂNG NHẬP</span>
              <div className="login-input-wrap">
                <UserRound size={17} aria-hidden="true" />
                <input
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Nhập tên đăng nhập hoặc email"
                  required
                  autoFocus
                />
              </div>
            </label>

            <label className="login-field">
              <span>MẬT KHẨU</span>
              <div className="login-input-wrap">
                <LockKeyhole size={17} aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Nhập mật khẩu"
                  required
                />
                <button
                  className="login-input-action"
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>

            {error && <div className="login-notice login-notice--error" role="alert"><AlertCircle size={16} />{error}</div>}

            <button className="login-primary-button" type="submit" disabled={busy}>
              {busy ? <span className="login-spinner" aria-hidden="true" /> : <LogIn size={16} />}
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>

            <button className="login-secondary-button" type="button" onClick={openPasswordDialog}>
              <KeyRound size={16} /> Đổi mật khẩu
            </button>
          </form>

          <p className="login-footnote">Sử dụng tài khoản được cấp bởi quản trị viên hệ thống.</p>
        </div>
      </section>

      {showChangePassword && (
        <div className="login-password-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closePasswordDialog(); }}>
          <section className="login-password-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
            <header className="login-password-dialog__header">
              <div>
                <h2 id="change-password-title">Đổi mật khẩu</h2>
                <p>Xác minh tài khoản bằng mật khẩu hiện tại trước khi cập nhật.</p>
              </div>
              <button className="login-dialog-close" type="button" onClick={closePasswordDialog} disabled={passwordBusy} aria-label="Đóng">
                <X size={19} />
              </button>
            </header>

            {passwordSuccess ? (
              <div className="login-notice login-notice--success" role="status"><CheckCircle2 size={17} />{passwordSuccess}</div>
            ) : (
              <form className="login-change-form" onSubmit={changePassword}>
                <label className="login-field">
                  <span>TÊN ĐĂNG NHẬP HOẶC EMAIL</span>
                  <div className="login-input-wrap">
                    <UserRound size={17} aria-hidden="true" />
                    <input autoComplete="username" value={changeUsername} onChange={(event) => setChangeUsername(event.target.value)} required />
                  </div>
                </label>
                <label className="login-field">
                  <span>MẬT KHẨU HIỆN TẠI</span>
                  <div className="login-input-wrap">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input type={showCurrentPassword ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                    <button className="login-input-action" type="button" onClick={() => setShowCurrentPassword((visible) => !visible)} aria-label={showCurrentPassword ? 'Ẩn mật khẩu hiện tại' : 'Hiện mật khẩu hiện tại'}>
                      {showCurrentPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
                <label className="login-field">
                  <span>MẬT KHẨU MỚI</span>
                  <div className="login-input-wrap">
                    <KeyRound size={17} aria-hidden="true" />
                    <input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
                    <button className="login-input-action" type="button" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}>
                      {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <small className="login-field-hint">Tối thiểu 8 ký tự.</small>
                </label>
                <label className="login-field">
                  <span>XÁC NHẬN MẬT KHẨU MỚI</span>
                  <div className="login-input-wrap">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
                  </div>
                </label>

                {passwordError && <div className="login-notice login-notice--error" role="alert"><AlertCircle size={16} />{passwordError}</div>}
                <button className="login-primary-button" type="submit" disabled={passwordBusy}>
                  {passwordBusy ? <span className="login-spinner" aria-hidden="true" /> : <KeyRound size={16} />}
                  {passwordBusy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
                </button>
              </form>
            )}
            {passwordSuccess && <button className="login-primary-button login-dialog-done" type="button" onClick={closePasswordDialog}>Đóng</button>}
          </section>
        </div>
      )}
    </main>
  );
}
