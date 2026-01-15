
import React from 'react';

// Glassmorphism Card
// Added onClick to props to support interactivity in history lists
export const GlassCard: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <div 
    className={`bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-xl p-6 ${className}`}
    onClick={onClick}
  >
    {children}
  </div>
);

// Primary Button
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }> = ({ 
  children, 
  variant = 'primary', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "px-6 py-3 rounded-xl font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]";
  
  const variants = {
    primary: "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/30",
    secondary: "bg-white/10 hover:bg-white/20 text-white border border-white/10",
    danger: "bg-red-500/80 hover:bg-red-500 text-white"
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

// Input Field
export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, className = '', ...props }) => (
  <div className="flex flex-col gap-2">
    <label className="text-sm font-medium text-gray-200 ml-1">{label}</label>
    <input 
      className={`bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all ${className}`}
      {...props} 
    />
  </div>
);

// Select/Radio Group simplified as grid
export const ScenarioSelector: React.FC<{ 
  options: { value: string; label: string; icon: string }[], 
  selected: string, 
  onChange: (val: string) => void 
}> = ({ options, selected, onChange }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        className={`p-3 rounded-xl border transition-all duration-300 flex flex-col items-center gap-2 text-sm
          ${selected === opt.value 
            ? 'bg-purple-600/40 border-purple-400/50 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)]' 
            : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10 hover:border-white/20'
          }
        `}
      >
        <span className="text-2xl">{opt.icon}</span>
        <span>{opt.label}</span>
      </button>
    ))}
  </div>
);

// Toggle Switch
export const Toggle: React.FC<{ 
  label: string; 
  checked: boolean; 
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ label, checked, onChange, disabled = false }) => (
  <div className={`flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-200">{label}</span>
      {disabled && <span className="text-xs bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded border border-indigo-500/30">Premium</span>}
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none
        ${checked ? 'bg-purple-600' : 'bg-gray-600'}
      `}
    >
      <div 
        className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300
          ${checked ? 'translate-x-6' : 'translate-x-0'}
        `}
      />
    </button>
  </div>
);

// Voice Selector
export const VoiceSelector: React.FC<{
  options: { value: string; label: string; gender: string }[];
  selected: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}> = ({ options, selected, onChange, disabled = false }) => (
  <div className={`space-y-2 ${disabled ? 'opacity-60 pointer-events-none select-none' : ''}`}>
    <div className="flex items-center gap-2 mb-2">
      <label className="text-sm font-medium text-gray-200 ml-1">Голос рассказчика</label>
      {disabled && <span className="text-xs bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded border border-indigo-500/30">Premium</span>}
    </div>
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => !disabled && onChange(opt.value)}
          className={`px-4 py-2 rounded-lg text-sm border transition-all
            ${selected === opt.value
              ? 'bg-indigo-600/50 border-indigo-400 text-white'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
            }
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

// Spinner
export const Spinner: React.FC = () => (
  <div className="flex items-center justify-center gap-2">
    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
    <span>Сочиняем...</span>
  </div>
);
