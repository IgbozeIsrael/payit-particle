import React, { ReactNode } from 'react';

/* ── PayIT Brand Colors ──────────────────────────────────────── */
export const COLORS = {
  INK: '#0F172A',        // Dark text/backgrounds
  FOREST: '#047857',     // Primary actions
  EMERALD: '#10B981',    // Success/highlights
  EML: '#5EEAB0',        // Accents/badges
  MIST: '#E5E7EB',       // Borders/dividers
  MINT: '#ECFDF5',       // Light backgrounds
  SLATE: '#64748B',      // Secondary text
  WHITE: '#FFFFFF',      // White
  RED: '#DC2626',        // Error
};

/* ── Design System ───────────────────────────────────────────── */
const SHADOW = '0 4px 12px rgba(15, 23, 42, 0.12)';
const SHADOW_LG = '0 8px 16px rgba(15, 23, 42, 0.16)';
const RADIUS = '8px';
const ANIMATION = '0.3s ease';

/* ── PrimaryButton ───────────────────────────────────────────── */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const PrimaryButton: React.FC<ButtonProps> = ({
  children,
  fullWidth = false,
  size = 'md',
  loading = false,
  disabled,
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      disabled={disabled || loading}
      style={{
        width: fullWidth ? '100%' : 'auto',
        minHeight: '44px',
        backgroundColor: disabled ? COLORS.MIST : COLORS.FOREST,
        color: COLORS.WHITE,
        border: 'none',
        borderRadius: RADIUS,
        fontWeight: '600',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: `all ${ANIMATION}`,
        boxShadow: SHADOW,
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}
      className={sizeStyles[size]}
      {...props}
    >
      {loading && (
        <span
          style={{
            display: 'inline-block',
            width: '16px',
            height: '16px',
            border: `2px solid ${COLORS.WHITE}`,
            borderTop: `2px solid transparent`,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
};

/* ── SecondaryButton ─────────────────────────────────────────── */
export const SecondaryButton: React.FC<ButtonProps> = ({
  children,
  fullWidth = false,
  size = 'md',
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      style={{
        width: fullWidth ? '100%' : 'auto',
        minHeight: '44px',
        backgroundColor: COLORS.WHITE,
        color: COLORS.FOREST,
        border: `2px solid ${COLORS.FOREST}`,
        borderRadius: RADIUS,
        fontWeight: '600',
        cursor: 'pointer',
        transition: `all ${ANIMATION}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
      }}
      className={sizeStyles[size]}
      {...props}
    >
      {children}
    </button>
  );
};

/* ── CardContainer ──────────────────────────────────────────── */
interface CardProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export const CardContainer: React.FC<CardProps> = ({ children, onClick, className = '' }) => {
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: COLORS.MINT,
        border: `1px solid ${COLORS.MIST}`,
        borderRadius: RADIUS,
        padding: '16px',
        boxShadow: SHADOW,
        transition: `all ${ANIMATION}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = SHADOW_LG;
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = SHADOW;
          (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        }
      }}
      className={className}
    >
      {children}
    </div>
  );
};

/* ── BadgeComponent ─────────────────────────────────────────── */
interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export const BadgeComponent: React.FC<BadgeProps> = ({ children, variant = 'default' }) => {
  const variants = {
    default: { bg: COLORS.EML, text: COLORS.INK },
    success: { bg: COLORS.EMERALD, text: COLORS.WHITE },
    warning: { bg: '#F59E0B', text: COLORS.WHITE },
    error: { bg: COLORS.RED, text: COLORS.WHITE },
  };

  const style = variants[variant];

  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: style.bg,
        color: style.text,
        padding: '4px 12px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '600',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
};

/* ── GradientHeader ─────────────────────────────────────────── */
interface HeaderProps {
  children: ReactNode;
  className?: string;
}

export const GradientHeader: React.FC<HeaderProps> = ({ children, className = '' }) => {
  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${COLORS.FOREST} 0%, ${COLORS.EMERALD} 100%)`,
        padding: '24px 16px',
        borderRadius: '0 0 12px 12px',
        color: COLORS.WHITE,
      }}
      className={className}
    >
      {children}
    </div>
  );
};

/* ── StatusIndicator ────────────────────────────────────────── */
interface StatusProps {
  status: 'verified' | 'pending' | 'unverified' | 'error';
  label?: string;
}

export const StatusIndicator: React.FC<StatusProps> = ({ status, label }) => {
  const statusConfig = {
    verified: { color: COLORS.EMERALD, label: 'Verified' },
    pending: { color: '#F59E0B', label: 'Pending' },
    unverified: { color: COLORS.SLATE, label: 'Unverified' },
    error: { color: COLORS.RED, label: 'Error' },
  };

  const config = statusConfig[status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        backgroundColor: `${config.color}20`,
        border: `1px solid ${config.color}40`,
        borderRadius: '6px',
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: config.color,
        }}
      />
      <span style={{ fontSize: '14px', fontWeight: '500', color: COLORS.INK }}>
        {label || config.label}
      </span>
    </div>
  );
};

/* ── Input Component ────────────────────────────────────────– */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, icon, ...props }) => {
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <label
          style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '600',
            color: COLORS.INK,
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <div
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            {icon}
          </div>
        )}
        <input
          style={{
            width: '100%',
            minHeight: '44px',
            padding: icon ? '10px 12px 10px 36px' : '10px 12px',
            border: `1px solid ${error ? COLORS.RED : COLORS.MIST}`,
            borderRadius: RADIUS,
            fontSize: '16px',
            color: COLORS.INK,
            backgroundColor: COLORS.WHITE,
            transition: `all ${ANIMATION}`,
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = COLORS.FOREST;
            (e.target as HTMLInputElement).style.boxShadow = `0 0 0 3px ${COLORS.MINT}`;
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor = error ? COLORS.RED : COLORS.MIST;
            (e.target as HTMLInputElement).style.boxShadow = 'none';
          }}
          {...props}
        />
      </div>
      {error && (
        <span style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: COLORS.RED }}>
          {error}
        </span>
      )}
    </div>
  );
};

/* ── Modal Component ────────────────────────────────────────– */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxHeight: '90vh',
          backgroundColor: COLORS.WHITE,
          borderRadius: '12px 12px 0 0',
          padding: '24px 16px',
          overflowY: 'auto',
          animation: `slideUp ${ANIMATION}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h2
            style={{
              margin: '0 0 16px 0',
              fontSize: '20px',
              fontWeight: '700',
              color: COLORS.INK,
            }}
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
};

/* ── Global Styles Injection ────────────────────────────────── */
export const injectGlobalStyles = () => {
  if (typeof document === 'undefined') return;

  const styleId = 'payit-global-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    * {
      -webkit-tap-highlight-color: transparent;
    }
  `;
  document.head.appendChild(style);
};
