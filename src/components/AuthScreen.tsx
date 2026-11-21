import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RotateCcw,
  ShieldCheck,
  User,
} from 'lucide-react';
import { AppUser, ManagerDepartment, UserRole } from '../types';
import { hashPassword, identifiersMatch, normalizeEmail, normalizePhone, validatePassword } from '../utils/auth';
import { generateId, getTodayIso } from '../utils/helpers';

interface AuthScreenProps {
  users: AppUser[];
  onLoginSuccess: (userId: string) => void;
  onRegisterUser: (newUser: AppUser) => void;
  onUpdatePassword: (userId: string, newPasswordHash: string) => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  users,
  onLoginSuccess,
  onRegisterUser,
  onUpdatePassword,
}) => {
  const today = getTodayIso();
  const [mode, setMode] = useState<AuthMode>('signin');

  // Sign In state
  const [signInIdentifier, setSignInIdentifier] = useState<string>('');
  const [signInPassword, setSignInPassword] = useState<string>('');
  const [showSignInPassword, setShowSignInPassword] = useState<boolean>(false);

  // Sign Up state
  const [signUpName, setSignUpName] = useState<string>('');
  const [signUpEmail, setSignUpEmail] = useState<string>('');
  const [signUpPhone, setSignUpPhone] = useState<string>('');
  const [signUpPassword, setSignUpPassword] = useState<string>('');
  const [showSignUpPassword, setShowSignUpPassword] = useState<boolean>(false);
  const [signUpRoleChoice, setSignUpRoleChoice] = useState<UserRole>('Employee');
  const [signUpDepartment, setSignUpDepartment] = useState<ManagerDepartment>('Sales Manager');

  // Forgot Password state
  const [forgotIdentifier, setForgotIdentifier] = useState<string>('');
  const [forgotNewPassword, setForgotNewPassword] = useState<string>('');
  const [showForgotNewPassword, setShowForgotNewPassword] = useState<boolean>(false);

  // 2-Step OTP state
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [maskedEmail, setMaskedEmail] = useState<string>('');
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string>('');
  const [userEnteredOtp, setUserEnteredOtp] = useState<string>('');
  const [pendingSignupUser, setPendingSignupUser] = useState<AppUser | null>(null);
  const [pendingForgotUserId, setPendingForgotUserId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setOtpSent(false);
    setErrorMsg('');
    setSuccessMsg('');
    setUserEnteredOtp('');
    setMaskedEmail('');
    setPendingVerifyEmail('');
    setPendingSignupUser(null);
    setPendingForgotUserId(null);
    setShowSignInPassword(false);
    setShowSignUpPassword(false);
    setShowForgotNewPassword(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setShowSignInPassword(false);

    const identifier = signInIdentifier.trim();
    if (!identifier || !signInPassword) {
      setErrorMsg('Please enter your email or phone and password.');
      return;
    }

    const matchedUser = users.find((u) => identifiersMatch(u.email, u.phone, identifier));
    if (!matchedUser) {
      setErrorMsg('Account not found. Please sign up or check your email/phone.');
      return;
    }

    if (matchedUser.status === 'Suspended') {
      setErrorMsg('Your account has been suspended. Please contact the administrator.');
      return;
    }

    const hashedInput = await hashPassword(signInPassword);
    if (hashedInput !== matchedUser.passwordHash) {
      setErrorMsg('Incorrect password. Please try again.');
      return;
    }

    onLoginSuccess(matchedUser.id);
  };

  const handleSendOtpForSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setShowSignUpPassword(false);

    const name = signUpName.trim();
    const email = normalizeEmail(signUpEmail);
    const phone = normalizePhone(signUpPhone);

    if (!name) {
      setErrorMsg('Full name is required.');
      return;
    }
    if (!email || !email.includes('@')) {
      setErrorMsg('A valid email address is required for registration and OTP verification.');
      return;
    }
    if (!validatePassword(signUpPassword)) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    const existing = users.find(
      (u) =>
        (email && normalizeEmail(u.email) === email) ||
        (phone && users.some((x) => identifiersMatch(x.email, x.phone, phone)))
    );
    if (existing) {
      setErrorMsg('An account with this email or phone number already exists. Please sign in.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send verification code.');
      }

      const passwordHash = await hashPassword(signUpPassword);
      const isManagerReq = signUpRoleChoice === 'Manager';

      const newUser: AppUser = {
        id: generateId('usr'),
        fullName: name,
        email,
        phone,
        passwordHash,
        role: 'Employee',
        requestedRole: isManagerReq ? 'Manager' : undefined,
        requestedDepartment: isManagerReq ? signUpDepartment : undefined,
        verified: false,
        status: 'Active',
        createdAt: today,
      };

      setPendingSignupUser(newUser);
      setPendingVerifyEmail(email);
      setMaskedEmail(data.maskedEmail || email);
      setOtpSent(true);
      setUserEnteredOtp('');
      setSuccessMsg(`A 6-digit verification code has been sent to ${data.maskedEmail || email}.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpForSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const code = userEnteredOtp.trim();
    if (!code || code.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }
    if (!pendingSignupUser || !pendingVerifyEmail) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerifyEmail, code }),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        throw new Error(data.error || 'Invalid or expired verification code.');
      }

      const verifiedUser: AppUser = {
        ...pendingSignupUser,
        verified: true,
      };

      onRegisterUser(verifiedUser);
      onLoginSuccess(verifiedUser.id);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtpForForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setShowForgotNewPassword(false);

    const identifier = forgotIdentifier.trim();
    if (!identifier) {
      setErrorMsg('Please enter your registered email or phone.');
      return;
    }

    const matchedUser = users.find((u) => identifiersMatch(u.email, u.phone, identifier));
    if (!matchedUser) {
      setErrorMsg('No account found matching this email or phone.');
      return;
    }

    if (!matchedUser.email || !matchedUser.email.includes('@')) {
      setErrorMsg('This account does not have an email address on file for password reset. Please contact admin.');
      return;
    }

    if (!validatePassword(forgotNewPassword)) {
      setErrorMsg('New password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: matchedUser.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send OTP.');
      }

      setPendingForgotUserId(matchedUser.id);
      setPendingVerifyEmail(matchedUser.email);
      setMaskedEmail(data.maskedEmail || matchedUser.email);
      setOtpSent(true);
      setUserEnteredOtp('');
      setSuccessMsg(`Password reset code sent to ${data.maskedEmail || matchedUser.email}.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send reset code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtpForForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const code = userEnteredOtp.trim();
    if (!code || code.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }
    if (!pendingForgotUserId || !pendingVerifyEmail) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerifyEmail, code }),
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        throw new Error(data.error || 'Invalid or expired verification code.');
      }

      const newHash = await hashPassword(forgotNewPassword);
      onUpdatePassword(pendingForgotUserId, newHash);
      setSuccessMsg('Password successfully updated! You can now sign in.');
      setOtpSent(false);
      setMode('signin');
      setForgotIdentifier('');
      setForgotNewPassword('');
      setUserEnteredOtp('');
      setMaskedEmail('');
      setPendingVerifyEmail('');
      setShowForgotNewPassword(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setErrorMsg('');
    if (!pendingVerifyEmail) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingVerifyEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`New verification code sent to ${maskedEmail || pendingVerifyEmail}.`);
      } else {
        setErrorMsg(data.error || 'Failed to resend code.');
      }
    } catch {
      setErrorMsg('Failed to resend code.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-600/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Lewis Sales Assistant
          </h1>
          <p className="text-xs text-slate-400">
            Commercial Fleet &amp; Cold-Chain Field CRM Security Portal
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        {!otpSent && (
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                mode === 'signin'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                mode === 'signup'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors ${
                mode === 'forgot'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Reset
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-950/70 border border-red-800 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && !otpSent && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* STEP 2: OTP VERIFICATION BOX */}
        {otpSent ? (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-blue-950/70 border border-blue-800/80 space-y-2 text-center">
              <p className="text-xs font-semibold text-blue-200">
                A 6-digit verification code has been sent to <span className="font-bold text-white">{maskedEmail}</span>. Please check your inbox and spam folder.
              </p>
            </div>

            <form
              onSubmit={
                mode === 'signup' ? handleVerifyOtpForSignup : handleVerifyOtpForForgot
              }
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 text-center">
                  Enter 6-Digit OTP Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  required
                  value={userEnteredOtp}
                  onChange={(e) => setUserEnteredOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="000000"
                  className="w-full min-h-[52px] px-4 text-center font-mono tracking-[0.3em] text-xl bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20"
              >
                {mode === 'signup' ? 'Verify & Complete Registration' : 'Verify & Reset Password'}
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResendCode}
                  className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resend Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Edit Details
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* SIGN IN FORM */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Email or Phone Number
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={signInIdentifier}
                      onChange={(e) => setSignInIdentifier(e.target.value)}
                      placeholder="lewis.jmsjb@gmail.com or phone"
                      className="w-full min-h-[46px] pl-10 pr-4 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showSignInPassword ? 'text' : 'password'}
                      required
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[46px] pl-10 pr-12 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignInPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                      aria-label="Toggle password visibility"
                    >
                      {showSignInPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20"
                >
                  Sign In
                </button>
              </form>
            )}

            {/* REGISTER FORM */}
            {mode === 'signup' && (
              <form onSubmit={handleSendOtpForSignup} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name *</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      placeholder="e.g., Alex Tan"
                      className="w-full min-h-[44px] pl-10 pr-4 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      placeholder="alex@alpha-ref.sg"
                      className="w-full min-h-[44px] px-3 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      placeholder="+65 9123 4567"
                      className="w-full min-h-[44px] px-3 text-sm font-mono bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Password (≥ 6 characters) *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showSignUpPassword ? 'text' : 'password'}
                      required
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full min-h-[44px] pl-10 pr-12 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignUpPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                      aria-label="Toggle password visibility"
                    >
                      {showSignUpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Register Role</label>
                    <select
                      value={signUpRoleChoice}
                      onChange={(e) => setSignUpRoleChoice(e.target.value as UserRole)}
                      className="w-full min-h-[44px] px-3 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white"
                    >
                      <option value="Employee">Employee</option>
                      <option value="Manager">Manager Request</option>
                    </select>
                  </div>

                  {signUpRoleChoice === 'Manager' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Department</label>
                      <select
                        value={signUpDepartment}
                        onChange={(e) => setSignUpDepartment(e.target.value as ManagerDepartment)}
                        className="w-full min-h-[44px] px-3 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white"
                      >
                        <option value="Sales Manager">Sales Manager</option>
                        <option value="Marketing Manager">Marketing Manager</option>
                        <option value="HR Manager">HR Manager</option>
                        <option value="Accountant">Accountant</option>
                        <option value="Customer Follow-Up Manager">Customer Follow-Up Manager</option>
                      </select>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Send Verification Code</span>
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD FORM */}
            {mode === 'forgot' && (
              <form onSubmit={handleSendOtpForForgot} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Registered Email or Phone
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder="lewis.jmsjb@gmail.com or phone"
                    className="w-full min-h-[44px] px-3 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    New Password (≥ 6 characters)
                  </label>
                  <div className="relative">
                    <input
                      type={showForgotNewPassword ? 'text' : 'password'}
                      required
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="New secure password"
                      className="w-full min-h-[44px] px-3 pr-12 text-sm bg-slate-900 border border-slate-700 rounded-xl text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotNewPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                      aria-label="Toggle password visibility"
                    >
                      {showForgotNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Send Verification Code</span>
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
