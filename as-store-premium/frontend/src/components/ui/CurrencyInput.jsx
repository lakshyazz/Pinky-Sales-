import React from 'react';

/**
 * Standardized CurrencyInput component following the application design system.
 * - Structured absolute-positioned prefix adornment (₹)
 * - Strict font-mono tabular-nums alignment
 * - Resilient flex/shrink boundaries
 * - High-contrast dark mode support
 * - Warning/guardrail border support
 */
const CurrencyInput = React.forwardRef(function CurrencyInput({
  value,
  onChange,
  placeholder = '0.00',
  disabled = false,
  min = 0,
  max,
  step = '0.01',
  prefix = '₹',
  isWarning = false,
  warningMessage,
  className = '',
  inputClassName = '',
  size = 'md', // 'sm' | 'md' | 'lg'
  name,
  id,
  ...props
}, ref) {
  const sizeClasses = {
    sm: {
      height: 'h-8 text-xs',
      prefixLeft: 'left-2 text-[11px]',
      padding: 'pl-5 pr-2',
    },
    md: {
      height: 'h-10 text-xs',
      prefixLeft: 'left-2.5 text-xs',
      padding: 'pl-6 pr-2.5',
    },
    lg: {
      height: 'h-11 text-sm',
      prefixLeft: 'left-3 text-sm',
      padding: 'pl-7 pr-3',
    },
  }[size] || {
    height: 'h-10 text-xs',
    prefixLeft: 'left-2.5 text-xs',
    padding: 'pl-6 pr-2.5',
  };

  return (
    <div className={`relative flex flex-col ${className}`}>
      <div className="relative flex items-center w-full">
        <span
          className={`absolute ${sizeClasses.prefixLeft} text-zinc-400 dark:text-zinc-500 font-mono font-medium pointer-events-none select-none shrink-0`}
        >
          {prefix}
        </span>
        <input
          ref={ref}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          name={name}
          id={id}
          className={`w-full ${sizeClasses.height} ${sizeClasses.padding} font-mono font-semibold text-right bg-white dark:bg-zinc-900 border rounded-lg text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-hidden transition-colors ${
            isWarning
              ? 'border-amber-400 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 focus:border-amber-500'
              : 'border-zinc-200 dark:border-zinc-800 focus:border-violet-500 dark:focus:border-violet-400'
          } ${disabled ? 'opacity-50 cursor-not-allowed bg-zinc-50 dark:bg-zinc-800/50' : ''} ${inputClassName}`}
          {...props}
        />
      </div>
      {isWarning && warningMessage && (
        <span className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 text-right truncate">
          {warningMessage}
        </span>
      )}
    </div>
  );
});

export default CurrencyInput;
